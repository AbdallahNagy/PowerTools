using System.Security.Cryptography;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Solutions;

/// <summary>
/// Plans solution_import. The plan is the import of one file, always destructive, because an import can overwrite
/// customizations. The step detail names the file's SHA-256 and every option, so the approved hash covers exactly
/// that file and those values. One path for online and on-premises: ExecuteAsync with ImportSolutionRequest, polled
/// through asyncoperation and importjob. The publish lock is held from the second plan until verification, so an
/// import never starts while Power Tools publishes on the same environment.
/// </summary>
public sealed class SolutionImportPlanner(
    Func<string, byte[]>? readFile = null,
    Func<TimeSpan, CancellationToken, Task>? delay = null,
    TimeSpan? pollInterval = null) : IComponentPlanner<SolutionImportSpec>
{
    public const string Family = "solution_import";

    private readonly Func<string, byte[]> readFile = readFile ?? File.ReadAllBytes;

    /// <summary>Verification checks what is installed, so it ignores force.</summary>
    public static SolutionImportSpec ForVerification(SolutionImportSpec spec) => new()
    {
        Path = spec.Path,
        Mode = spec.Mode,
        OverwriteUnmanagedCustomizations = spec.OverwriteUnmanagedCustomizations,
        PublishWorkflows = spec.PublishWorkflows,
        Force = false,
        EnvironmentVariables = spec.EnvironmentVariables,
        ConnectionReferences = spec.ConnectionReferences,
    };

    public async Task<Plan> PlanAsync(SolutionImportSpec spec, PlanContext context, CancellationToken ct)
    {
        var file = Read(spec.Path);
        var hash = Convert.ToHexStringLower(SHA256.HashData(file));
        var zip = SolutionZip.Read(file);
        var name = zip.UniqueName;
        var mode = spec.Mode ?? ImportMode.Update;
        var lockKeys = new[] { Locks.PublishKey(context.ConnectionKey), $"solution:{name.ToLowerInvariant()}" };
        var warnings = new List<string>();

        var installed = await InstalledAsync(context.Client, name, ct);
        var holding = mode == ImportMode.Stage ? await InstalledAsync(context.Client, $"{name}_Upgrade", ct) : null;
        var kind = zip.Managed ? "managed" : "unmanaged";
        Plan Blocked(string reason) => new([PlanStep.Blocked("importSolution", name, reason)], warnings, lockKeys);

        if (mode != ImportMode.Update && !zip.Managed)
            return Blocked($"Mode {Mode(mode)} is for managed solutions, and {name} {zip.Version} in the file is unmanaged. Use mode update.");
        if (installed is not null && installed.Managed != zip.Managed)
        {
            return Blocked(
                $"{name} is installed as {(installed.Managed ? "managed" : "unmanaged")} and the file is {kind}. Dataverse cannot import one over the other; remove the installed solution first.");
        }

        var order = Compare(zip.Version, installed?.Version);
        var done = (installed is not null && order == 0)
            || (mode == ImportMode.Stage && holding is not null && Compare(zip.Version, holding.Version) == 0);
        if (done && spec.Force != true) return new Plan([], warnings, lockKeys);

        if (mode != ImportMode.Update && installed is null)
            return Blocked($"{name} is not installed, so there is nothing to {Mode(mode)}. Use mode update.");

        if (installed is not null && zip.Managed && order < 0)
            return Blocked($"{name} {installed.Version} is installed and the file is the older {zip.Version}. A managed solution cannot be downgraded.");
        if (mode != ImportMode.Update && order <= 0)
            return Blocked($"Mode {Mode(mode)} needs a newer version than the installed {installed!.Version}; the file is {zip.Version}.");
        if (installed is not null && !zip.Managed && order < 0)
            warnings.Add($"The file has {name} {zip.Version}, older than the installed {installed.Version}.");

        var steps = new List<PlanStep>();
        var parameters = new EntityCollection();
        foreach (var (schemaName, value) in Sorted(spec.EnvironmentVariables))
        {
            if (!zip.EnvironmentVariables.Contains(schemaName))
                warnings.Add($"The solution has no environment variable {schemaName}; its value is passed on and Dataverse ignores it.");
            parameters.Entities.Add(new Entity("environmentvariablevalue") { ["schemaname"] = schemaName, ["value"] = value });
        }

        foreach (var (logicalName, connection) in Sorted(spec.ConnectionReferences))
        {
            if (!zip.ConnectionReferences.TryGetValue(logicalName, out var connector))
                warnings.Add($"The solution has no connection reference {logicalName}; its connection is passed on and Dataverse ignores it.");
            var reference = new Entity("connectionreference") { ["connectionreferencelogicalname"] = logicalName, ["connectionid"] = connection };
            if (!string.IsNullOrWhiteSpace(connector)) reference["connectorid"] = connector;
            parameters.Entities.Add(reference);
        }

        if (spec.EnvironmentVariables is { Count: > 0 } && !context.Capabilities.HasTable("environmentvariabledefinition"))
        {
            steps.Add(PlanStep.Unsupported("importSolution", name,
                "This environment has no environment variables, so their values cannot be set.",
                "Import without environmentVariables."));
        }

        if (spec.ConnectionReferences is { Count: > 0 } && !context.Capabilities.HasTable("connectionreference"))
        {
            steps.Add(PlanStep.Unsupported("importSolution", name,
                "This environment has no connection references (they are online only).",
                "Import without connectionReferences."));
        }

        var overwrite = spec.OverwriteUnmanagedCustomizations ?? false;
        var publishWorkflows = spec.PublishWorkflows ?? true;
        var options = new ImportOptions(
            OverwriteUnmanagedCustomizations: overwrite,
            PublishWorkflows: publishWorkflows,
            HoldingSolution: mode != ImportMode.Update,
            ComponentParameters: parameters.Entities.Count > 0 ? parameters : null);

        var detail = new List<string>
        {
            $"{zip.Version} {kind}",
            installed is null ? "not installed" : $"installed {installed.Version}",
            $"mode {Mode(mode)}",
            $"overwrite unmanaged customizations {YesNo(overwrite)}",
            $"publish workflows {YesNo(publishWorkflows)}",
            $"file {spec.Path} (sha256 {hash})",
        };
        if (spec.EnvironmentVariables is { Count: > 0 } variables)
            detail.Add($"environment variables {string.Join(", ", Sorted(variables).Select(p => $"{p.Key}='{p.Value}'"))}");
        if (spec.ConnectionReferences is { Count: > 0 } references)
            detail.Add($"connection references {string.Join(", ", Sorted(references).Select(p => $"{p.Key}={p.Value}"))}");

        steps.Add(new PlanStep
        {
            Op = "importSolution",
            Target = name,
            Effect = PlanEffect.Destructive,
            Detail = string.Join(", ", detail),
            SolutionAware = false,
            Action = async (step, token) =>
            {
                var jobs = new AsyncJobs(step.Client, delay, pollInterval);
                var outcome = await jobs.ImportAsync(file, options, null, token);
                if (!outcome.Succeeded)
                {
                    throw new AgentProblemException(new AgentProblem(StatusCodes.Status502BadGateway, "DataverseFault",
                        $"The import of {name} failed (import job {outcome.ImportJobId}): {outcome.Message}"));
                }
            },
        });

        if (mode == ImportMode.Upgrade)
        {
            steps.Add(new PlanStep
            {
                Op = "applyUpgrade",
                Target = name,
                Effect = PlanEffect.Destructive,
                Detail = $"replaces {name} {installed!.Version} with {zip.Version} and deletes the components {zip.Version} no longer has, with their data",
                SolutionAware = false,
                Request = new DeleteAndPromoteRequest { UniqueName = name },
            });
        }
        else if (!zip.Managed)
        {
            // An unmanaged import is not live until it is published; a managed one is.
            steps.Add(new PlanStep
            {
                Op = "publishAll",
                Target = name,
                Detail = "publish all customizations, so the imported changes are live",
                SolutionAware = false,
                Request = new PublishAllXmlRequest(),
            });
        }

        return new Plan(steps, warnings, lockKeys);
    }

    private byte[] Read(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !System.IO.Path.IsPathFullyQualified(path))
            throw Invalid("path must be the absolute path of a solution .zip.");
        if (!path.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            throw Invalid("path must end in .zip.");
        try
        {
            return readFile(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw Invalid($"The file {path} cannot be read: {ex.Message}");
        }
    }

    internal sealed record Installed(string Version, bool Managed);

    internal static async Task<Installed?> InstalledAsync(IAgentClient client, string name, CancellationToken ct)
    {
        var query = new QueryExpression("solution") { TopCount = 1, NoLock = true, ColumnSet = new ColumnSet("uniquename", "version", "ismanaged") };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, name);
        var row = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        return row is null ? null : new Installed(row.GetAttributeValue<string>("version") ?? "", row.GetAttributeValue<bool?>("ismanaged") == true);
    }

    /// <summary>Compares two solution versions; an unreadable or missing one sorts first.</summary>
    internal static int Compare(string version, string? other)
    {
        if (other is null) return 1;
        var a = System.Version.TryParse(version, out var left) ? left : new Version(0, 0);
        var b = System.Version.TryParse(other, out var right) ? right : new Version(0, 0);
        return a.CompareTo(b);
    }

    private static IEnumerable<KeyValuePair<string, string>> Sorted(Dictionary<string, string>? values) =>
        (values ?? []).OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase);

    private static string Mode(ImportMode mode) => mode.ToString().ToLowerInvariant();

    private static string YesNo(bool value) => value ? "yes" : "no";

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
