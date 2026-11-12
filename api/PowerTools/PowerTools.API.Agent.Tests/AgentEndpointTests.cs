using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

/// <summary>Real HTTP requests through the /api/agent route group; only the Dataverse client is replaced.</summary>
public sealed class AgentEndpointTests : IAsyncLifetime
{
    private readonly FakeAgentClient fake = Data.Client();
    private WebApplication app = null!;
    private HttpClient http = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddSingleton<DataverseClientFactory>();
        builder.Services.AddSingleton<IConnectionStore, InMemoryConnectionStore>();
        builder.Services.AddScoped<DataverseContextFilter>();
        builder.Services.AddSingleton<IAgentClientSource>(new FixedClientSource(fake));
        app = builder.Build();
        app.MapAgentEndpoints();
        await app.StartAsync();

        http = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "test-token");
        http.DefaultRequestHeaders.Add("X-Environment-Url", "https://example.crm.dynamics.com");
    }

    public async Task DisposeAsync()
    {
        http.Dispose();
        await app.DisposeAsync();
    }

    public async Task<(HttpStatusCode Status, JsonElement Body)> Post(string path, string json)
    {
        var response = await http.PostAsync(path, new StringContent(json, Encoding.UTF8, "application/json"));
        return (response.StatusCode, JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone());
    }

    public async Task<(HttpStatusCode Status, JsonElement Body)> Get(string path)
    {
        var response = await http.GetAsync(path);
        return (response.StatusCode, JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone());
    }

    [Fact]
    public async Task Publishers_route_lists_unique_name_friendly_name_and_prefix()
    {
        var (status, body) = await Get("/api/agent/metadata/publishers");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(2, body.GetArrayLength());
        Assert.Equal("contoso", body[0].GetProperty("uniqueName").GetString());
        Assert.Equal("Contoso", body[0].GetProperty("friendlyName").GetString());
        Assert.Equal("new", body[0].GetProperty("prefix").GetString());
    }

    [Fact]
    public async Task Without_a_connection_the_filter_refuses()
    {
        using var bare = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
        var response = await bare.GetAsync("/api/agent/metadata/publishers");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
