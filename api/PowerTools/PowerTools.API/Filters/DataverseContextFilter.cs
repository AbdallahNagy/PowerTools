using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Services;

namespace PowerTools.API.Filters;

/// <summary>
/// Endpoint filter that extracts the user's Bearer token and the target
/// Dataverse environment URL from request headers, validates them, and
/// stashes them on HttpContext.Items for downstream handlers.
/// </summary>
public class DataverseContextFilter : IEndpointFilter
{
    public const string TokenKey = "DataverseToken";
    public const string EnvUrlKey = "DataverseEnvUrl";

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

        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(envUrl))
            return Results.BadRequest(
                "Missing Authorization header or X-Environment-Url header.");

        http.Items[TokenKey] = token;
        http.Items[EnvUrlKey] = envUrl;

        return await next(ctx);
    }
}

public static class DataverseContextExtensions
{
    public static string GetDataverseToken(this HttpContext ctx) =>
        (string)ctx.Items[DataverseContextFilter.TokenKey]!;

    public static string GetEnvironmentUrl(this HttpContext ctx) =>
        (string)ctx.Items[DataverseContextFilter.EnvUrlKey]!;

    public static string? GetTargetDataverseToken(this HttpContext ctx) =>
        ctx.Items[DataverseTargetContextFilter.TargetTokenKey] as string;

    public static string? GetTargetEnvironmentUrl(this HttpContext ctx) =>
        ctx.Items[DataverseTargetContextFilter.TargetEnvUrlKey] as string;

    public static ServiceClient CreateDataverseClient(
        this HttpContext ctx,
        DataverseClientFactory factory)
    {
        var client = factory.Create(ctx.GetDataverseToken(), ctx.GetEnvironmentUrl());
        ctx.Response.RegisterForDispose(client);
        return client;
    }

    public static ServiceClient? CreateTargetDataverseClient(
        this HttpContext ctx,
        DataverseClientFactory factory)
    {
        var token = ctx.GetTargetDataverseToken();
        var envUrl = ctx.GetTargetEnvironmentUrl();
        if (token is null || envUrl is null) return null;
        var client = factory.Create(token, envUrl);
        ctx.Response.RegisterForDispose(client);
        return client;
    }
}
