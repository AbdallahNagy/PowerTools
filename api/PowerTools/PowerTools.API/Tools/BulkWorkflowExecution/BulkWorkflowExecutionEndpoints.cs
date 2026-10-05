using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public static class BulkWorkflowExecutionEndpoints
{
    public static IEndpointRouteBuilder MapBulkWorkflowExecutionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/bulk-workflow-execution")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/workflows", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetWorkflowsAsync(ct)));

        group.MapGet("/views", async (string? entity, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetViewsAsync(entity, ct)));

        group.MapPost("/count", async (CountBody body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).CountAsync(body, ct)));

        group.MapPost("/runs", async (
            StartRunBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IBulkWorkflowJobStore store,
            CancellationToken ct) =>
        {
            var prepared = await Service(ctx, factory).PrepareRunAsync(body, ct);
            if (prepared.Problem is not null) return ToHttp(prepared);

            var jobId = store.Save(prepared.Value!, ctx.GetDataverseConnectionContext());
            return Results.Ok(new { jobId });
        });

        group.MapGet("/runs/{jobId:guid}", (Guid jobId, IBulkWorkflowJobStore store) =>
            store.Get(jobId) is { } job ? Results.Ok(job.ToDto()) : Results.NotFound());

        group.MapPost("/runs/{jobId:guid}/cancel", (Guid jobId, IBulkWorkflowJobStore store) =>
        {
            var job = store.Get(jobId);
            if (job is null) return Results.NotFound();
            job.RequestCancel();
            return Results.Ok(job.ToDto());
        });

        return app;
    }

    private static BulkWorkflowExecutionService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataverseBulkWorkflowClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(BulkWorkflowResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
