using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Utils;

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