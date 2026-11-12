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
        builder.Services.AddSingleton<PowerTools.API.Tools.SolutionLayers.ISolutionLayersCache>(_ => new PowerTools.API.Tools.SolutionLayers.SolutionLayersCache());
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
    public async Task Schema_route_without_a_publisher_answers_400_with_the_choices_and_writes_nothing()
    {
        var (status, body) = await Post("/api/agent/schema/tables",
            """{"schemaName":"new_Project","displayName":"Project","pluralName":"Projects","ownership":"user"}""");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("PublisherRequired", body.GetProperty("code").GetString());
        Assert.Contains("contoso (new)", body.GetProperty("message").GetString());
        Assert.Empty(fake.Executed);
    }

    [Fact]
    public async Task Schema_route_creates_a_choice_and_answers_its_name_and_id()
    {
        var id = Guid.NewGuid();
        fake.OnExecute = _ => Responses.Of<Microsoft.Xrm.Sdk.Messages.CreateOptionSetResponse>(("OptionSetId", id));

        var (status, body) = await Post("/api/agent/schema/choices",
            """{"schemaName":"new_colors","displayName":"Colors","solution":"Core","options":[{"label":"Red"}]}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("new_colors", body.GetProperty("name").GetString());
        Assert.Equal(id, body.GetProperty("metadataId").GetGuid());
    }

    [Fact]
    public async Task A_malformed_body_answers_the_shared_error_shape()
    {
        var (status, body) = await Post("/api/agent/schema/tables", "{nope");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("InvalidRequest", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Without_a_connection_the_filter_refuses()
    {
        using var bare = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
        var response = await bare.GetAsync("/api/agent/metadata/publishers");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
