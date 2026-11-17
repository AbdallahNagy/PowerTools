using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Services;

namespace PowerTools.API.DataMigration.Tests.Support;

/// <summary>
/// The real sidecar in memory, with the source and target environments replaced by fakes. Calls go through
/// the /api/migration routes the desktop app uses.
/// </summary>
public sealed class MigrationApi : WebApplicationFactory<DataverseClientFactory>
{
    private const string Secret = "test-secret";
    private const string SourceUrl = "https://source.example.com";
    private const string TargetUrl = "https://target.example.com";

    public MigrationApi(FakeDataverse source, FakeDataverse target)
    {
        Source = source;
        Target = target;
    }

    public FakeDataverse Source { get; }
    public FakeDataverse Target { get; }

    /// <summary>While set and not signalled, creating a Dataverse client waits, as a slow connection does.</summary>
    public ManualResetEventSlim? HoldClientCreation { get; set; }

    /// <summary>Creating a Dataverse client fails with this error.</summary>
    public Exception? FailClientCreation { get; set; }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(config => config.AddInMemoryCollection(
        [
            new("port", "0"),
            new("secret", Secret),
        ]));
        return base.CreateHost(builder);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services =>
            services.AddSingleton<DataverseClientFactory>(new FakeClientFactory(this)));

    public async Task<(int Status, JsonNode? Body)> PostAsync(string path, object body)
    {
        using var client = Client();
        var response = await client.PostAsJsonAsync(path, body);
        return ((int)response.StatusCode, await ReadAsync(response));
    }

    public async Task<(int Status, JsonNode? Body)> GetAsync(string path)
    {
        using var client = Client();
        var response = await client.GetAsync(path);
        return ((int)response.StatusCode, await ReadAsync(response));
    }

    /// <summary>Starts a migration and polls its job until it ends. Returns the last job JSON.</summary>
    public async Task<JsonNode> RunAsync(object body) =>
        await WaitForStatusAsync(await StartAsync(body), "completed", "failed");

    /// <summary>Starts a migration and returns its job id.</summary>
    public async Task<string> StartAsync(object body)
    {
        var (status, started) = await PostAsync("/api/migration/run", body);
        if (status != 200) throw new InvalidOperationException($"Run returned {status}: {started}");
        return (string)started!["jobId"]!;
    }

    /// <summary>Polls a job until its status is one of <paramref name="statuses"/>. Returns the job JSON.</summary>
    public async Task<JsonNode> WaitForStatusAsync(string jobId, params string[] statuses)
    {
        var job = await PollAsync(jobId, TimeSpan.FromSeconds(30), statuses);
        return statuses.Contains((string)job["status"]!) ? job : throw new TimeoutException(job.ToJsonString());
    }

    /// <summary>
    /// Polls a job until its status is one of <paramref name="statuses"/> or the time runs out. Returns the
    /// last job JSON either way.
    /// </summary>
    public async Task<JsonNode> PollAsync(string jobId, TimeSpan timeout, params string[] statuses)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (true)
        {
            var (_, job) = await GetAsync($"/api/migration/jobs/{jobId}");
            if (statuses.Contains((string)job!["status"]!) || DateTime.UtcNow > deadline) return job;
            await Task.Delay(50);
        }
    }

    private HttpClient Client()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Local-Secret", Secret);
        client.DefaultRequestHeaders.Add("Authorization", "Bearer source-token");
        client.DefaultRequestHeaders.Add("X-Environment-Url", SourceUrl);
        client.DefaultRequestHeaders.Add("X-Target-Authorization", "Bearer target-token");
        client.DefaultRequestHeaders.Add("X-Target-Environment-Url", TargetUrl);
        return client;
    }

    private static async Task<JsonNode?> ReadAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrEmpty(text)) return null;
        try
        {
            return JsonNode.Parse(text);
        }
        catch (JsonException)
        {
            return JsonValue.Create(text);
        }
    }

    private sealed class FakeClientFactory(MigrationApi api) : DataverseClientFactory
    {
        public override IOrganizationServiceAsync2 Create(DataverseConnectionContext context)
        {
            api.HoldClientCreation?.Wait(TimeSpan.FromSeconds(30));
            if (api.FailClientCreation is not null) throw api.FailClientCreation;
            var fake = context.EnvironmentUrl switch
            {
                SourceUrl => api.Source,
                TargetUrl => api.Target,
                _ => throw new InvalidOperationException($"Unknown environment {context.EnvironmentUrl}"),
            };
            return fake.FailOpen is null ? fake.AsService() : throw fake.FailOpen;
        }
    }
}
