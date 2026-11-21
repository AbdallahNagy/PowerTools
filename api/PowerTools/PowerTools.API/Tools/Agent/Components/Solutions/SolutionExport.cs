using System.Text.RegularExpressions;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Solutions;

public sealed class SolutionExportBody
{
    public string? Solution { get; set; }
    public bool? Managed { get; set; }

    /// <summary>Absolute folder to write into. Default: Documents\Power Tools\Solutions.</summary>
    public string? Folder { get; set; }
}

public sealed record SolutionExportedDto(string Path, string Solution, string Version, bool Managed, long Bytes);

/// <summary>
/// Exports an unmanaged solution, as managed or unmanaged, to a new .zip on this computer. It never overwrites a
/// file: a name that is taken gets a number. Export uses ExportSolutionAsync where the environment has it and the
/// synchronous ExportSolution otherwise (see <see cref="AsyncJobs"/>), so the call is the same on both deployment types.
/// </summary>
public sealed partial class SolutionExport(IAgentClient client, Capabilities capabilities, Func<TimeSpan, CancellationToken, Task>? delay = null)
{
    public static string DefaultFolder()
    {
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        if (string.IsNullOrEmpty(documents)) documents = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(documents)) documents = Path.GetTempPath();
        return Path.Combine(documents, "Power Tools", "Solutions");
    }

    [GeneratedRegex("[^A-Za-z0-9_.-]")]
    private static partial Regex Unsafe();

    public async Task<AgentResult<SolutionExportedDto>> ExportAsync(SolutionExportBody body, CancellationToken ct)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(body.Solution)) throw Invalid("solution is required.");
            var name = body.Solution.Trim();
            var managed = body.Managed ?? false;
            var folder = string.IsNullOrWhiteSpace(body.Folder) ? DefaultFolder() : body.Folder.Trim();
            if (!Path.IsPathFullyQualified(folder)) throw Invalid("folder must be an absolute path.");

            var installed = await SolutionImportPlanner.InstalledAsync(client, name, ct)
                ?? throw new AgentProblemException(AgentFaults.NotFound($"Solution '{name}' was not found."));
            if (installed.Managed)
                throw Invalid($"Solution '{name}' is managed. Only unmanaged solutions can be exported; export it from the environment it was built in.");

            var file = await new AsyncJobs(client, delay).ExportAsync(name, managed, capabilities, ct);
            Directory.CreateDirectory(folder);
            var path = FreePath(folder, $"{Unsafe().Replace(name, "_")}_{installed.Version.Replace('.', '_')}_{(managed ? "managed" : "unmanaged")}");
            await File.WriteAllBytesAsync(path, file, ct);
            return AgentResult<SolutionExportedDto>.Ok(new SolutionExportedDto(path, name, installed.Version, managed, file.LongLength));
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return AgentResult<SolutionExportedDto>.Fail(ex is IOException or UnauthorizedAccessException
                ? AgentFaults.InvalidRequest($"The file cannot be written: {ex.Message}")
                : AgentFaults.From(ex));
        }
    }

    /// <summary>The first of name.zip, name_2.zip, name_3.zip … that does not exist.</summary>
    internal static string FreePath(string folder, string name)
    {
        var path = Path.Combine(folder, $"{name}.zip");
        for (var n = 2; File.Exists(path); n++) path = Path.Combine(folder, $"{name}_{n}.zip");
        return path;
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
