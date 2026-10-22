using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.RibbonWorkbench;

namespace PowerTools.API.RibbonWorkbench.Tests;

/// <summary>A fake Dataverse surface. Records every call; no network.</summary>
public sealed class FakeRibbonClient : IRibbonWorkbenchClient
{
    public List<Entity> Solutions { get; } =
    [
        Solution("new_RibbonEdits", "Ribbon edits", "new"),
        Solution("Default", "Default Solution", "new"),
        Solution("Active", "Active Solution", "new"),
    ];

    /// <summary>Each export returns the next file; the last one repeats.</summary>
    public Queue<byte[]> Exports { get; } = new();
    private byte[]? _lastExport;
    public Exception? StartExportError { get; set; }
    public Queue<AsyncOperationState?> ExportOperations { get; } = new();
    public Queue<AsyncOperationState?> ImportOperations { get; } = new();
    public Queue<ImportJobState?> ImportJobs { get; } = new();
    public Dictionary<string, byte[]> EntityRibbons { get; } = new(StringComparer.OrdinalIgnoreCase);
    public byte[] ApplicationRibbon { get; set; } = RibbonFixtures.Ribbon(RibbonFixtures.ApplicationRibbonXml);
    public List<RibbonTableInfo> Tables { get; } =
    [
        new("account", "Account", true),
        new("queue", "Queue", true),
        new("contact", "Contact", true),
    ];
    public HashSet<string> WebResources { get; } = new(StringComparer.OrdinalIgnoreCase) { "new_/scripts/hello.js" };
    public List<string> MissingPrivileges { get; } = [];
    public Exception? PrivilegeError { get; set; }
    public Exception? PublishError { get; set; }

    public List<string> Calls { get; } = [];
    public List<(byte[] File, Guid ImportJobId)> Imports { get; } = [];
    public List<string> Published { get; } = [];
    public Guid ImportOperationId { get; } = Guid.NewGuid();

    public static Entity Solution(string uniqueName, string friendlyName, string? prefix, bool managed = false)
    {
        var row = new Entity("solution", Guid.NewGuid())
        {
            ["uniquename"] = uniqueName,
            ["friendlyname"] = friendlyName,
            ["ismanaged"] = managed,
            ["version"] = "1.0.0.0",
        };
        if (prefix is not null) row["publisher.customizationprefix"] = new AliasedValue("publisher", "customizationprefix", prefix);
        return row;
    }

    public static FaultException<OrganizationServiceFault> Fault(string message, int code = -2147220891) =>
        new(new OrganizationServiceFault { ErrorCode = code, Message = message }, new FaultReason(message));

    public Task<IReadOnlyList<Entity>> RetrieveSolutionsAsync(CancellationToken cancellationToken)
    {
        Calls.Add("solutions");
        return Task.FromResult<IReadOnlyList<Entity>>(Solutions);
    }

    public Task<byte[]> ExportSolutionAsync(string uniqueName, CancellationToken cancellationToken)
    {
        Calls.Add($"export:{uniqueName}");
        return Task.FromResult(NextExport());
    }

    public Task<(Guid AsyncOperationId, Guid ExportJobId)> StartExportAsync(string uniqueName, CancellationToken cancellationToken)
    {
        Calls.Add($"startExport:{uniqueName}");
        if (StartExportError is not null) throw StartExportError;
        return Task.FromResult((Guid.NewGuid(), Guid.NewGuid()));
    }

    public Task<byte[]> DownloadExportAsync(Guid exportJobId, CancellationToken cancellationToken)
    {
        Calls.Add("downloadExport");
        return Task.FromResult(NextExport());
    }

    public Task<AsyncOperationState?> RetrieveAsyncOperationAsync(Guid id, CancellationToken cancellationToken)
    {
        if (id == ImportOperationId)
        {
            Calls.Add("importStatus");
            return Task.FromResult(ImportOperations.Count > 1 ? ImportOperations.Dequeue() : ImportOperations.PeekOrDefault());
        }

        Calls.Add("exportStatus");
        return Task.FromResult(
            ExportOperations.Count > 0
                ? ExportOperations.Dequeue()
                : new AsyncOperationState(3, AsyncOperationState.Succeeded, null, null));
    }

    public Task<byte[]> RetrieveEntityRibbonAsync(string entity, CancellationToken cancellationToken)
    {
        Calls.Add($"entityRibbon:{entity}");
        if (!EntityRibbons.TryGetValue(entity, out var ribbon))
            throw Fault($"The entity {entity} does not support ribbons.");
        return Task.FromResult(ribbon);
    }

    public Task<byte[]> RetrieveApplicationRibbonAsync(CancellationToken cancellationToken)
    {
        Calls.Add("applicationRibbon");
        return Task.FromResult(ApplicationRibbon);
    }

    public Task<IReadOnlyList<RibbonTableInfo>> RetrieveTablesAsync(
        IReadOnlyCollection<string> logicalNames,
        CancellationToken cancellationToken)
    {
        Calls.Add("tables");
        return Task.FromResult<IReadOnlyList<RibbonTableInfo>>(
            Tables.Where(table => logicalNames.Contains(table.LogicalName, StringComparer.OrdinalIgnoreCase)).ToList());
    }

    public Task<Guid> StartImportAsync(byte[] customizationFile, Guid importJobId, CancellationToken cancellationToken)
    {
        Calls.Add("import");
        Imports.Add((customizationFile, importJobId));
        return Task.FromResult(ImportOperationId);
    }

    public Task<ImportJobState?> RetrieveImportJobAsync(Guid importJobId, CancellationToken cancellationToken)
    {
        Calls.Add("importJob");
        return Task.FromResult(ImportJobs.Count > 0 ? ImportJobs.Dequeue() : null);
    }

    public Task PublishAsync(string parameterXml, CancellationToken cancellationToken)
    {
        Calls.Add("publish");
        if (PublishError is not null) throw PublishError;
        Published.Add(parameterXml);
        return Task.CompletedTask;
    }

    public Task<IReadOnlySet<string>> RetrieveWebResourceNamesAsync(
        IReadOnlyCollection<string> names,
        CancellationToken cancellationToken)
    {
        Calls.Add("webResources");
        return Task.FromResult<IReadOnlySet<string>>(
            names.Where(WebResources.Contains).ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    public Task<IReadOnlyList<string>> RetrieveMissingPrivilegesAsync(
        IReadOnlyList<string> privilegeNames,
        CancellationToken cancellationToken)
    {
        Calls.Add("privileges");
        if (PrivilegeError is not null) throw PrivilegeError;
        return Task.FromResult<IReadOnlyList<string>>(privilegeNames.Where(MissingPrivileges.Contains).ToList());
    }

    private byte[] NextExport()
    {
        if (Exports.Count > 0) _lastExport = Exports.Dequeue();
        return _lastExport ?? RibbonFixtures.Solution();
    }
}

/// <summary>Records waits instead of sleeping.</summary>
public sealed class FakeDelay : IRibbonDelay
{
    public List<TimeSpan> Waits { get; } = [];

    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        Waits.Add(delay);
        return Task.CompletedTask;
    }
}

internal static class QueueExtensions
{
    public static T? PeekOrDefault<T>(this Queue<T> queue) => queue.Count > 0 ? queue.Peek() : default;
}
