using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
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

    [Fact]
    public async Task Catalog_returns_a_sanitized_problem_when_loading_fails()
    {
        using var factory = new PluginRegistrationApplicationFactory(useThrowingGateway: true);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/plugin-registration/catalog");
        request.Headers.Add("X-Local-Secret", "test-secret");
        request.Headers.Authorization = new("Bearer", "test-token");
        request.Headers.Add("X-Environment-Url", "https://org.crm.dynamics.com/path?access_token=secret");

        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        var problem = await response.Content.ReadFromJsonAsync<PluginRegistrationProblemDto>();

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.NotNull(problem);
        Assert.Equal("dataverse", problem.Category);
        Assert.Equal("registration-failed", problem.Code);
        Assert.Equal("https://org.crm.dynamics.com", problem.Environment);
        Assert.DoesNotContain("secret", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("stack trace", body, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class PluginRegistrationApplicationFactory(bool useThrowingGateway = false) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("port", "0");
            builder.UseSetting("secret", "test-secret");
            if (useThrowingGateway)
            {
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<IPluginRegistrationGatewayFactory>();
                    services.AddSingleton<IPluginRegistrationGatewayFactory, ThrowingGatewayFactory>();
                });
            }
        }
    }

    private sealed class ThrowingGatewayFactory : IPluginRegistrationGatewayFactory
    {
        public IPluginRegistrationGateway Create(IOrganizationServiceAsync2 service) => new ThrowingGateway();
    }

    private sealed class ThrowingGateway : IPluginRegistrationGateway
    {
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) =>
            Task.FromException<PluginRegistrationRows>(new InvalidOperationException(
                "secret stack trace details must never leave the sidecar"));
    }
}
