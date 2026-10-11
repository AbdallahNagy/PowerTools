using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.SolutionLayers;

public static class SolutionLayersEndpoints
{
    public static IEndpointRouteBuilder MapSolutionLayersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/solution-layers")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/component-types", async (
            HttpContext ctx,
            DataverseClientFactory factory,
            ISolutionLayersCache cache,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, cache).GetComponentTypesAsync(ct)));

        group.MapGet("/components", async (
            int? componentType,
            string? search,
            string? entity,
            HttpContext ctx,
            DataverseClientFactory factory,
            ISolutionLayersCache cache,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, cache).SearchComponentsAsync(componentType, search, entity, ct)));

        group.MapGet("/layers", async (
            int? componentType,
            string? componentId,
            HttpContext ctx,
            DataverseClientFactory factory,
            ISolutionLayersCache cache,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, cache).GetLayersAsync(componentType, componentId, ct)));

        group.MapPost("/remove-active", async (
            RemoveActiveBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            ISolutionLayersCache cache,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, cache).RemoveActiveAsync(body, ct)));

        return app;
    }

    private static SolutionLayersService Service(
        HttpContext ctx,
        DataverseClientFactory factory,
        ISolutionLayersCache cache) =>
        new(
            new DataverseSolutionLayersClient(ctx.CreateDataverseClient(factory)),
            cache,
            ConnectionKey(ctx.GetDataverseConnectionContext()));

    private static string ConnectionKey(DataverseConnectionContext connection) =>
        connection is OnPremisesConnectionContext onPremises
            ? $"{connection.EnvironmentUrl.ToLowerInvariant()}|{onPremises.Domain}\\{onPremises.Username}"
            : connection.EnvironmentUrl.ToLowerInvariant();

    private static IResult ToHttp<T>(SolutionLayersResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
