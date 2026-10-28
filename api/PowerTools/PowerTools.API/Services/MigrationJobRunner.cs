using Microsoft.Xrm.Sdk;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.DataMigration;

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
        var sourceSvc = factory.Create(job.SourceConnection);
        var targetSvc = factory.Create(job.TargetConnection);
        try
        {
            job.Total = await CountRecords(job, sourceSvc, ct);

            var fetchXml = BuildFetchXml(job);
            string? pagingCookie = null;
            int page = 1;

            while (true)
            {
                ct.ThrowIfCancellationRequested();

                var fetch = BuildPagedFetchXml(fetchXml, page, BatchSize, pagingCookie);
                var result = await sourceSvc.RetrieveMultipleAsync(new FetchExpression(fetch));

                if (result.Entities.Count == 0) break;

                await ProcessBatch(job, result.Entities, targetSvc);

                if (!result.MoreRecords) break;
                pagingCookie = result.PagingCookie;
                page++;
            }
        }
        finally
        {
            (sourceSvc as IDisposable)?.Dispose();
            (targetSvc as IDisposable)?.Dispose();
        }
    }

    private static async Task ProcessBatch(
        MigrationJob job,
        DataCollection<Entity> entities,
        IOrganizationServiceAsync2 targetSvc)
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

            if (job.Mode is "update" or "upsert")
            {
                target.Id = source.Id;
            }

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
                if (WasCreated(job.Mode, item.Response))
                    job.Created++;
                else
                    job.Updated++;
            }
        }
    }

    // The total only drives progress, so a failed count must not stop the migration.
    private async Task<int> CountRecords(MigrationJob job, IOrganizationServiceAsync2 sourceSvc, CancellationToken ct)
    {
        try
        {
            var metadata = await DataMigrationRecords.GetEntityMetadataAsync(sourceSvc, job.EntityLogicalName);
            return await DataMigrationRecords.CountAsync(
                sourceSvc, job.EntityLogicalName, metadata.PrimaryIdAttribute, job.FetchXmlFilter, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not count records for migration job {JobId}", job.Id);
            return 0;
        }
    }

    private static bool WasCreated(string mode, OrganizationResponse? response) => mode switch
    {
        "update" => false,
        "upsert" => response is UpsertResponse { RecordCreated: true },
        _ => true
    };

    private static string BuildFetchXml(MigrationJob job)
    {
        return DataMigrationFetchXml.Build(job.EntityLogicalName, job.Attributes, job.FetchXmlFilter);
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
