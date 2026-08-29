using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationEndpoints
{
    public static IEndpointRouteBuilder MapPluginRegistrationEndpoints(
        this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/plugin-registration")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/catalog", async (
            HttpContext ctx,
            DataverseClientFactory clientFactory,
            IPluginRegistrationGatewayFactory gatewayFactory,
            PluginRegistrationCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var dataverseClient = ctx.CreateDataverseClient(clientFactory);
            var gateway = gatewayFactory.Create(dataverseClient);
            var catalog = await catalogService.RetrieveCatalogAsync(
                gateway,
                cancellationToken);
            return Results.Ok(catalog);
        }).WithName("GetPluginRegistrationCatalog");

        return app;
    }
}
