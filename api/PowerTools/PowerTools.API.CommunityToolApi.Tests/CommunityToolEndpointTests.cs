using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.CommunityToolApi;
using Xunit;

namespace PowerTools.API.CommunityToolApi.Tests;

/// <summary>
/// Real HTTP requests through the /api/community-tools route group on a loopback Kestrel server,
/// so minimal-API binding, the connection filter and the result mapping are exercised together.
/// Only the Dataverse client is replaced.
/// </summary>
public sealed class CommunityToolEndpointTests : IAsyncLifetime
{
    private readonly FakeCommunityToolClient fake = new();
    private WebApplication app = null!;
    private HttpClient http = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddSingleton<DataverseClientFactory>();
        builder.Services.AddSingleton<IConnectionStore, InMemoryConnectionStore>();
        builder.Services.AddScoped<DataverseContextFilter>();
        builder.Services.AddSingleton<ICommunityToolClientSource>(new FixedClientSource(fake));
        app = builder.Build();
        app.MapCommunityToolEndpoints();
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

    [Fact]
    public async Task Data_route_retrieves_a_record_through_the_route_group()
    {
        var id = Guid.NewGuid();
        fake.RetrieveResult = new Entity("account", id) { ["name"] = "Contoso", ["score"] = double.NaN, ["logo"] = new byte[] { 1, 2 } };

        var response = await Post("/api/community-tools/data/retrieve", $$"""{"table":"account","id":"{{id}}","columns":["name"]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("account", json.GetProperty("logicalName").GetString());
        Assert.Equal(id.ToString("D"), json.GetProperty("id").GetString());
        var values = json.GetProperty("values");
        Assert.Equal("Contoso", values.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Null, values.GetProperty("score").ValueKind);
        Assert.Equal("AQI=", values.GetProperty("logo").GetString());
        Assert.Equal("account", fake.LastRetrieve!.Value.Table);
    }

    [Fact]
    public async Task Metadata_route_lists_tables_and_a_missing_table_is_404_with_the_error_shape()
    {
        fake.Tables.Add(Builders.Table("account", "Account"));
        fake.Tables.Add(Builders.Table("adx_invitation_redeemedcontacts"));

        var list = await http.GetAsync("/api/community-tools/metadata/tables");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var tables = JsonDocument.Parse(await list.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, tables.GetArrayLength());
        Assert.Equal("", tables[1].GetProperty("displayName").GetString());

        var missing = await http.GetAsync("/api/community-tools/metadata/tables/nope");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        AssertErrorShape(await missing.Content.ReadAsStringAsync(), "DataverseFault");
    }

    [Theory]
    [InlineData("{not json")]
    [InlineData("")]
    [InlineData("null")]
    [InlineData("""{"table":5}""")]
    public async Task Malformed_body_is_400_with_the_code_and_message_shape(string body)
    {
        var response = await Post("/api/community-tools/data/retrieve", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertErrorShape(await response.Content.ReadAsStringAsync(), "InvalidRequest");
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task Request_without_connection_headers_is_refused_before_the_client_is_used()
    {
        using var bare = new HttpClient { BaseAddress = http.BaseAddress };

        var response = await bare.GetAsync("/api/community-tools/metadata/tables");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(fake.Calls);
    }

    private Task<HttpResponseMessage> Post(string path, string body) =>
        http.PostAsync(path, new StringContent(body, Encoding.UTF8, "application/json"));

    private static void AssertErrorShape(string body, string code)
    {
        var json = JsonDocument.Parse(body).RootElement;
        Assert.Equal(code, json.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("message").GetString()));
    }

    private sealed class FixedClientSource(ICommunityToolClient client) : ICommunityToolClientSource
    {
        public ICommunityToolClient Create(HttpContext context) => client;
    }
}
