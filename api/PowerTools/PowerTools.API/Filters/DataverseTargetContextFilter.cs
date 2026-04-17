namespace PowerTools.API.Filters;

public class DataverseTargetContextFilter : IEndpointFilter
{
    public const string TargetTokenKey = "DataverseTargetToken";
    public const string TargetEnvUrlKey = "DataverseTargetEnvUrl";

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

        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(envUrl))
            return Results.BadRequest(
                "Missing X-Target-Authorization header or X-Target-Environment-Url header.");

        http.Items[TargetTokenKey] = token;
        http.Items[TargetEnvUrlKey] = envUrl;

        return await next(ctx);
    }
}
