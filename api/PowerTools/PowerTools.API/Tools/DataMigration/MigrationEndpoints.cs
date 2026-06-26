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
            var job = new MigrationJob
            {
                SourceToken = ctx.GetDataverseToken(),
                SourceEnvUrl = ctx.GetEnvironmentUrl(),
                TargetToken = ctx.GetTargetDataverseToken()!,
                TargetEnvUrl = ctx.GetTargetEnvironmentUrl()!,
                EntityLogicalName = req.EntityLogicalName,
                Attributes = req.Attributes,
                FetchXmlFilter = req.FetchXmlFilter,
                Mode = req.Mode
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
                failed = job.Failed,
                errors = job.Errors.Select(e => new { recordId = e.RecordId, message = e.Message })
            });
        });

        return app;
    }
}
