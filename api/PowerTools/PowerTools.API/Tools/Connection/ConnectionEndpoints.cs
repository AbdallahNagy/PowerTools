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
                        new { connected = false, environment = ctx.GetEnvironmentUrl(), error = ex.Message },
                        statusCode: StatusCodes.Status502BadGateway);
                }
            }).AddEndpointFilter<DataverseContextFilter>()
            .WithName("Connect");

        group.MapPost("/connections/validate-onpremise",
            (OnPremisesConnectionRequest request, DataverseClientFactory factory) =>
            {
                try
                {
                    var context = request.ToContext();
                    using var svc = factory.Create(context);
                    var who = (WhoAmIResponse)svc.Execute(new WhoAmIRequest());
                    return Results.Ok(new
                        { connected = true, environment = request.EnvironmentUrl, userId = who.UserId });
                }
                catch (Exception ex)
                {
                    return Results.Json(
                        new { connected = false, environment = request.EnvironmentUrl, error = ex.Message },
                        statusCode: StatusCodes.Status502BadGateway);
                }
            });

        group.MapPost("/connections/register-onpremise",
            (OnPremisesConnectionRequest request, DataverseClientFactory factory, IConnectionStore store) =>
            {
                try
                {
                    var context = request.ToContext();
                    using var svc = factory.Create(context);
                    svc.Execute(new WhoAmIRequest());
                    store.Upsert(request.Name, context);
                    return Results.Ok(new { success = true });
                }
                catch (Exception ex)
                {
                    return Results.BadRequest(new { success = false, error = ex.Message });
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
