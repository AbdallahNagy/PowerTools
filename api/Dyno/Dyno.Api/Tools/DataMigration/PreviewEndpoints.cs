using Dyno.Api.Filters;
using Dyno.Api.Services;
using Dyno.Api.Tools.DataMigration.Dtos;
using Dyno.Api.Utils;

namespace Dyno.Api.Tools.DataMigration;

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
            var source = Source(ctx, factory);

            try
            {
                var table = await DataMigrationTable.OpenAsync(source, req.EntityLogicalName);
                var page = await table.PreviewPageAsync(req.FetchXmlFilter, req.Page, req.PageSize, req.PagingCookie);

                return Results.Ok(new
                {
                    records = page.Records.Select(r => new { id = r.Id.ToString(), name = r.Name }).ToList(),
                    pagingCookie = page.PagingCookie,
                    moreRecords = page.MoreRecords
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
            var source = Source(ctx, factory);

            try
            {
                var table = await DataMigrationTable.OpenAsync(source, req.EntityLogicalName);
                var count = await table.CountAsync(req.FetchXmlFilter, ct);
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
            var source = Source(ctx, factory);
            var target = Target(ctx, factory);

            try
            {
                var sourceTable = await DataMigrationTable.OpenAsync(source, req.EntityLogicalName);
                var targetTable = await DataMigrationTable.OpenAsync(target, req.EntityLogicalName);
                var (count, existing) = await sourceTable.CountInTargetAsync(targetTable, req.FetchXmlFilter, ct);
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
            var target = Target(ctx, factory);

            try
            {
                var table = await DataMigrationTable.OpenAsync(target, req.EntityLogicalName);
                var existing = await table.ExistingIdsAsync(req.Ids, ct);
                return Results.Ok(new { existingIds = existing.Select(id => id.ToString()) });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        // The target records the delete option removes: every target record of the
        // table whose id is not among the source records matching the filter.
        targetGroup.MapPost("/deletions", async (
            RecordCountRequest req,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var source = Source(ctx, factory);
            var target = Target(ctx, factory);

            try
            {
                var sourceTable = await DataMigrationTable.OpenAsync(source, req.EntityLogicalName);
                var targetTable = await DataMigrationTable.OpenAsync(target, req.EntityLogicalName);
                var (sourceCount, missing) = await targetTable.MissingFromSourceAsync(sourceTable, req.FetchXmlFilter, ct);
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

    // The request disposes the SDK clients when it ends, so these wrappers are not disposed here.
    private static DataverseDataMigrationClient Source(HttpContext ctx, DataverseClientFactory factory) =>
        new(ctx.CreateDataverseClient(factory));

    private static DataverseDataMigrationClient Target(HttpContext ctx, DataverseClientFactory factory) =>
        new(ctx.CreateTargetDataverseClient(factory)
            ?? throw new InvalidOperationException("Target connection was not provided."));
}
