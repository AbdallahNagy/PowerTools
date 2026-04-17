using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Services;

public class MigrationJobRunner(
    IMigrationJobStore store,
    DataverseClientFactory factory,
    ILogger<MigrationJobRunner> logger) : BackgroundService
{
    private const int BatchSize = 100;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var job = store.DequeueNext();
            if (job is null)
            {
                await Task.Delay(500, ct);
                continue;
            }

            job.Status = MigrationJobStatus.Running;
            try
            {
                await RunJob(job, ct);
                job.Status = MigrationJobStatus.Completed;
            }
            catch (Exception ex)
            {
                job.Status = MigrationJobStatus.Failed;
                job.Errors.Add(new MigrationJobError("N/A", DataverseErrorFormatter.Format(ex)));
                logger.LogError(ex, "Migration job {JobId} failed", job.Id);
            }
        }
    }

    private async Task RunJob(MigrationJob job, CancellationToken ct)
    {
        using var sourceSvc = factory.Create(job.SourceToken, job.SourceEnvUrl);
        using var targetSvc = factory.Create(job.TargetToken, job.TargetEnvUrl);

        var fetchXml = BuildFetchXml(job);
        string? pagingCookie = null;
        int page = 1;

        while (true)
        {
            ct.ThrowIfCancellationRequested();

            var fetch = BuildPagedFetchXml(fetchXml, page, BatchSize, pagingCookie);
            var result = await sourceSvc.RetrieveMultipleAsync(new FetchExpression(fetch));

            if (job.Total == 0)
                job.Total = result.TotalRecordCount > 0 ? result.TotalRecordCount : result.Entities.Count;

            if (result.Entities.Count == 0) break;

            await ProcessBatch(job, result.Entities, targetSvc);

            if (!result.MoreRecords) break;
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    private static async Task ProcessBatch(
        MigrationJob job,
        DataCollection<Entity> entities,
        Microsoft.PowerPlatform.Dataverse.Client.ServiceClient targetSvc)
    {
        var request = new ExecuteMultipleRequest
        {
            Settings = new ExecuteMultipleSettings
            {
                ContinueOnError = true,
                ReturnResponses = true
            },
            Requests = new OrganizationRequestCollection()
        };

        var recordMap = new Dictionary<int, string>();

        for (int i = 0; i < entities.Count; i++)
        {
            var source = entities[i];
            var target = new Entity(job.EntityLogicalName);

            foreach (var attr in job.Attributes)
            {
                if (source.Contains(attr))
                    target[attr] = source[attr];
            }

            var recordId = source.Id.ToString();
            recordMap[i] = recordId;

            OrganizationRequest req = job.Mode switch
            {
                "update" => new UpdateRequest { Target = target },
                "upsert" => new UpsertRequest { Target = target },
                _ => new CreateRequest { Target = target }
            };

            request.Requests.Add(req);
        }

        var response = await targetSvc.ExecuteAsync(request) as ExecuteMultipleResponse;
        if (response is null) return;

        foreach (var item in response.Responses)
        {
            job.Processed++;
            var recordId = recordMap.TryGetValue(item.RequestIndex, out var id) ? id : item.RequestIndex.ToString();

            if (item.Fault is not null)
            {
                job.Failed++;
                var msg = item.Fault.InnerFault?.Message ?? item.Fault.Message;
                job.Errors.Add(new MigrationJobError(recordId, msg));
            }
            else
            {
                job.Succeeded++;
            }
        }
    }

    private static string BuildFetchXml(MigrationJob job)
    {
        var attrs = string.Join("", job.Attributes.Select(a => $"<attribute name=\"{a}\" />"));
        var filter = string.IsNullOrWhiteSpace(job.FetchXmlFilter) ? "" : job.FetchXmlFilter;
        return $"<fetch><entity name=\"{job.EntityLogicalName}\">{attrs}{filter}</entity></fetch>";
    }

    private static string BuildPagedFetchXml(string baseFetch, int page, int count, string? pagingCookie)
    {
        var cookie = pagingCookie is not null
            ? $" paging-cookie=\"{System.Security.SecurityElement.Escape(pagingCookie)}\""
            : "";
        return baseFetch.Replace(
            "<fetch>",
            $"<fetch page=\"{page}\" count=\"{count}\"{cookie}>");
    }
}
