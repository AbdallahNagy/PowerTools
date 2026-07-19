using Microsoft.Crm.Sdk.Messages;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Connection;

public static class ConnectionEndpoints
{
    public static IEndpointRouteBuilder MapConnectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api");

        group.MapGet("/connect",
            (HttpContext ctx, DataverseClientFactory factory) =>
            {
                try
                {
                    var svc = ctx.CreateDataverseClient(factory);
                    var who = (WhoAmIResponse)svc.Execute(new WhoAmIRequest());
                    return Results.Ok(new
                        { connected = true, environment = ctx.GetEnvironmentUrl(), userId = who.UserId });
                }
                catch (Exception ex)
                {
                    return Results.Json(
                        new { connected = false, environment = ctx.GetEnvironmentUrl(), error = DataverseErrorFormatter.Format(ex) },
                        statusCode: StatusCodes.Status502BadGateway);
                }
            }).AddEndpointFilter<DataverseContextFilter>()
            .WithName("Connect");

        group.MapPost("/connections/validate-onpremise",
            (OnPremisesConnectionRequest request, DataverseClientFactory factory, ILoggerFactory loggerFactory) =>
            {
                try
                {
                    var context = request.ToContext();
                    var svc = factory.Create(context);
                    try
                    {
                        var who = (WhoAmIResponse)svc.Execute(new WhoAmIRequest());
                        return Results.Ok(new
                            { connected = true, environment = request.EnvironmentUrl, userId = who.UserId });
                    }
                    finally
                    {
                        (svc as IDisposable)?.Dispose();
                    }
                }
                catch (Exception ex)
                {
                    loggerFactory.CreateLogger("PowerTools.API.Connection")
                        .LogError(
                            ex,
                            "On-premises connection validation failed for {EnvironmentUrl} using {AuthMode}",
                            request.EnvironmentUrl,
                            request.AuthMode);
                    return Results.Json(
                        new { connected = false, environment = request.EnvironmentUrl, error = DataverseErrorFormatter.Format(ex) },
                        statusCode: StatusCodes.Status502BadGateway);
                }
            });

        group.MapPost("/connections/register-onpremise",
            (OnPremisesConnectionRequest request, DataverseClientFactory factory, IConnectionStore store, ILoggerFactory loggerFactory) =>
            {
                try
                {
                    var context = request.ToContext();
                    var svc = factory.Create(context);
                    try
                    {
                        svc.Execute(new WhoAmIRequest());
                        store.Upsert(request.Name, context);
                        return Results.Ok(new { success = true });
                    }
                    finally
                    {
                        (svc as IDisposable)?.Dispose();
                    }
                }
                catch (Exception ex)
                {
                    loggerFactory.CreateLogger("PowerTools.API.Connection")
                        .LogError(
                            ex,
                            "On-premises connection registration failed for {EnvironmentUrl} using {AuthMode}",
                            request.EnvironmentUrl,
                            request.AuthMode);
                    return Results.BadRequest(new { success = false, error = DataverseErrorFormatter.Format(ex) });
                }
            });

        group.MapDelete("/connections/{name}",
            (string name, IConnectionStore store) =>
            {
                store.Delete(name);
                return Results.Ok(new { success = true });
            });

        return app;
    }

    public sealed record OnPremisesConnectionRequest(
        string Name,
        string EnvironmentUrl,
        string AuthMode,
        string Username,
        string Password,
        string Domain)
    {
        public OnPremisesConnectionContext ToContext() =>
            new(EnvironmentUrl, AuthMode, Username, Password, Domain);
    }
}
