using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Agent.Kernel;

public sealed record AsyncJobStatus(Guid Id, bool Completed, bool Succeeded, string? Message);

public sealed record ImportOutcome(bool Succeeded, Guid ImportJobId, Guid AsyncOperationId, double? Progress, string? Message);

public sealed record ImportOptions(
    bool OverwriteUnmanagedCustomizations = false,
    bool PublishWorkflows = true,
    bool HoldingSolution = false,
    EntityCollection? ComponentParameters = null);

/// <summary>
/// Solution export and import on both deployment types, with one code path. Import always runs as ExecuteAsync and
/// is polled through asyncoperation and importjob. Export uses ExportSolutionAsync where it exists and the
/// synchronous ExportSolution otherwise; the caller's token bounds how long either may take.
/// </summary>
/// Polls go through <see cref="RetryPolicy"/>, so a throttled poll during a long online import waits instead of
/// failing the call while the import keeps running.
public sealed class AsyncJobs(
    IAgentClient client,
    Func<TimeSpan, CancellationToken, Task>? delay = null,
    TimeSpan? pollInterval = null,
    RetryPolicy? retry = null)
{
    // asyncoperation: statecode 3 = Completed; statuscode 30 = Succeeded, 31 = Failed, 32 = Canceled.
    private const int Completed = 3;
    private const int Succeeded = 30;

    private readonly Func<TimeSpan, CancellationToken, Task> delay = delay ?? Task.Delay;
    private readonly TimeSpan pollInterval = pollInterval ?? TimeSpan.FromSeconds(3);
    private readonly RetryPolicy retry = retry ?? new RetryPolicy(delay);

    public async Task<byte[]> ExportAsync(string solution, bool managed, Capabilities capabilities, CancellationToken ct)
    {
        if (!capabilities.ExportSolutionAsync)
        {
            var response = (ExportSolutionResponse)await client.ExecuteAsync(
                new ExportSolutionRequest { SolutionName = solution, Managed = managed }, ct);
            return response.ExportSolutionFile;
        }

        var started = await client.ExecuteAsync(
            new OrganizationRequest("ExportSolutionAsync") { ["SolutionName"] = solution, ["Managed"] = managed }, ct);
        var operationId = (Guid)started.Results["AsyncOperationId"];
        var exportJobId = (Guid)started.Results["ExportJobId"];
        var status = await WaitAsync(operationId, null, ct);
        if (!status.Succeeded)
            throw new AgentProblemException(new AgentProblem(StatusCodes.Status502BadGateway, "DataverseFault", status.Message ?? "The export failed."));

        var download = await client.ExecuteAsync(
            new OrganizationRequest("DownloadSolutionExportData") { ["ExportJobId"] = exportJobId }, ct);
        return (byte[])download.Results["ExportSolutionFile"];
    }

    public async Task<ImportOutcome> ImportAsync(byte[] file, ImportOptions options, Action<double>? progress, CancellationToken ct)
    {
        var importJobId = Guid.NewGuid();
        var import = new ImportSolutionRequest
        {
            CustomizationFile = file,
            ImportJobId = importJobId,
            OverwriteUnmanagedCustomizations = options.OverwriteUnmanagedCustomizations,
            PublishWorkflows = options.PublishWorkflows,
            HoldingSolution = options.HoldingSolution,
        };
        if (options.ComponentParameters is not null) import.ComponentParameters = options.ComponentParameters;

        var started = (ExecuteAsyncResponse)await client.ExecuteAsync(new ExecuteAsyncRequest { Request = import }, ct);
        var status = await WaitAsync(started.AsyncJobId, () => ReportImportProgressAsync(importJobId, progress, ct), ct);
        var job = await ReadImportJobAsync(importJobId, ct);
        var message = status.Succeeded ? null : status.Message ?? job.Message ?? "The import failed.";
        return new ImportOutcome(status.Succeeded, importJobId, started.AsyncJobId, job.Progress, message);
    }

    /// <summary>Polls an asyncoperation until it completes or the token ends the wait.</summary>
    public async Task<AsyncJobStatus> WaitAsync(Guid operationId, Func<Task>? onPoll, CancellationToken ct)
    {
        while (true)
        {
            var row = await retry.RunAsync(
                token => client.RetrieveAsync("asyncoperation", operationId, new ColumnSet("statecode", "statuscode", "message", "friendlymessage"), token),
                ct);
            var state = row.GetAttributeValue<OptionSetValue>("statecode")?.Value;
            if (state == Completed)
            {
                var status = row.GetAttributeValue<OptionSetValue>("statuscode")?.Value;
                var message = row.GetAttributeValue<string>("friendlymessage") is { Length: > 0 } friendly
                    ? friendly
                    : row.GetAttributeValue<string>("message");
                return new AsyncJobStatus(operationId, true, status == Succeeded, message);
            }

            if (onPoll is not null) await onPoll();
            await delay(pollInterval, ct);
        }
    }

    private async Task ReportImportProgressAsync(Guid importJobId, Action<double>? progress, CancellationToken ct)
    {
        if (progress is null) return;
        var job = await ReadImportJobAsync(importJobId, ct);
        if (job.Progress is { } value) progress(value);
    }

    private async Task<(double? Progress, string? Message)> ReadImportJobAsync(Guid importJobId, CancellationToken ct)
    {
        try
        {
            var row = await retry.RunAsync(token => client.RetrieveAsync("importjob", importJobId, new ColumnSet("progress", "data"), token), ct);
            return (row.GetAttributeValue<double?>("progress"), ImportJobLog.FirstError(row.GetAttributeValue<string>("data")));
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is not null)
        {
            // The import job row appears only once the import starts.
            return (null, null);
        }
    }
}

/// <summary>Reads the first failure out of an import job's data XML.</summary>
public static class ImportJobLog
{
    public static string? FirstError(string? data)
    {
        if (string.IsNullOrWhiteSpace(data)) return null;
        try
        {
            var doc = System.Xml.Linq.XDocument.Parse(data);
            var failed = doc.Descendants("result")
                .FirstOrDefault(r => string.Equals((string?)r.Attribute("result"), "failure", StringComparison.OrdinalIgnoreCase));
            if (failed is null) return null;
            var text = (string?)failed.Attribute("errortext");
            var component = failed.Parent?.Attribute("name")?.Value ?? failed.Parent?.Attribute("id")?.Value;
            return component is null ? text : $"{component}: {text}";
        }
        catch (System.Xml.XmlException)
        {
            return null;
        }
    }
}
