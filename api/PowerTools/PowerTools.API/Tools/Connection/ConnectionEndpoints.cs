using PowerTools.API.Filters;

namespace PowerTools.API.Tools.Connection;

public static class ConnectionEndpoints
{
    public static IEndpointRouteBuilder MapConnectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .RequireAuthorization()
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/connect", (HttpContext ctx) =>
            Results.Ok(new { connected = true, environment = ctx.GetEnvironmentUrl() })
        ).WithName("Connect");

        return app;
    }
}
