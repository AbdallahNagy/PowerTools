using System.Text.Json;
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

        Post<RetrieveRecordRequest, DataRecordDto>(group, "/data/retrieve", (service, body, ct) => service.RetrieveAsync(body, ct));
        Post<FetchRecordsRequest, FetchPageDto>(group, "/data/fetch", (service, body, ct) => service.FetchAsync(body, ct));
        Post<CreateRecordRequest, CreatedRecordDto>(group, "/data/create", (service, body, ct) => service.CreateAsync(body, ct));
        Post<UpdateRecordRequest, EmptyResultDto>(group, "/data/update", (service, body, ct) => service.UpdateAsync(body, ct));
        Post<DeleteRecordRequest, EmptyResultDto>(group, "/data/delete", (service, body, ct) => service.DeleteAsync(body, ct));
        Post<RelateRecordsRequest, EmptyResultDto>(group, "/data/associate", (service, body, ct) => service.AssociateAsync(body, ct));
        Post<RelateRecordsRequest, EmptyResultDto>(group, "/data/disassociate", (service, body, ct) => service.DisassociateAsync(body, ct));
        Post<ExecuteMessageRequest, ExecuteResultDto>(group, "/data/execute", (service, body, ct) => service.ExecuteAsync(body, ct));
        Post<BatchRequest, BatchResultDto>(group, "/data/batch", (service, body, ct) => service.BatchAsync(body, ct));

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

    /// <summary>
    /// Reads the JSON body here instead of letting minimal-API binding do it, so a malformed or missing body
    /// answers with the same { code, message } shape as every other failure.
    /// </summary>
    private static void Post<TRequest, TResult>(
        RouteGroupBuilder group,
        string route,
        Func<CommunityToolService, TRequest, CancellationToken, Task<CommunityToolResult<TResult>>> call)
        where TRequest : class =>
        group.MapPost(route, async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
        {
            TRequest? body;
            try
            {
                body = await JsonSerializer.DeserializeAsync<TRequest>(ctx.Request.Body, JsonSerializerOptions.Web, ct);
            }
            catch (Exception ex) when (ex is JsonException or BadHttpRequestException or NotSupportedException)
            {
                return InvalidBody("The request body is not valid JSON for this operation.");
            }

            return body is null
                ? InvalidBody("The request body must be a JSON object.")
                : ToHttp(await call(Service(ctx, factory), body, ct));
        });

    private static IResult InvalidBody(string message) =>
        Results.Json(CommunityToolFaults.InvalidRequest(message).ToError(), statusCode: StatusCodes.Status400BadRequest);

    private static CommunityToolService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(ctx.RequestServices.GetService<ICommunityToolClientSource>()?.Create(ctx)
            ?? new DataverseCommunityToolClient(ctx.CreateDataverseClient(factory)));

    private static IResult ToHttp<T>(CommunityToolResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(result.Problem.ToError(), statusCode: result.Problem.Status);
}

/// <summary>
/// Supplies the Dataverse client for a request. The sidecar registers none and uses the connection from the
/// request headers; tests register one to drive the routes without an environment.
/// </summary>
public interface ICommunityToolClientSource
{
    ICommunityToolClient Create(HttpContext context);
}
