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
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Kernel;

/// <summary>The generic /plan and /apply routes over real HTTP, with the test family registered in DI.</summary>
public sealed class ApplyEndpointTests : IAsyncLifetime
{
    private readonly HashSet<string> world = [];
    private FakeAgentClient fake = null!;
    private WebApplication app = null!;
    private HttpClient http = null!;

    public async Task InitializeAsync()
    {
        fake = KernelFakes.Client(world);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddSingleton<DataverseClientFactory>();
        builder.Services.AddSingleton<IConnectionStore, InMemoryConnectionStore>();
        builder.Services.AddScoped<DataverseContextFilter>();
        builder.Services.AddSingleton<PowerTools.API.Tools.PluginRegistration.Inspection.IPluginAssemblyInspector>(new FakeInspector());
        builder.Services.AddSingleton<PowerTools.API.Tools.SolutionLayers.ISolutionLayersCache>(_ => new PowerTools.API.Tools.SolutionLayers.SolutionLayersCache());
        builder.Services.AddSingleton<IAgentClientSource>(new FixedClientSource(fake));
        builder.Services.AddSingleton<ICapabilitiesCache>(new CapabilitiesCache());
        builder.Services.AddSingleton(new KernelOptions(TimeSpan.FromSeconds(5), KernelFakes.NoWaitRetry()));
        builder.Services.AddSingleton<IApplyFamily>(new ApplyFamily<ItemsSpec>("items", new ItemsPlanner(world)));
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

    private async Task<(HttpStatusCode Status, JsonElement Body)> Post(string path, string json)
    {
        var response = await http.PostAsync(path, new StringContent(json, Encoding.UTF8, "application/json"));
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(text.Length > 0, $"{(int)response.StatusCode} with an empty body");
        return (response.StatusCode, JsonDocument.Parse(text).RootElement.Clone());
    }

    [Fact]
    public async Task Plan_answers_steps_effect_and_hash_and_changes_nothing()
    {
        var (status, body) = await Post("/api/agent/items/plan", """{"solution":"Core","items":["a","b"],"destructive":["b"]}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("destructive", body.GetProperty("effect").GetString());
        Assert.Equal(64, body.GetProperty("hash").GetString()!.Length);
        Assert.Equal(2, body.GetProperty("steps").GetArrayLength());
        Assert.Equal("createItem", body.GetProperty("steps")[0].GetProperty("op").GetString());
        Assert.DoesNotContain(fake.Executed, r => r.RequestName == "CreateItem");
    }

    [Fact]
    public async Task Apply_with_the_approved_hash_runs_and_answers_the_result_contract()
    {
        var spec = """{"solution":"Core","items":["a"]}""";
        var (_, plan) = await Post("/api/agent/items/plan", spec);

        var (status, body) = await Post("/api/agent/items/apply", $$"""{"spec":{{spec}},"planHash":"{{plan.GetProperty("hash").GetString()}}"}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("applied", body.GetProperty("outcome").GetString());
        Assert.Equal("done", body.GetProperty("steps")[0].GetProperty("status").GetString());
        Assert.Equal(0, body.GetProperty("remaining").GetProperty("steps").GetArrayLength());
        Assert.Contains("a", world);
    }

    [Fact]
    public async Task Apply_with_a_stale_hash_is_refused()
    {
        var (status, body) = await Post("/api/agent/items/apply", """{"spec":{"solution":"Core","items":["a"]},"planHash":"stale"}""");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("refused", body.GetProperty("outcome").GetString());
        Assert.Equal("PlanChanged", body.GetProperty("code").GetString());
        Assert.DoesNotContain("a", world);
    }

    [Fact]
    public async Task Apply_without_a_hash_is_a_bad_request()
    {
        var (status, body) = await Post("/api/agent/items/apply", """{"spec":{"items":["a"]}}""");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("InvalidRequest", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_unknown_family_is_not_found_and_bad_json_is_a_bad_request()
    {
        var (missing, missingBody) = await Post("/api/agent/nothing/plan", "{}");
        var (bad, badBody) = await Post("/api/agent/items/plan", "{not json");

        Assert.Equal(HttpStatusCode.NotFound, missing);
        Assert.Equal("NotFound", missingBody.GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, bad);
        Assert.Equal("InvalidRequest", badBody.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Capabilities_route_answers_the_probe()
    {
        var response = await http.GetAsync("/api/agent/capabilities");
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("9.2.25010.100", body.GetProperty("version").GetString());
        Assert.Contains(body.GetProperty("tables").EnumerateArray(), t => t.GetString() == "customapi");
    }
}
