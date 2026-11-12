using System.Text.Json;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// Dataverse operations for the desktop MCP server's agent tools. Power Tools decides approval before it calls these;
/// the routes do not know the caller. Errors use the same { code, message, dataverseCode? } body as /api/community-tools.
/// </summary>
public static class AgentEndpoints
{
    public static IEndpointRouteBuilder MapAgentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/agent")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/metadata/publishers", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            await Run(async () => AgentPublishers.ToDtos(await AgentPublishers.ListAsync(Client(ctx, factory), ct))));

        AgentSchemaEndpoints.Map(group);
        AgentSolutionsEndpoints.Map(group);
        AgentPluginsEndpoints.Map(group);
        return app;
    }

    internal static IAgentClient Client(HttpContext ctx, DataverseClientFactory factory) =>
        ctx.RequestServices.GetService<IAgentClientSource>()?.Create(ctx)
        ?? new DataverseAgentClient(ctx.CreateDataverseClient(factory));

    /// <summary>Runs a service call and answers its value, or its problem in the shared error shape.</summary>
    internal static async Task<IResult> Run<T>(Func<Task<T>> work)
    {
        try
        {
            return Results.Ok(await work());
        }
        catch (Exception ex)
        {
            return ToHttp(AgentFaults.From(ex));
        }
    }

    internal static IResult ToHttp<T>(AgentResult<T> result) =>
        result.Problem is null ? Results.Ok(result.Value) : ToHttp(result.Problem);

    internal static IResult ToHttp(AgentProblem problem) =>
        Results.Json(problem.ToError(), statusCode: problem.Status);

    /// <summary>
    /// Reads the JSON body here instead of letting minimal-API binding do it, so a malformed or missing body
    /// answers with the same { code, message } shape as every other failure.
    /// </summary>
    internal static void Post<TRequest, TResult>(
        RouteGroupBuilder group,
        string route,
        Func<IAgentClient, TRequest, CancellationToken, Task<AgentResult<TResult>>> call)
        where TRequest : class =>
        PostWith<TRequest, TResult>(group, route, (ctx, factory, body, ct) => call(Client(ctx, factory), body, ct));

    /// <summary>Like <see cref="Post{TRequest,TResult}"/>, for services that need more than the client.</summary>
    internal static void PostWith<TRequest, TResult>(
        RouteGroupBuilder group,
        string route,
        Func<HttpContext, DataverseClientFactory, TRequest, CancellationToken, Task<AgentResult<TResult>>> call)
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
                return ToHttp(AgentFaults.InvalidRequest("The request body is not valid JSON for this operation."));
            }

            if (body is null) return ToHttp(AgentFaults.InvalidRequest("The request body must be a JSON object."));
            try
            {
                return ToHttp(await call(ctx, factory, body, ct));
            }
            catch (Exception ex)
            {
                return ToHttp(AgentFaults.From(ex));
            }
        });
}
