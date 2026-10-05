using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public sealed partial class BulkWorkflowExecutionService(IBulkWorkflowClient client)
{
    public async Task<BulkWorkflowResult<WorkflowsResponse>> GetWorkflowsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var rows = await ReadAllAsync(
                (page, cookie) => BulkWorkflowQueries.Workflows(page, cookie),
                cancellationToken);
            return BulkWorkflowResult<WorkflowsResponse>.Ok(new WorkflowsResponse
            {
                Workflows = rows.Select(ToWorkflow).ToList(),
            });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return BulkWorkflowResult<WorkflowsResponse>.Fail(BulkWorkflowFaults.From(ex));
        }
    }

    public async Task<BulkWorkflowResult<ViewsResponse>> GetViewsAsync(string? entity, CancellationToken cancellationToken)
    {
        var name = entity?.Trim().ToLowerInvariant() ?? "";
        if (!LogicalName().IsMatch(name))
            return BulkWorkflowResult<ViewsResponse>.Fail(BulkWorkflowFaults.Local("InvalidEntity", "Choose a table."));

        try
        {
            var system = await ReadAllAsync(
                (page, cookie) => BulkWorkflowQueries.Views("savedquery", name, page, cookie),
                cancellationToken);
            var personal = await ReadAllAsync(
                (page, cookie) => BulkWorkflowQueries.Views("userquery", name, page, cookie),
                cancellationToken);
            var views = system.Select(row => ToView(row, "system"))
                .Concat(personal.Select(row => ToView(row, "personal")))
                .ToList();
            return BulkWorkflowResult<ViewsResponse>.Ok(new ViewsResponse { Views = views });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return BulkWorkflowResult<ViewsResponse>.Fail(BulkWorkflowFaults.From(ex));
        }
    }

    public async Task<BulkWorkflowResult<CountResponse>> CountAsync(CountBody body, CancellationToken cancellationToken)
    {
        var prepared = await PrepareQueryAsync(body.WorkflowId, body.FetchXml, cancellationToken);
        if (prepared.Problem is not null) return BulkWorkflowResult<CountResponse>.Fail(prepared.Problem);

        var (_, query, pageSize) = prepared.Value!;
        var ids = await CollectIdsAsync(query, pageSize, () => false, cancellationToken);
        if (ids.Problem is not null) return BulkWorkflowResult<CountResponse>.Fail(ids.Problem);

        return BulkWorkflowResult<CountResponse>.Ok(new CountResponse { Count = ids.Value!.Count, Entity = query.Entity });
    }

    public async Task<BulkWorkflowResult<PreparedRun>> PrepareRunAsync(StartRunBody body, CancellationToken cancellationToken)
    {
        var batchSize = body.BatchSize ?? BulkWorkflowLimits.DefaultBatchSize;
        if (batchSize is < BulkWorkflowLimits.MinBatchSize or > BulkWorkflowLimits.MaxBatchSize)
        {
            return BulkWorkflowResult<PreparedRun>.Fail(BulkWorkflowFaults.Local(
                "InvalidBatchSize",
                $"Batch size must be from {BulkWorkflowLimits.MinBatchSize} to {BulkWorkflowLimits.MaxBatchSize:N0}."));
        }

        var delaySeconds = body.DelaySeconds ?? 0;
        if (delaySeconds is < 0 or > BulkWorkflowLimits.MaxDelaySeconds)
        {
            return BulkWorkflowResult<PreparedRun>.Fail(BulkWorkflowFaults.Local(
                "InvalidDelay",
                $"Delay between batches must be from 0 to {BulkWorkflowLimits.MaxDelaySeconds} seconds."));
        }

        var prepared = await PrepareQueryAsync(body.WorkflowId, body.FetchXml, cancellationToken);
        if (prepared.Problem is not null) return BulkWorkflowResult<PreparedRun>.Fail(prepared.Problem);

        var (workflowId, query, pageSize) = prepared.Value!;
        return BulkWorkflowResult<PreparedRun>.Ok(new PreparedRun
        {
            WorkflowId = workflowId,
            Query = query,
            PageSize = pageSize,
            BatchSize = batchSize,
            DelaySeconds = delaySeconds,
        });
    }

    /// <summary>
    /// Pages the id-only query to the end and returns the distinct ids in server order.
    /// <paramref name="stop"/> is checked between pages.
    /// </summary>
    public async Task<BulkWorkflowResult<List<Guid>>> CollectIdsAsync(
        IdQuery query,
        int pageSize,
        Func<bool> stop,
        CancellationToken cancellationToken)
    {
        try
        {
            var seen = new HashSet<Guid>();
            var ids = new List<Guid>();
            string? cookie = null;
            for (var page = 1; ; page++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (stop()) break;

                var xml = BulkWorkflowFetchXml.ForPage(query, page, pageSize, cookie);
                var result = await client.RetrieveMultipleAsync(new FetchExpression(xml), cancellationToken);
                foreach (var row in result.Entities)
                {
                    var id = RowId(row, query.PrimaryIdAttribute);
                    if (id != Guid.Empty && seen.Add(id))
                        ids.Add(id);
                }

                if (query.Top is not null || !result.MoreRecords) break;
                if (string.IsNullOrEmpty(result.PagingCookie))
                    return BulkWorkflowResult<List<Guid>>.Fail(BulkWorkflowFaults.PagingCookieMissing());
                cookie = result.PagingCookie;
            }

            return BulkWorkflowResult<List<Guid>>.Ok(ids);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return BulkWorkflowResult<List<Guid>>.Fail(BulkWorkflowFaults.From(ex));
        }
    }

    private async Task<BulkWorkflowResult<(Guid WorkflowId, IdQuery Query, int PageSize)>> PrepareQueryAsync(
        string? workflowIdText,
        string? fetchXml,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(workflowIdText, out var workflowId) || workflowId == Guid.Empty)
            return Fail(BulkWorkflowFaults.WorkflowNotAvailable());

        try
        {
            var workflows = await client.RetrieveMultipleAsync(
                BulkWorkflowQueries.Workflows(1, null, workflowId),
                cancellationToken);
            var workflow = workflows.Entities.FirstOrDefault();
            if (workflow is null) return Fail(BulkWorkflowFaults.WorkflowNotAvailable());

            var workflowEntity = Text(workflow, "primaryentity");
            var check = BulkWorkflowFetchXml.Check(fetchXml, workflowEntity);
            if (check.Problem is not null) return Fail(check.Problem);

            var metadata = (RetrieveEntityResponse)await client.ExecuteAsync(
                BulkWorkflowQueries.EntityMetadata(check.Entity!),
                cancellationToken);
            var primaryId = metadata.EntityMetadata.PrimaryIdAttribute;
            if (string.IsNullOrWhiteSpace(primaryId))
            {
                return Fail(BulkWorkflowFaults.Local(
                    "NoPrimaryId",
                    $"The {check.Entity} table has no primary ID column."));
            }

            var pageSize = string.Equals(metadata.EntityMetadata.TableType, "Elastic", StringComparison.OrdinalIgnoreCase)
                ? BulkWorkflowLimits.ElasticIdPageSize
                : BulkWorkflowLimits.StandardIdPageSize;
            var query = BulkWorkflowFetchXml.ToIdQuery(fetchXml!, check.Entity!, primaryId);
            return BulkWorkflowResult<(Guid, IdQuery, int)>.Ok((workflowId, query, pageSize));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail(BulkWorkflowFaults.From(ex));
        }

        static BulkWorkflowResult<(Guid, IdQuery, int)> Fail(BulkWorkflowProblem problem) =>
            BulkWorkflowResult<(Guid, IdQuery, int)>.Fail(problem);
    }

    private async Task<List<Entity>> ReadAllAsync(
        Func<int, string?, QueryExpression> build,
        CancellationToken cancellationToken)
    {
        var rows = new List<Entity>();
        string? cookie = null;
        for (var page = 1; ; page++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await client.RetrieveMultipleAsync(build(page, cookie), cancellationToken);
            rows.AddRange(result.Entities);
            if (!result.MoreRecords) return rows;
            cookie = result.PagingCookie;
        }
    }

    private static WorkflowRowDto ToWorkflow(Entity row) =>
        new()
        {
            Id = row.Id.ToString(),
            Name = Text(row, "name"),
            PrimaryEntity = Text(row, "primaryentity"),
            Mode = Option(row, "mode") == 1 ? "realtime" : "background",
            RunAs = Option(row, "runas") == 1 ? "callingUser" : "owner",
            Scope = Option(row, "scope") switch
            {
                1 => "user",
                2 => "businessUnit",
                3 => "parentChildBusinessUnits",
                4 => "organization",
                _ => "",
            },
            IsManaged = row.Contains("ismanaged") && row["ismanaged"] is true,
            AsyncAutoDelete = row.Contains("asyncautodelete") && row["asyncautodelete"] is true,
        };

    private static ViewRowDto ToView(Entity row, string kind) =>
        new()
        {
            Id = row.Id.ToString(),
            Name = Text(row, "name"),
            Kind = kind,
            FetchXml = Text(row, "fetchxml"),
        };

    private static Guid RowId(Entity row, string primaryId)
    {
        if (row.Contains(primaryId))
        {
            switch (row[primaryId])
            {
                case Guid guid:
                    return guid;
                case AliasedValue { Value: Guid aliased }:
                    return aliased;
            }
        }

        return row.Id;
    }

    private static string Text(Entity row, string attribute) =>
        row.Contains(attribute) && row[attribute] is string text ? text : "";

    private static int? Option(Entity row, string attribute) =>
        row.Contains(attribute) && row[attribute] is OptionSetValue option ? option.Value : null;

    [GeneratedRegex("^[a-z][a-z0-9_]{0,127}$")]
    private static partial Regex LogicalName();
}
