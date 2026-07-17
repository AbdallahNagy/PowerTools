using PowerTools.API.Services;

namespace PowerTools.API.Filters;

/// <summary>
/// Endpoint filter that extracts the user's Bearer token and the target
/// Dataverse environment URL from request headers, validates them, and
/// stashes them on HttpContext.Items for downstream handlers.
/// </summary>
public class DataverseContextFilter(IConnectionStore connectionStore) : IEndpointFilter
{
    public const string TokenKey = "DataverseToken";
    public const string EnvUrlKey = "DataverseEnvUrl";
    public const string ConnectionContextKey = "DataverseConnectionContext";

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext ctx,
        EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;

        var auth = http.Request.Headers.Authorization.FirstOrDefault();
        var token = auth?.StartsWith("Bearer ") == true
            ? auth["Bearer ".Length..]
            : null;
        var envUrl = http.Request.Headers["X-Environment-Url"].FirstOrDefault();

        if (!string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(envUrl))
        {
            http.Items[TokenKey] = token;
            http.Items[EnvUrlKey] = envUrl;
            http.Items[ConnectionContextKey] = new OnlineConnectionContext(envUrl, token);

            return await next(ctx);
        }

        var connectionName = http.Request.Headers["X-Connection-Name"].FirstOrDefault();
        if (!string.IsNullOrEmpty(connectionName))
        {
            var connection = connectionStore.Get(connectionName);
            if (connection is null)
                return Results.BadRequest($"Connection \"{connectionName}\" was not registered.");

            http.Items[ConnectionContextKey] = connection;
            http.Items[EnvUrlKey] = connection.EnvironmentUrl;

            return await next(ctx);
        }

        return Results.BadRequest(
            "Missing Authorization/X-Environment-Url headers or X-Connection-Name header.");
    }
}
