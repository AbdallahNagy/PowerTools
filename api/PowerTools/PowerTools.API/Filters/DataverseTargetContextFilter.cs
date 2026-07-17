using PowerTools.API.Services;

namespace PowerTools.API.Filters;

public class DataverseTargetContextFilter(IConnectionStore connectionStore) : IEndpointFilter
{
    public const string TargetTokenKey = "DataverseTargetToken";
    public const string TargetEnvUrlKey = "DataverseTargetEnvUrl";
    public const string TargetConnectionContextKey = "DataverseTargetConnectionContext";

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext ctx,
        EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;

        var auth = http.Request.Headers["X-Target-Authorization"].FirstOrDefault();
        var token = auth?.StartsWith("Bearer ") == true
            ? auth["Bearer ".Length..]
            : null;
        var envUrl = http.Request.Headers["X-Target-Environment-Url"].FirstOrDefault();

        if (!string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(envUrl))
        {
            http.Items[TargetTokenKey] = token;
            http.Items[TargetEnvUrlKey] = envUrl;
            http.Items[TargetConnectionContextKey] = new OnlineConnectionContext(envUrl, token);

            return await next(ctx);
        }

        var connectionName = http.Request.Headers["X-Target-Connection-Name"].FirstOrDefault();
        if (!string.IsNullOrEmpty(connectionName))
        {
            var connection = connectionStore.Get(connectionName);
            if (connection is null)
                return Results.BadRequest($"Target connection \"{connectionName}\" was not registered.");

            http.Items[TargetConnectionContextKey] = connection;
            http.Items[TargetEnvUrlKey] = connection.EnvironmentUrl;

            return await next(ctx);
        }

        return Results.BadRequest(
            "Missing X-Target-Authorization/X-Target-Environment-Url headers or X-Target-Connection-Name header.");
    }
}
