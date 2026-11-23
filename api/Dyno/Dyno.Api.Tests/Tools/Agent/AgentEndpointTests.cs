using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Dyno.Api.Filters;
using Dyno.Api.Services;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent;

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
        builder.Services.AddSingleton<Dyno.Api.Tools.PluginRegistration.Inspection.IPluginAssemblyInspector>(new FakeInspector());
        builder.Services.AddSingleton<IAgentClientSource>(new FixedClientSource(fake));
        builder.Services.AddSingleton<Dyno.Api.Tools.SolutionLayers.ISolutionLayersCache>(_ => new Dyno.Api.Tools.SolutionLayers.SolutionLayersCache());
        builder.Services.AddAgentApplyFamilies();
        // The capabilities probe: a version, and no feature tables.
        fake.OnExecute = request => request switch
        {
            Microsoft.Crm.Sdk.Messages.RetrieveVersionRequest => new Microsoft.Crm.Sdk.Messages.RetrieveVersionResponse { Results = new() { ["Version"] = "9.2.0.0" } },
            Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest r => throw FakeAgentClient.Fault(unchecked((int)0x80040217), $"{r.LogicalName} does not exist."),
            _ => new Microsoft.Xrm.Sdk.OrganizationResponse(),
        };
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
    public async Task The_inspect_routes_answer_lists_from_the_environment()
    {
        fake.ByEntity["appmodule"] = [new Microsoft.Xrm.Sdk.Entity("appmodule", Guid.NewGuid()) { ["name"] = "Sales Hub", ["uniquename"] = "msdyn_SalesHub" }];

        var (status, body) = await Post("/api/agent/inspect/ui", """{"kind":"app"}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(1, body.GetProperty("total").GetInt32());
        Assert.Equal("Sales Hub", body.GetProperty("items")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task The_new_families_plan_through_the_apply_routes()
    {
        var (status, body) = await Post(
            "/api/agent/records_write/plan",
            """{"operations":[{"op":"create","table":"account","values":{"name":"Contoso"}}]}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("create", body.GetProperty("steps")[0].GetProperty("op").GetString());
        Assert.Equal("change", body.GetProperty("effect").GetString());
    }

    [Fact]
    public async Task The_old_routes_are_gone()
    {
        var response = await http.PostAsync("/api/agent/schema/tables", new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_malformed_body_answers_the_shared_error_shape()
    {
        var (status, body) = await Post("/api/agent/inspect/ui", "{nope");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("InvalidRequest", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Without_a_connection_the_filter_refuses()
    {
        using var bare = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
        var response = await bare.PostAsync("/api/agent/inspect/ui", new StringContent("""{"kind":"app"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
