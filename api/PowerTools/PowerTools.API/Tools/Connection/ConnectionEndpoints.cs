using Microsoft.Crm.Sdk.Messages;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Connection;

public static class ConnectionEndpoints
{
    public static IEndpointRouteBuilder MapConnectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .AddEndpointFilter<DataverseContextFilter>();

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
            }).WithName("Connect");

        return app;
    }
}