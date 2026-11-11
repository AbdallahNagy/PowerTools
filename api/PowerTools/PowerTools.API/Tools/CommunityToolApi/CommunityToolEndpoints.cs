using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.CommunityToolApi;

/// <summary>
/// Generic Dataverse endpoints the desktop shell calls on behalf of community tools.
/// The shell enforces each tool's permissions before calling; these endpoints do not know the caller.
/// </summary>
public static class CommunityToolEndpoints
{
    public static IEndpointRouteBuilder MapCommunityToolEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/community-tools")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapPost("/data/retrieve", async (RetrieveRecordRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).RetrieveAsync(body, ct)));

        group.MapPost("/data/fetch", async (FetchRecordsRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).FetchAsync(body, ct)));

        group.MapPost("/data/create", async (CreateRecordRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).CreateAsync(body, ct)));

        group.MapPost("/data/update", async (UpdateRecordRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).UpdateAsync(body, ct)));

        group.MapPost("/data/delete", async (DeleteRecordRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DeleteAsync(body, ct)));

        group.MapPost("/data/associate", async (RelateRecordsRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).AssociateAsync(body, ct)));

        group.MapPost("/data/disassociate", async (RelateRecordsRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).DisassociateAsync(body, ct)));

        group.MapPost("/data/execute", async (ExecuteMessageRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).ExecuteAsync(body, ct)));

        group.MapPost("/data/batch", async (BatchRequest body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).BatchAsync(body, ct)));

        group.MapGet("/metadata/tables", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetTablesAsync(ct)));

        group.MapGet("/metadata/tables/{name}", async (string name, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetTableAsync(name, ct)));

        group.MapGet("/metadata/tables/{name}/columns", async (string name, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetColumnsAsync(name, ct)));

        group.MapGet("/metadata/tables/{name}/relationships", async (string name, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetRelationshipsAsync(name, ct)));

        group.MapGet("/metadata/tables/{name}/columns/{column}/choices", async (
            string name,
            string column,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetChoicesAsync(name, column, ct)));

        return app;
    }

    private static CommunityToolService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(new DataverseCommunityToolClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(CommunityToolResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(result.Problem.ToError(), statusCode: result.Problem.Status);
}
