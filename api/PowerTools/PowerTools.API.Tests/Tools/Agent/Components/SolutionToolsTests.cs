using System.IO.Compression;
using System.Text;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tests.Tools.Agent.Kernel;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Solutions;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class SolutionToolsTests
{
    private static readonly string Folder = Path.Combine(Path.GetTempPath(), "exports");
    private static readonly string FilePath = Path.Combine(Folder, "Contoso_1_2_0_0_managed.zip");
    private readonly FakeAgentClient client = Data.Client();
    private readonly Dictionary<string, byte[]> files = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<ImportSolutionRequest> imports = [];
    private int importStatus = 30;

    public SolutionToolsTests()
    {
        client.OnExecute = request =>
        {
            switch (request)
            {
                case ExecuteAsyncRequest { Request: ImportSolutionRequest import }:
                    imports.Add(import);
                    var operationId = Guid.NewGuid();
                    client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
                    {
                        ["statecode"] = new OptionSetValue(3),
                        ["statuscode"] = new OptionSetValue(importStatus),
                        ["message"] = importStatus == 30 ? null : "Import failed.",
                    };
                    client.Records[("importjob", import.ImportJobId)] = new Entity("importjob", import.ImportJobId)
                    {
                        ["progress"] = 100.0,
                        ["data"] = importStatus == 30
                            ? "<importexportxml/>"
                            : """<importexportxml><entities><entity name="con_project"><result result="failure" errortext="Missing dependency" /></entity></entities></importexportxml>""",
                    };
                    if (importStatus == 30) Install(Zip(import.CustomizationFile), import.HoldingSolution);
                    return new ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operationId } };
                case DeleteAndPromoteRequest promote:
                    var holding = client.Solutions.Single(s => (string)s["uniquename"] == promote.UniqueName + "_Upgrade");
                    client.Solutions.RemoveAll(s => (string)s["uniquename"] == promote.UniqueName);
                    holding["uniquename"] = promote.UniqueName;
                    return new DeleteAndPromoteResponse();
            }

            return new OrganizationResponse();
        };
    }

    private void Install(SolutionZipInfo zip, bool holding)
    {
        var name = holding ? zip.UniqueName + "_Upgrade" : zip.UniqueName;
        client.Solutions.RemoveAll(s => (string)s["uniquename"] == name);
        client.Solutions.Add(Installed(name, zip.Version, zip.Managed));
    }

    private static SolutionZipInfo Zip(byte[] file) => SolutionZip.Read(file);

    private static Entity Installed(string name, string version, bool managed)
    {
        var row = Data.Solution(name, Data.ContosoPublisherId, managed);
        row["version"] = version;
        return row;
    }

    /// <summary>A solution .zip with a solution.xml and, when given, environment variables and connection references.</summary>
    public static byte[] SolutionFile(string name, string version, bool managed, string[]? variables = null, string? connectionReference = null)
    {
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Add(string path, string text)
            {
                using var writer = new StreamWriter(zip.CreateEntry(path).Open(), Encoding.UTF8);
                writer.Write(text);
            }

            Add("solution.xml", $"<ImportExportXml><SolutionManifest><UniqueName>{name}</UniqueName><Version>{version}</Version><Managed>{(managed ? 1 : 0)}</Managed></SolutionManifest></ImportExportXml>");
            Add("customizations.xml", connectionReference is null
                ? "<ImportExportXml/>"
                : $"<ImportExportXml><connectionreferences><connectionreference connectionreferencelogicalname=\"{connectionReference}\"><connectorid>/providers/Microsoft.PowerApps/apis/shared_office365</connectorid></connectionreference></connectionreferences></ImportExportXml>");
            foreach (var variable in variables ?? []) Add($"environmentvariabledefinitions/{variable}/environmentvariabledefinition.xml", "<environmentvariabledefinition/>");
        }

        return stream.ToArray();
    }

    private SolutionImportPlanner Planner() => new(path => files.TryGetValue(path, out var file) ? file : throw new FileNotFoundException("no file", path), (_, _) => Task.CompletedTask, TimeSpan.Zero);

    private PlanContext Context(bool online = true) => new(client, Capabilities(online), "https://import.crm.dynamics.com");

    private static Capabilities Capabilities(bool online) => new(
        "9.2",
        online ? new HashSet<string> { "connectionreference", "environmentvariabledefinition" } : new HashSet<string>(),
        ExportSolutionAsync: online);

    private ApplyKernel Kernel(bool online = true, TimeSpan? lockTimeout = null) => new(
        new ApplyFamily<SolutionImportSpec>(SolutionImportPlanner.Family, Planner(), SolutionImportPlanner.ForVerification),
        () => Context(online),
        new KernelOptions(lockTimeout ?? TimeSpan.FromSeconds(5), KernelFakes.NoWaitRetry()));

    private Task<Plan> PlanAsync(SolutionImportSpec spec, bool online = true) => Planner().PlanAsync(spec, Context(online), CancellationToken.None);

    private async Task<ApplyResult> ApplyAsync(SolutionImportSpec spec, bool online = true)
    {
        var kernel = Kernel(online);
        var preview = await kernel.PlanAsync(spec, CancellationToken.None);
        return await kernel.ApplyAsync(spec, preview.Hash, CancellationToken.None);
    }

    private static SolutionImportSpec Spec(ImportMode? mode = null, bool? force = null) => new() { Path = FilePath, Mode = mode, Force = force };

    // ── Import ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_new_solution_plans_one_destructive_import_that_names_the_file_hash_and_options()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);

        var plan = await PlanAsync(Spec());

        var step = Assert.Single(plan.Steps);
        Assert.Equal(("importSolution", "Contoso", PlanEffect.Destructive, false), (step.Op, step.Target, step.Effect, step.SolutionAware));
        Assert.Equal(PlanEffect.Destructive, plan.Effect);
        Assert.StartsWith($"1.2.0.0 managed, not installed, mode update, overwrite unmanaged customizations no, publish workflows yes, file {FilePath} (sha256 ", step.Detail);
        Assert.Contains(Locks.PublishKey("https://import.crm.dynamics.com"), plan.LockKeys);
    }

    [Fact]
    public async Task Another_file_at_the_same_path_changes_the_hash()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        var before = await PlanAsync(Spec());
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true, variables: ["con_Url"]);

        Assert.NotEqual(before.Hash, (await PlanAsync(Spec())).Hash);
    }

    [Fact]
    public async Task Import_runs_async_without_a_solution_name_verifies_and_a_second_import_is_unchanged()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);

        var result = await ApplyAsync(Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var import = Assert.Single(imports);
        Assert.False(import.Parameters.Contains("SolutionUniqueName"));
        Assert.False(import.OverwriteUnmanagedCustomizations);
        Assert.True(import.PublishWorkflows);
        Assert.Empty(client.Executed.OfType<PublishAllXmlRequest>());
        Assert.True((await PlanAsync(Spec())).IsEmpty);
    }

    [Fact]
    public async Task Force_imports_the_installed_version_again_and_verification_still_passes()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        client.Solutions.Add(Installed("Contoso", "1.2.0.0", managed: true));

        Assert.True((await PlanAsync(Spec())).IsEmpty);
        var result = await ApplyAsync(Spec(force: true));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Single(imports);
    }

    [Fact]
    public async Task An_unmanaged_import_is_published()
    {
        files[FilePath] = SolutionFile("Contoso", "1.0.0.0", managed: false);

        var plan = await PlanAsync(Spec());
        Assert.Equal(["importSolution", "publishAll"], plan.Steps.Select(s => s.Op));

        Assert.Equal(ApplyOutcome.Applied, (await ApplyAsync(Spec())).Outcome);
        Assert.Single(client.Executed.OfType<PublishAllXmlRequest>());
    }

    [Fact]
    public async Task A_failed_import_is_failed_with_the_import_job_error()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        importStatus = 31;

        var result = await ApplyAsync(Spec());

        Assert.Equal(ApplyOutcome.Failed, result.Outcome);
        Assert.Contains("con_project: Missing dependency", result.Message);
        Assert.Equal(["Contoso"], result.Remaining.Steps.Select(s => s.Target));
    }

    [Theory]
    [InlineData(true, false, "1.0.0.0", null, "installed as unmanaged and the file is managed")]
    [InlineData(true, true, "2.0.0.0", null, "cannot be downgraded")]
    [InlineData(false, false, "1.0.0.0", ImportMode.Upgrade, "for managed solutions")]
    [InlineData(true, true, "1.2.0.0", ImportMode.Upgrade, null)]
    [InlineData(true, true, "1.3.0.0", ImportMode.Upgrade, "cannot be downgraded")]
    public async Task Imports_Dataverse_would_refuse_plan_as_blocked(bool fileManaged, bool installedManaged, string installedVersion, ImportMode? mode, string? reason)
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", fileManaged);
        client.Solutions.Add(Installed("Contoso", installedVersion, installedManaged));

        var plan = await PlanAsync(Spec(mode, force: reason is null ? true : null));

        var step = Assert.Single(plan.Steps);
        Assert.Equal(PlanStepKind.Blocked, step.Kind);
        Assert.Contains(reason ?? "needs a newer version", step.Reason);
    }

    [Fact]
    public async Task Upgrade_imports_a_holding_solution_then_promotes_it()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        client.Solutions.Add(Installed("Contoso", "1.0.0.0", managed: true));

        var plan = await PlanAsync(Spec(ImportMode.Upgrade));
        Assert.Equal([("importSolution", PlanEffect.Destructive), ("applyUpgrade", PlanEffect.Destructive)], plan.Steps.Select(s => (s.Op, s.Effect)));

        var result = await ApplyAsync(Spec(ImportMode.Upgrade));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.True(Assert.Single(imports).HoldingSolution);
        Assert.Equal("Contoso", Assert.Single(client.Executed.OfType<DeleteAndPromoteRequest>()).UniqueName);
    }

    [Fact]
    public async Task Stage_stops_at_the_holding_solution_and_staging_it_again_is_unchanged()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        client.Solutions.Add(Installed("Contoso", "1.0.0.0", managed: true));

        Assert.Equal(ApplyOutcome.Applied, (await ApplyAsync(Spec(ImportMode.Stage))).Outcome);

        Assert.Empty(client.Executed.OfType<DeleteAndPromoteRequest>());
        Assert.True((await PlanAsync(Spec(ImportMode.Stage))).IsEmpty);
    }

    [Fact]
    public async Task Environment_variables_and_connection_references_go_into_the_component_parameters_and_the_detail()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true, variables: ["con_Url"], connectionReference: "con_outlook");
        var spec = new SolutionImportSpec
        {
            Path = FilePath,
            EnvironmentVariables = new() { ["con_Url"] = "https://contoso.example", ["con_Other"] = "x" },
            ConnectionReferences = new() { ["con_outlook"] = "conn-1" },
        };

        var plan = await PlanAsync(spec);
        Assert.Contains("environment variables con_Other='x', con_Url='https://contoso.example'", plan.Steps[0].Detail);
        Assert.Contains("connection references con_outlook=conn-1", plan.Steps[0].Detail);
        Assert.Contains(plan.Warnings, w => w.Contains("no environment variable con_Other"));

        await ApplyAsync(spec);

        var parameters = Assert.Single(imports).ComponentParameters.Entities;
        Assert.Contains(parameters, e => e.LogicalName == "environmentvariablevalue" && (string)e["schemaname"] == "con_Url" && (string)e["value"] == "https://contoso.example");
        var reference = Assert.Single(parameters, e => e.LogicalName == "connectionreference");
        Assert.Equal(("con_outlook", "conn-1", "/providers/Microsoft.PowerApps/apis/shared_office365"),
            ((string)reference["connectionreferencelogicalname"], (string)reference["connectionid"], (string)reference["connectorid"]));
    }

    [Fact]
    public async Task Connection_references_on_an_environment_without_them_are_unsupported_before_the_import()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true, connectionReference: "con_outlook");
        var spec = new SolutionImportSpec { Path = FilePath, ConnectionReferences = new() { ["con_outlook"] = "conn-1" } };

        var result = await ApplyAsync(spec, online: false);

        Assert.Equal(ApplyOutcome.Failed, result.Outcome);
        Assert.Equal(ApplyResult.NotSupportedCode, result.Code);
        Assert.Empty(imports);
    }

    [Fact]
    public async Task An_import_waits_for_a_publish_on_the_same_environment()
    {
        files[FilePath] = SolutionFile("Contoso", "1.2.0.0", managed: true);
        var kernel = Kernel(lockTimeout: TimeSpan.FromMilliseconds(50));
        var preview = await kernel.PlanAsync(Spec(), CancellationToken.None);

        using (await Locks.HoldAsync(Locks.PublishKey("https://import.crm.dynamics.com"), CancellationToken.None))
        {
            var result = await kernel.ApplyAsync(Spec(), preview.Hash, CancellationToken.None);
            Assert.Equal((ApplyOutcome.Refused, ApplyResult.LockTimeoutCode), (result.Outcome, result.Code));
        }

        Assert.Empty(imports);
    }

    [Theory]
    [InlineData("relative.zip", "absolute path")]
    [InlineData("/notes.txt", "must end in .zip")]
    [InlineData("/missing.zip", "cannot be read")]
    public async Task A_bad_path_says_what_is_wrong(string path, string message)
    {
        if (path.StartsWith('/')) path = Folder + path;
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new SolutionImportSpec { Path = path }));

        Assert.Contains(message, error.Message);
    }

    [Fact]
    public async Task A_file_that_is_not_a_solution_is_refused()
    {
        files[FilePath] = [1, 2, 3];

        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec()));

        Assert.Equal("The file is not a valid .zip.", error.Message);
    }

    // ── Export ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Export_writes_a_new_file_and_never_overwrites_one()
    {
        client.Solutions.Add(Installed("Contoso", "1.2.0.0", managed: false));
        client.OnExecute = request => request is ExportSolutionRequest
            ? new ExportSolutionResponse { Results = new ParameterCollection { ["ExportSolutionFile"] = new byte[] { 1, 2 } } }
            : new OrganizationResponse();
        var folder = Path.Combine(Path.GetTempPath(), $"pt-export-{Guid.NewGuid():N}");
        try
        {
            var export = new SolutionExport(client, Capabilities(online: false));
            var first = await export.ExportAsync(new SolutionExportBody { Solution = "Contoso", Managed = true, Folder = folder }, CancellationToken.None);
            var second = await export.ExportAsync(new SolutionExportBody { Solution = "Contoso", Managed = true, Folder = folder }, CancellationToken.None);

            Assert.Equal(Path.Combine(folder, "Contoso_1_2_0_0_managed.zip"), first.Value!.Path);
            Assert.Equal(Path.Combine(folder, "Contoso_1_2_0_0_managed_2.zip"), second.Value!.Path);
            Assert.Equal(("1.2.0.0", true, 2L), (first.Value.Version, first.Value.Managed, first.Value.Bytes));
            Assert.Equal([1, 2], await File.ReadAllBytesAsync(first.Value.Path));
            Assert.All(client.Executed.OfType<ExportSolutionRequest>(), r => Assert.True(r.Managed));
        }
        finally
        {
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
        }
    }

    [Fact]
    public async Task Export_refuses_a_managed_or_missing_solution_and_a_relative_folder()
    {
        client.Solutions.Add(Installed("Vendor", "1.0.0.0", managed: true));
        var export = new SolutionExport(client, Capabilities(online: true));

        var managed = await export.ExportAsync(new SolutionExportBody { Solution = "Vendor" }, CancellationToken.None);
        var missing = await export.ExportAsync(new SolutionExportBody { Solution = "Nope" }, CancellationToken.None);
        var relative = await export.ExportAsync(new SolutionExportBody { Solution = "Vendor", Folder = "exports" }, CancellationToken.None);

        Assert.Contains("is managed", managed.Problem!.Message);
        Assert.Equal(AgentFaults.NotFoundCode, missing.Problem!.Code);
        Assert.Contains("absolute path", relative.Problem!.Message);
    }

    // ── AsyncJobs on older on-premises versions ──────────────────────────────

    [Fact]
    public async Task Polling_works_where_asyncoperation_has_no_friendlymessage()
    {
        var operationId = Guid.NewGuid();
        client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
        {
            ["statecode"] = new OptionSetValue(3),
            ["statuscode"] = new OptionSetValue(31),
            ["message"] = "Old server failure",
        };
        var asked = 0;
        client.BeforeRetrieve = (table, _) =>
        {
            if (table == "asyncoperation" && asked++ == 0)
                throw FakeAgentClient.Fault(AsyncJobs.MissingColumnCode, "'asyncoperation' entity doesn't contain attribute with Name = 'friendlymessage'.");
        };
        var jobs = new AsyncJobs(client, (_, _) => Task.CompletedTask);

        var first = await jobs.WaitAsync(operationId, null, CancellationToken.None);
        var second = await jobs.WaitAsync(operationId, null, CancellationToken.None);

        Assert.Equal((true, false, "Old server failure"), (first.Completed, first.Succeeded, first.Message));
        Assert.Equal("Old server failure", second.Message);
        Assert.Equal(3, asked);
    }
}
