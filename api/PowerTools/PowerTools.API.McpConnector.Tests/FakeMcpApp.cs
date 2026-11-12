using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace PowerTools.API.McpConnector.Tests;

public sealed record SeenRequest(string Method, string? SessionId, string? Authorization, string? Rpc);

/// <summary>A stand-in for the desktop app's /mcp endpoint on a loopback port.</summary>
public sealed class FakeMcpApp : IAsyncDisposable
{
    public const string Token = "test-token";

    private readonly WebApplication _app;
    private readonly ConcurrentDictionary<string, bool> _sessions = new();
    private readonly Channel<string> _pushes = Channel.CreateUnbounded<string>();
    private int _nextSession;

    public int Port { get; }
    public ConcurrentQueue<SeenRequest> Seen { get; } = new();

    /// <summary>"json" answers tools/list as application/json; "sse" answers it as two SSE events.</summary>
    public string ListMode { get; set; } = "json";

    /// <summary>False answers the server-to-client GET with 405, as an app without a push stream would.</summary>
    public bool AllowPushStream { get; set; } = true;

    /// <summary>True makes tools/call wait forever, like an app that accepted the request and then stopped.</summary>
    public bool HangToolCalls { get; set; }

    private FakeMcpApp(WebApplication app, int port)
    {
        _app = app;
        Port = port;
    }

    public static async Task<FakeMcpApp> StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        FakeMcpApp? fake = null;
        app.Map("/mcp", ctx => fake!.HandleAsync(ctx));
        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        fake = new FakeMcpApp(app, new Uri(address).Port);
        return fake;
    }

    /// <summary>Forgets every session, as a restarted app would.</summary>
    public void InvalidateSessions() => _sessions.Clear();

    public void Push(string json) => _pushes.Writer.TryWrite(json);

    public int Count(string rpcMethod) =>
        Seen.Count(s => s.Rpc is not null && (JsonNode.Parse(s.Rpc)?["method"]?.GetValue<string>() == rpcMethod));

    private async Task HandleAsync(HttpContext ctx)
    {
        var request = ctx.Request;
        var session = request.Headers["Mcp-Session-Id"].FirstOrDefault();
        string? rpc = null;
        if (request.Method == "POST")
        {
            using var reader = new StreamReader(request.Body);
            rpc = await reader.ReadToEndAsync();
        }

        Seen.Enqueue(new SeenRequest(request.Method, session, request.Headers.Authorization.FirstOrDefault(), rpc));

        if (request.Headers.Authorization != $"Bearer {Token}")
        {
            ctx.Response.StatusCode = 401;
            return;
        }

        var message = rpc is null ? null : JsonNode.Parse(rpc);
        var method = message?["method"]?.GetValue<string>();
        if (method != "initialize" && (session is null || !_sessions.ContainsKey(session)))
        {
            ctx.Response.StatusCode = 404;
            return;
        }

        if (request.Method == "GET")
        {
            if (!AllowPushStream)
            {
                ctx.Response.StatusCode = 405;
                return;
            }

            ctx.Response.ContentType = "text/event-stream";
            await ctx.Response.WriteAsync(": open\n\n");
            await ctx.Response.Body.FlushAsync();
            try
            {
                await foreach (var push in _pushes.Reader.ReadAllAsync(ctx.RequestAborted))
                {
                    await ctx.Response.WriteAsync($"data: {push}\n\n");
                    await ctx.Response.Body.FlushAsync();
                }
            }
            catch (OperationCanceledException) { }

            return;
        }

        if (method == "initialize")
        {
            var id = $"session-{Interlocked.Increment(ref _nextSession)}";
            _sessions[id] = true;
            ctx.Response.Headers["Mcp-Session-Id"] = id;
            await WriteJsonAsync(ctx, new JsonObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = message!["id"]!.DeepClone(),
                ["result"] = new JsonObject { ["serverInfo"] = new JsonObject { ["name"] = "fake" } },
            });
            return;
        }

        if (message?["id"] is null)
        {
            ctx.Response.StatusCode = 202;
            return;
        }

        if (HangToolCalls && method == "tools/call")
        {
            try { await Task.Delay(Timeout.Infinite, ctx.RequestAborted); }
            catch (OperationCanceledException) { }
            return;
        }

        var response = new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = message["id"]!.DeepClone(),
            ["result"] = new JsonObject { ["tools"] = new JsonArray(new JsonObject { ["name"] = "connections_list" }) },
        };
        if (ListMode == "sse")
        {
            ctx.Response.ContentType = "text/event-stream";
            var note = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/message" };
            await ctx.Response.WriteAsync($"data: {note.ToJsonString()}\n\ndata: {response.ToJsonString()}\n\n");
            return;
        }

        await WriteJsonAsync(ctx, response);
    }

    private static async Task WriteJsonAsync(HttpContext ctx, JsonNode body)
    {
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(body.ToJsonString());
    }

    public async ValueTask DisposeAsync()
    {
        _pushes.Writer.TryComplete();
        // Short grace period: connections still open after it are aborted, as a quitting app would.
        using var grace = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        try { await _app.StopAsync(grace.Token); }
        catch (OperationCanceledException) { }

        await _app.DisposeAsync();
    }
}
