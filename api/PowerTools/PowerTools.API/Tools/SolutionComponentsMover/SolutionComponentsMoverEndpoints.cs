using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public static class SolutionComponentsMoverEndpoints
{
    public static IEndpointRouteBuilder MapSolutionComponentsMoverEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/solution-components-mover")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/solutions", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetSolutionsAsync(ct)));

        group.MapGet("/component-types", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetComponentTypesAsync(ct)));

        group.MapPost("/copies", async (
            StartCopyBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            ISolutionCopyJobStore store,
            CancellationToken ct) =>
        {
            var prepared = await Service(ctx, factory).PrepareAsync(body, ct);
            if (prepared.Problem is not null) return ToHttp(prepared);

            var jobId = store.Save(prepared.Value!, ctx.GetDataverseConnectionContext());
            return Results.Ok(new { jobId });
        });

        group.MapGet("/copies/{jobId:guid}", (Guid jobId, ISolutionCopyJobStore store) =>
        {
            var read = SolutionCopyJobs.Read(store, jobId);
            return read.Body is null ? Results.NotFound() : Results.Ok(read.Body);
        });

        return app;
    }

    private static SolutionComponentsMoverService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataverseSolutionComponentsMoverClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(SolutionComponentsResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
