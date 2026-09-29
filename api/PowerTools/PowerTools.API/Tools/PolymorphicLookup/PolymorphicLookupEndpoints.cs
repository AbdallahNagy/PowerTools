using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.PolymorphicLookup;

public static class PolymorphicLookupEndpoints
{
    public static IEndpointRouteBuilder MapPolymorphicLookupEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/polymorphic-lookups")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/metadata", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetMetadataAsync(ct)));

        group.MapGet("/solutions", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetSolutionsAsync(ct)));

        group.MapPost("", async (
            CreatePolymorphicLookupBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).CreateAsync(body, ct)));

        group.MapPost("/relationships", async (
            AddRelationshipBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).AddRelationshipAsync(body, ct)));

        group.MapPut("/relationships/{schemaName}", async (
            string schemaName,
            UpdateRelationshipBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).UpdateRelationshipAsync(schemaName, body, ct)));

        group.MapDelete("/relationships/{schemaName}", async (
            string schemaName,
            string referencingEntityLogicalName,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DeleteRelationshipAsync(
                schemaName,
                referencingEntityLogicalName,
                ct)));

        group.MapDelete("/{entityLogicalName}/{attributeLogicalName}", async (
            string entityLogicalName,
            string attributeLogicalName,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DeleteAttributeAsync(
                entityLogicalName,
                attributeLogicalName,
                ct)));

        return app;
    }

    private static PolymorphicLookupService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataversePolymorphicLookupClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(ServiceResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
