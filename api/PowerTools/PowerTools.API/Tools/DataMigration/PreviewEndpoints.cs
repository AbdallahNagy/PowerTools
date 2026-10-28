using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.DataMigration.Dtos;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.DataMigration;

public static class PreviewEndpoints
{
    // The count covers every record; the list shown to the user stops here.
    private const int MaxListedDeletions = 1000;

    public static IEndpointRouteBuilder MapPreviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/migration")
            .AddEndpointFilter<DataverseContextFilter>();

        // One page of source records, shown by id and primary name.
        group.MapPost("/preview", async (
            PreviewRequest req,
            HttpContext ctx,
            DataverseClientFactory factory) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            try
            {
                var metadata = await DataMigrationRecords.GetEntityMetadataAsync(svc, req.EntityLogicalName);
                var nameAttribute = metadata.PrimaryNameAttribute;
                var fetchXml = DataMigrationFetchXml.Build(
                    req.EntityLogicalName,
                    [string.IsNullOrEmpty(nameAttribute) ? metadata.PrimaryIdAttribute : nameAttribute],
                    req.FetchXmlFilter,
                    req.Page,
                    req.PageSize,
                    req.PagingCookie);
                var result = await svc.RetrieveMultipleAsync(new FetchExpression(fetchXml));

                var records = result.Entities.Select(e => new
                {
                    id = e.Id.ToString(),
                    name = string.IsNullOrEmpty(nameAttribute) || !e.Contains(nameAttribute)
                        ? null
                        : e[nameAttribute]?.ToString()
                }).ToList();

                return Results.Ok(new
                {
                    records,
                    pagingCookie = result.PagingCookie,
                    moreRecords = result.MoreRecords
                });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        // How many source records the migration will send.
        group.MapPost("/count", async (
            RecordCountRequest req,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            try
            {
                var metadata = await DataMigrationRecords.GetEntityMetadataAsync(svc, req.EntityLogicalName);
                var count = await DataMigrationRecords.CountAsync(
                    svc, req.EntityLogicalName, metadata.PrimaryIdAttribute, req.FetchXmlFilter, ct);
                return Results.Ok(new { count });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        var targetGroup = app.MapGroup("/api/migration")
            .AddEndpointFilter<DataverseContextFilter>()
            .AddEndpointFilter<DataverseTargetContextFilter>();

        // How many source records the migration will send, and how many of them
        // already exist in the target, across all records rather than one page.
        targetGroup.MapPost("/count/target", async (
            RecordCountRequest req,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var svc = ctx.CreateDataverseClient(factory);
            var targetSvc = ctx.CreateTargetDataverseClient(factory)
                ?? throw new InvalidOperationException("Target connection was not provided.");

            try
            {
                var sourceMetadata = await DataMigrationRecords.GetEntityMetadataAsync(svc, req.EntityLogicalName);
                var targetMetadata = await DataMigrationRecords.GetEntityMetadataAsync(targetSvc, req.EntityLogicalName);
                var (count, existing) = await DataMigrationRecords.CountInTargetAsync(
                    svc,
                    targetSvc,
                    req.EntityLogicalName,
                    sourceMetadata.PrimaryIdAttribute,
                    targetMetadata.PrimaryIdAttribute,
                    req.FetchXmlFilter,
                    ct);
                return Results.Ok(new { count, existing });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        // Which of the previewed records already exist in the target, so each one
        // can be shown as a create or an update.
        targetGroup.MapPost("/existing", async (
            ExistingRecordsRequest req,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var targetSvc = ctx.CreateTargetDataverseClient(factory)
                ?? throw new InvalidOperationException("Target connection was not provided.");

            try
            {
                var metadata = await DataMigrationRecords.GetEntityMetadataAsync(targetSvc, req.EntityLogicalName);
                var existing = await DataMigrationRecords.FindExistingIdsAsync(
                    targetSvc, req.EntityLogicalName, metadata.PrimaryIdAttribute, req.Ids, ct);
                return Results.Ok(new { existingIds = existing.Select(id => id.ToString()) });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        // The target records the delete option removes: those matching the filter
        // whose id is not among the matching source records.
        targetGroup.MapPost("/deletions", async (
            RecordCountRequest req,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var svc = ctx.CreateDataverseClient(factory);
            var targetSvc = ctx.CreateTargetDataverseClient(factory)
                ?? throw new InvalidOperationException("Target connection was not provided.");

            try
            {
                var sourceMetadata = await DataMigrationRecords.GetEntityMetadataAsync(svc, req.EntityLogicalName);
                var targetMetadata = await DataMigrationRecords.GetEntityMetadataAsync(targetSvc, req.EntityLogicalName);
                var (sourceCount, missing) = await DataMigrationRecords.FindTargetRecordsMissingFromSourceAsync(
                    svc,
                    targetSvc,
                    req.EntityLogicalName,
                    sourceMetadata.PrimaryIdAttribute,
                    targetMetadata,
                    req.FetchXmlFilter,
                    ct);
                return Results.Ok(new
                {
                    count = missing.Count,
                    sourceCount,
                    records = missing.Take(MaxListedDeletions).Select(r => new { id = r.Id.ToString(), name = r.Name })
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        return app;
    }
}
