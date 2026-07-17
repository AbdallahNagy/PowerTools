using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Utils;

public static class DataverseContextExtensions
{
    public static string GetDataverseToken(this HttpContext ctx) =>
        ctx.GetDataverseConnectionContext() is OnlineConnectionContext online
            ? online.AccessToken
            : throw new InvalidOperationException("The current Dataverse connection does not use an online bearer token.");

    public static string GetEnvironmentUrl(this HttpContext ctx) =>
        ctx.GetDataverseConnectionContext().EnvironmentUrl;

    public static string? GetTargetDataverseToken(this HttpContext ctx) =>
        ctx.GetTargetDataverseConnectionContext() is OnlineConnectionContext online
            ? online.AccessToken
            : null;

    public static string? GetTargetEnvironmentUrl(this HttpContext ctx) =>
        ctx.GetTargetDataverseConnectionContext()?.EnvironmentUrl;

    public static DataverseConnectionContext GetDataverseConnectionContext(this HttpContext ctx) =>
        (DataverseConnectionContext)ctx.Items[DataverseContextFilter.ConnectionContextKey]!;

    public static DataverseConnectionContext? GetTargetDataverseConnectionContext(this HttpContext ctx) =>
        ctx.Items[DataverseTargetContextFilter.TargetConnectionContextKey] as DataverseConnectionContext;

    public static ServiceClient CreateDataverseClient(
        this HttpContext ctx,
        DataverseClientFactory factory)
    {
        var client = factory.Create(ctx.GetDataverseConnectionContext());
        ctx.Response.RegisterForDispose(client);
        return client;
    }

    public static ServiceClient? CreateTargetDataverseClient(
        this HttpContext ctx,
        DataverseClientFactory factory)
    {
        var connection = ctx.GetTargetDataverseConnectionContext();
        if (connection is null) return null;
        var client = factory.Create(connection);
        ctx.Response.RegisterForDispose(client);
        return client;
    }
}
