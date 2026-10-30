using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.DataMigration.Dtos;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.DataMigration;

public static class MigrationEndpoints
{
    public static IEndpointRouteBuilder MapMigrationEndpoints(this IEndpointRouteBuilder app)
    {
        var runGroup = app.MapGroup("/api/migration")
            .AddEndpointFilter<DataverseContextFilter>()
            .AddEndpointFilter<DataverseTargetContextFilter>();

        runGroup.MapPost("/run", (
            RunMigrationRequest req,
            HttpContext ctx,
            IMigrationJobStore store) =>
        {
            if (!req.Create && !req.Update && !req.Delete)
                return Results.BadRequest(new { error = "Choose Create, Update, or Delete." });
            if (req.Delete && req.ConfirmedDeleteCount is null)
                return Results.BadRequest(new { error = "Confirm the records to delete before starting." });

            var job = new MigrationJob
            {
                SourceConnection = ctx.GetDataverseConnectionContext(),
                TargetConnection = ctx.GetTargetDataverseConnectionContext()
                    ?? throw new InvalidOperationException("Target connection was not provided."),
                EntityLogicalName = req.EntityLogicalName,
                Attributes = req.Attributes,
                FetchXmlFilter = req.FetchXmlFilter,
                Options = new MigrationOptions(req.Create, req.Update, req.Delete, req.ConfirmedDeleteCount)
            };

            store.Enqueue(job);
            return Results.Ok(new { jobId = job.Id });
        });

        var statusGroup = app.MapGroup("/api/migration");

        statusGroup.MapGet("/jobs/{jobId:guid}", (Guid jobId, IMigrationJobStore store) =>
        {
            var job = store.Get(jobId);
            if (job is null) return Results.NotFound();

            return Results.Ok(new
            {
                status = job.Status.ToString().ToLower(),
                processed = job.Processed,
                total = job.Total,
                succeeded = job.Succeeded,
                created = job.Created,
                updated = job.Updated,
                skipped = job.Skipped,
                deleted = job.Deleted,
                failed = job.Failed,
                errors = job.Errors.Select(e => new { recordId = e.RecordId, message = e.Message })
            });
        });

        return app;
    }
}
