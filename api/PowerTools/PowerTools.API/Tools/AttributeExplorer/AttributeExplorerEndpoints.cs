using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.AttributeExplorer;

public static class AttributeExplorerEndpoints
{
    public static IEndpointRouteBuilder MapAttributeExplorerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/attribute-explorer")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/tables", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetTablesAsync(ct)));

        group.MapGet("/tables/{logicalName}/attributes", async (
            string logicalName,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetAttributesAsync(logicalName, ct)));

        return app;
    }

    private static AttributeExplorerService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataverseAttributeExplorerClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(AttributeExplorerResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
