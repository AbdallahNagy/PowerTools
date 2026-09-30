using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.WorkflowActivities;

public static class WorkflowActivitiesEndpoints
{
    public static IEndpointRouteBuilder MapWorkflowActivitiesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workflow-activities")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetActivitiesAsync(ct)));

        group.MapGet("/{pluginTypeId}/processes", async (
            string pluginTypeId,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetProcessesAsync(pluginTypeId, ct)));

        return app;
    }

    private static WorkflowActivitiesService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataverseWorkflowActivitiesClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(WorkflowActivitiesResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
