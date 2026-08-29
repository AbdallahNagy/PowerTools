using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Catalog;

public sealed class PluginRegistrationEndpointsTests
{
    [Fact]
    public void Application_maps_one_get_catalog_endpoint()
    {
        using var factory = new PluginRegistrationApplicationFactory();
        _ = factory.Server;

        var matches = factory.Services
            .GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Where(endpoint =>
                endpoint.RoutePattern.RawText == "/api/plugin-registration/catalog"
                && endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods
                    .Contains("GET", StringComparer.OrdinalIgnoreCase) == true)
            .ToArray();

        Assert.Single(matches);
    }

    private sealed class PluginRegistrationApplicationFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("port", "0");
            builder.UseSetting("secret", "test-secret");
        }
    }
}
