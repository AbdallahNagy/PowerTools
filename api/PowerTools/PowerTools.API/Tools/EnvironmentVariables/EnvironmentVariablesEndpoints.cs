using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.EnvironmentVariables;

public static class EnvironmentVariablesEndpoints
{
    public static IEndpointRouteBuilder MapEnvironmentVariablesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/environment-variables")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).ListAsync(ct)));

        group.MapGet("/solutions", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).ListSolutionsAsync(ct)));

        group.MapPost("/definitions", async (
            CreateDefinitionBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).CreateDefinitionAsync(body, ct)));

        group.MapPut("/definitions/{id}", async (
            string id,
            UpdateDefinitionBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).UpdateDefinitionAsync(id, body, ct)));

        group.MapDelete("/definitions/{id}", async (
            string id,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DeleteDefinitionAsync(id, ct)));

        group.MapPost("/values", async (
            SaveValuesBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).SaveValuesAsync(body, ct)));

        group.MapDelete("/values/{valueId}", async (
            string valueId,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DeleteValueAsync(valueId, ct)));

        return app;
    }

    private static EnvironmentVariablesService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(
            new DataverseEnvironmentVariablesClient(ctx.CreateDataverseClient(factory)),
            ctx.GetDataverseConnectionContext() is OnPremisesConnectionContext);

    private static IResult ToHttp<T>(EnvironmentVariablesResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message, dependencies = result.Problem.Dependencies },
                statusCode: result.Problem.Status);
}
