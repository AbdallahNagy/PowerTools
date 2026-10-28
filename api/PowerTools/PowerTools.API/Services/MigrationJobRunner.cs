using Microsoft.Xrm.Sdk;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
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
            // Progress covers the records sent; deletions are added once they are known.
            if (job.Options.Create || job.Options.Update)
                job.Total = await CountRecords(job, sourceSvc, ct);

            var targetMetadata = await DataMigrationRecords.GetEntityMetadataAsync(targetSvc, job.EntityLogicalName);

            if (job.Options.Create || job.Options.Update)
                await TransferRecords(job, sourceSvc, targetSvc, targetMetadata.PrimaryIdAttribute, ct);

            // Last, so a run that fails while reading or writing records deletes nothing.
            if (job.Options.Delete)
            {
                var sourceMetadata = await DataMigrationRecords.GetEntityMetadataAsync(sourceSvc, job.EntityLogicalName);
                await DeleteMissingRecords(job, sourceSvc, targetSvc, sourceMetadata, targetMetadata, ct);
            }
        }
        finally
        {
            (sourceSvc as IDisposable)?.Dispose();
            (targetSvc as IDisposable)?.Dispose();
        }
    }

    private static async Task TransferRecords(
        MigrationJob job,
        IOrganizationServiceAsync2 sourceSvc,
        IOrganizationServiceAsync2 targetSvc,
        string targetPrimaryIdAttribute,
        CancellationToken ct)
    {
        var fetchXml = DataMigrationFetchXml.Build(
            job.EntityLogicalName, MigrationPlan.SourceColumns(job.Attributes), job.FetchXmlFilter);
        string? pagingCookie = null;
        int page = 1;

        while (true)
        {
            ct.ThrowIfCancellationRequested();

            var fetch = BuildPagedFetchXml(fetchXml, page, BatchSize, pagingCookie);
            var result = await sourceSvc.RetrieveMultipleAsync(new FetchExpression(fetch));

            if (result.Entities.Count == 0) break;

            var existing = await DataMigrationRecords.FindExistingIdsAsync(
                targetSvc,
                job.EntityLogicalName,
                targetPrimaryIdAttribute,
                result.Entities.Select(e => e.Id).ToList(),
                ct);
            await ProcessBatch(job, result.Entities, existing, targetSvc);

            if (!result.MoreRecords) break;
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    private static async Task ProcessBatch(
        MigrationJob job,
        DataCollection<Entity> entities,
        HashSet<Guid> existing,
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

        var sent = new List<(string RecordId, RecordAction Action)>();

        foreach (var source in entities)
        {
            var action = MigrationPlan.Decide(job.Options, existing.Contains(source.Id));
            if (action == RecordAction.Skip)
            {
                job.Processed++;
                job.Skipped++;
                continue;
            }

            var target = new Entity(job.EntityLogicalName) { Id = source.Id };
            foreach (var attr in job.Attributes)
            {
                if (source.Contains(attr))
                    target[attr] = source[attr];
            }

            OrganizationRequest req;
            if (action == RecordAction.Update)
            {
                req = new UpdateRequest { Target = target };
            }
            else
            {
                // An inactive record is created active and then moved to its state,
                // in one transaction so a failed state change leaves no record behind.
                var stateChange = MigrationPlan.SplitStateChange(target, source);
                req = stateChange is null
                    ? new CreateRequest { Target = target }
                    : new ExecuteTransactionRequest
                    {
                        Requests = new OrganizationRequestCollection
                        {
                            new CreateRequest { Target = target },
                            new UpdateRequest { Target = stateChange }
                        }
                    };
            }

            sent.Add((source.Id.ToString(), action));
            request.Requests.Add(req);
        }

        if (request.Requests.Count == 0) return;

        var response = await targetSvc.ExecuteAsync(request) as ExecuteMultipleResponse;
        if (response is null) return;

        foreach (var item in response.Responses)
        {
            job.Processed++;
            var (recordId, action) = item.RequestIndex < sent.Count
                ? sent[item.RequestIndex]
                : (item.RequestIndex.ToString(), RecordAction.Update);

            if (item.Fault is not null)
            {
                job.Failed++;
                var msg = item.Fault.InnerFault?.Message ?? item.Fault.Message;
                job.Errors.Add(new MigrationJobError(recordId, msg));
            }
            else
            {
                job.Succeeded++;
                if (action == RecordAction.Create)
                    job.Created++;
                else
                    job.Updated++;
            }
        }
    }

    private static async Task DeleteMissingRecords(
        MigrationJob job,
        IOrganizationServiceAsync2 sourceSvc,
        IOrganizationServiceAsync2 targetSvc,
        EntityMetadata sourceMetadata,
        EntityMetadata targetMetadata,
        CancellationToken ct)
    {
        var (sourceCount, missing) = await DataMigrationRecords.FindTargetRecordsMissingFromSourceAsync(
            sourceSvc,
            targetSvc,
            job.EntityLogicalName,
            sourceMetadata.PrimaryIdAttribute,
            targetMetadata,
            job.FetchXmlFilter,
            ct);

        var blocked = MigrationPlan.DeleteBlockedReason(job.Options, sourceCount, missing.Count);
        if (blocked is not null)
        {
            job.Errors.Add(new MigrationJobError("N/A", blocked));
            job.Failed++;
            return;
        }

        job.Total += missing.Count;
        foreach (var chunk in missing.Chunk(BatchSize))
        {
            ct.ThrowIfCancellationRequested();

            var request = new ExecuteMultipleRequest
            {
                Settings = new ExecuteMultipleSettings { ContinueOnError = true, ReturnResponses = true },
                Requests = new OrganizationRequestCollection()
            };
            foreach (var record in chunk)
                request.Requests.Add(new DeleteRequest { Target = new EntityReference(job.EntityLogicalName, record.Id) });

            var response = await targetSvc.ExecuteAsync(request) as ExecuteMultipleResponse;
            if (response is null) continue;

            foreach (var item in response.Responses)
            {
                job.Processed++;
                if (item.Fault is not null)
                {
                    job.Failed++;
                    var recordId = item.RequestIndex < chunk.Length ? chunk[item.RequestIndex].Id.ToString() : item.RequestIndex.ToString();
                    job.Errors.Add(new MigrationJobError(recordId, item.Fault.InnerFault?.Message ?? item.Fault.Message));
                }
                else
                {
                    job.Deleted++;
                }
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
