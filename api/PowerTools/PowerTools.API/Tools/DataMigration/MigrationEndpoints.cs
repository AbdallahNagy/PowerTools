using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

public record RunMigrationRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter,
    string Mode,
    string? MatchAttribute = null);

public static class MigrationEndpoints
{
    public static IEndpointRouteBuilder MapMigrationEndpoints(this IEndpointRouteBuilder app)
    {
        var runGroup = app.MapGroup("/api/migration")
            .RequireAuthorization()
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
                Mode = req.Mode,
                MatchAttribute = req.MatchAttribute
            };

            store.Enqueue(job);
            return Results.Ok(new { jobId = job.Id });
        });

        var statusGroup = app.MapGroup("/api/migration")
            .RequireAuthorization();

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
