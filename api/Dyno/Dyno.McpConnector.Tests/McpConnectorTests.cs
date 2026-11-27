using Xunit;
using System.IO.Pipelines;
using System.Text.Json.Nodes;
using Connector = Dyno.Mcp.McpConnector;

namespace Dyno.McpConnector.Tests;

/// <summary>Runs the connector against in-memory pipes and a temp discovery file.</summary>
public sealed class ConnectorHarness : IAsyncDisposable
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);
    private readonly Pipe _stdin = new();
    private readonly Pipe _stdout = new();
    private readonly StreamReader _lines;
    private readonly StreamWriter _input;
    private readonly Task<int> _run;

    public string DiscoveryPath { get; } = Path.Combine(Path.GetTempPath(), $"pt-mcp-{Guid.NewGuid():N}.json");
    public List<string> AllLines { get; } = [];

    public ConnectorHarness(params string[] extraArgs)
    {
        _lines = new StreamReader(_stdout.Reader.AsStream());
        _input = new StreamWriter(_stdin.Writer.AsStream()) { AutoFlush = true, NewLine = "\n" };
        _run = Connector.RunAsync(
            ["--discovery", DiscoveryPath, "--poll-ms", "50", .. extraArgs],
            _stdin.Reader.AsStream(),
            _stdout.Writer.AsStream(),
            CancellationToken.None);
    }

    public void WriteDiscovery(int port, string token = FakeMcpApp.Token) =>
        File.WriteAllText(DiscoveryPath, new JsonObject { ["port"] = port, ["token"] = token, ["pid"] = 1 }.ToJsonString());

    public void Send(JsonNode message) => _input.WriteLine(message.ToJsonString());

    public void SendLine(string line) => _input.WriteLine(line);

    public Task<JsonNode> ReadAsync() => ReadAsync(Timeout);

    public async Task<JsonNode> ReadAsync(TimeSpan timeout)
    {
        var line = await _lines.ReadLineAsync().WaitAsync(timeout);
        Assert.NotNull(line);
        AllLines.Add(line);
        return JsonNode.Parse(line)!;
    }

    public async Task<int> CloseStdinAsync()
    {
        await _stdin.Writer.CompleteAsync();
        var code = await _run.WaitAsync(Timeout);
        await _stdout.Writer.CompleteAsync();
        return code;
    }

    public static JsonObject Request(int id, string method, JsonNode? parameters = null) => new()
    {
        ["jsonrpc"] = "2.0",
        ["id"] = id,
        ["method"] = method,
        ["params"] = parameters,
    };

    public static JsonObject Initialize(int id = 1) => Request(id, "initialize", new JsonObject
    {
        ["protocolVersion"] = "2025-03-26",
        ["capabilities"] = new JsonObject(),
        ["clientInfo"] = new JsonObject { ["name"] = "test", ["version"] = "1" },
    });

    public static JsonObject Initialized() => new() { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" };

    public async ValueTask DisposeAsync()
    {
        try { await _stdin.Writer.CompleteAsync(); } catch { }
        try { await _run.WaitAsync(Timeout); } catch { }
        File.Delete(DiscoveryPath);
    }
}

public class McpConnectorTests
{
    private static void AssertAllJson(ConnectorHarness h)
    {
        foreach (var line in h.AllLines)
        {
            Assert.DoesNotContain('\n', line);
            Assert.NotNull(JsonNode.Parse(line));
        }
    }

    [Fact]
    public async Task Offline_answers_initialize_tools_list_and_ping_itself()
    {
        await using var h = new ConnectorHarness();

        h.Send(ConnectorHarness.Initialize(7));
        var init = await h.ReadAsync();
        Assert.Equal(7, init["id"]!.GetValue<int>());
        Assert.Equal("2025-03-26", init["result"]!["protocolVersion"]!.GetValue<string>());
        Assert.Equal("dyno", init["result"]!["serverInfo"]!["name"]!.GetValue<string>());
        Assert.True(init["result"]!["capabilities"]!["tools"]!["listChanged"]!.GetValue<bool>());
        Assert.NotNull(init["result"]!["capabilities"]!["resources"]);
        Assert.StartsWith(Connector.OfflineMessage, init["result"]!["instructions"]!.GetValue<string>());

        h.Send(ConnectorHarness.Initialized());
        h.Send(ConnectorHarness.Request(2, "tools/list"));
        var list = await h.ReadAsync();
        Assert.Empty(list["result"]!["tools"]!.AsArray());

        h.Send(ConnectorHarness.Request(3, "ping"));
        Assert.Empty((await h.ReadAsync())["result"]!.AsObject());

        h.Send(ConnectorHarness.Request(5, "resources/list"));
        Assert.Empty((await h.ReadAsync())["result"]!["resources"]!.AsArray());

        h.Send(ConnectorHarness.Request(4, "tools/call"));
        var error = await h.ReadAsync();
        Assert.Equal(-32000, error["error"]!["code"]!.GetValue<int>());
        Assert.StartsWith(Connector.OfflineMessage, error["error"]!["message"]!.GetValue<string>());

        AssertAllJson(h);
    }

    [Fact]
    public async Task Online_relays_a_json_response_and_sends_the_session_id_after_initialize()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);

        h.Send(ConnectorHarness.Initialize(1));
        var init = await h.ReadAsync();
        Assert.Equal("fake", init["result"]!["serverInfo"]!["name"]!.GetValue<string>());

        h.Send(ConnectorHarness.Initialized());
        h.Send(ConnectorHarness.Request(2, "tools/list"));
        var list = await h.ReadAsync();
        Assert.Equal(2, list["id"]!.GetValue<int>());
        Assert.Equal("connections_list", list["result"]!["tools"]![0]!["name"]!.GetValue<string>());

        var posts = app.Seen.Where(s => s.Method == "POST").ToList();
        Assert.Null(posts[0].SessionId);
        Assert.All(posts.Skip(1), p => Assert.Equal("session-1", p.SessionId));
        Assert.All(posts, p => Assert.Equal($"Bearer {FakeMcpApp.Token}", p.Authorization));
        AssertAllJson(h);
    }

    [Fact]
    public async Task Online_writes_each_sse_event_as_its_own_line()
    {
        await using var app = await FakeMcpApp.StartAsync();
        app.ListMode = "sse";
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);

        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());
        h.Send(ConnectorHarness.Request(2, "tools/list"));

        var first = await h.ReadAsync();
        var second = await h.ReadAsync();
        Assert.Equal("notifications/message", first["method"]!.GetValue<string>());
        Assert.Equal(2, second["id"]!.GetValue<int>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task Relays_notifications_pushed_on_the_server_stream()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();

        await WaitForAsync(() => app.Seen.Any(s => s.Method == "GET"));
        app.Push(new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/tools/list_changed" }.ToJsonString());
        var pushed = await h.ReadAsync();
        Assert.Equal("notifications/tools/list_changed", pushed["method"]!.GetValue<string>());
    }

    [Fact]
    public async Task Sends_list_changed_when_the_app_appears_after_an_offline_start()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();

        h.Send(ConnectorHarness.Initialize(1));
        Assert.Equal("dyno", (await h.ReadAsync())["result"]!["serverInfo"]!["name"]!.GetValue<string>());
        h.Send(ConnectorHarness.Initialized());

        h.WriteDiscovery(app.Port);
        var changed = await h.ReadAsync();
        Assert.Equal("notifications/tools/list_changed", changed["method"]!.GetValue<string>());
        Assert.Equal(1, app.Count("initialize"));
        await WaitForAsync(() => app.Count("notifications/initialized") == 1);

        h.Send(ConnectorHarness.Request(2, "tools/list"));
        var list = await h.ReadAsync();
        Assert.Equal("connections_list", list["result"]!["tools"]![0]!["name"]!.GetValue<string>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_404_reinitializes_and_retries_once()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        app.InvalidateSessions();
        h.Send(ConnectorHarness.Request(2, "tools/list"));
        var list = await h.ReadAsync();

        Assert.Equal(2, list["id"]!.GetValue<int>());
        Assert.Equal(2, app.Count("initialize"));
        Assert.Contains(app.Seen, s => s.Method == "POST" && s.SessionId == "session-2");
        AssertAllJson(h);
    }

    [Fact]
    public async Task Falls_back_to_offline_when_the_app_goes_away()
    {
        var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        File.Delete(h.DiscoveryPath);
        await app.DisposeAsync();

        var changed = await h.ReadAsync();
        Assert.Equal("notifications/tools/list_changed", changed["method"]!.GetValue<string>());

        h.Send(ConnectorHarness.Request(2, "tools/list"));
        Assert.Empty((await h.ReadAsync())["result"]!["tools"]!.AsArray());
        AssertAllJson(h);
    }

    [Fact]
    public async Task Answers_a_request_with_an_error_when_the_app_cannot_be_reached()
    {
        var app = await FakeMcpApp.StartAsync();
        app.AllowPushStream = false; // The connector only finds out when a request fails.
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        File.Delete(h.DiscoveryPath);
        await app.DisposeAsync();
        h.Send(ConnectorHarness.Request(5, "tools/call"));

        var changed = await h.ReadAsync();
        Assert.Equal("notifications/tools/list_changed", changed["method"]!.GetValue<string>());
        var error = await h.ReadAsync();
        Assert.Equal(5, error["id"]!.GetValue<int>());
        Assert.Equal(-32000, error["error"]!["code"]!.GetValue<int>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_request_in_flight_when_the_app_vanishes_is_answered_within_three_seconds()
    {
        await using var app = await FakeMcpApp.StartAsync();
        app.AllowPushStream = false;
        app.HangToolCalls = true;
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        // The app has the request and will never answer it. Then it stops, which removes the discovery file.
        h.Send(ConnectorHarness.Request(9, "tools/call"));
        await WaitForAsync(() => app.Count("tools/call") == 1);
        File.Delete(h.DiscoveryPath);

        var within = TimeSpan.FromSeconds(3);
        var first = await h.ReadAsync(within);
        var second = first["id"] is null ? await h.ReadAsync(within) : first;
        Assert.Equal(9, second["id"]!.GetValue<int>());
        Assert.Equal(-32000, second["error"]!["code"]!.GetValue<int>());
        // Exactly one answer for the request.
        Assert.Equal(1, h.AllLines.Count(l => JsonNode.Parse(l)!["id"]?.GetValue<int>() == 9));
    }

    [Fact]
    public async Task Exits_with_zero_when_stdin_closes()
    {
        await using var h = new ConnectorHarness();
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        Assert.Equal(0, await h.CloseStdinAsync());
    }

    [Fact]
    public async Task A_tool_call_cut_off_after_it_reached_the_app_is_not_sent_twice()
    {
        await using var app = await FakeMcpApp.StartAsync();
        app.AbortToolCalls = true;
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        h.Send(ConnectorHarness.Request(4, "tools/call"));
        var error = await h.ReadAsync();

        Assert.Equal(4, error["id"]!.GetValue<int>());
        Assert.Equal(Connector.InterruptedMessage, error["error"]!["message"]!.GetValue<string>());
        Assert.Equal(1, app.Count("tools/call"));
        // It still started a new session, so the next call works.
        Assert.Equal(2, app.Count("initialize"));
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_tool_call_rejected_with_404_is_retried_once()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();
        h.Send(ConnectorHarness.Initialized());

        app.InvalidateSessions();
        h.Send(ConnectorHarness.Request(6, "tools/call"));
        var result = await h.ReadAsync();

        Assert.Equal(6, result["id"]!.GetValue<int>());
        Assert.NotNull(result["result"]);
        Assert.Equal(2, app.Count("tools/call"));
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_request_whose_method_is_not_a_string_does_not_stop_the_connector()
    {
        await using var h = new ConnectorHarness();
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();

        h.SendLine("""{"jsonrpc":"2.0","id":3,"method":5}""");
        var error = await h.ReadAsync();
        Assert.Equal(3, error["id"]!.GetValue<int>());
        Assert.NotNull(error["error"]);

        h.Send(ConnectorHarness.Request(4, "ping"));
        Assert.Equal(4, (await h.ReadAsync())["id"]!.GetValue<int>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_line_that_is_not_json_gets_a_parse_error()
    {
        await using var h = new ConnectorHarness();
        h.SendLine("this is not json");

        var error = await h.ReadAsync();
        Assert.Null(error["id"]);
        Assert.Equal(-32700, error["error"]!["code"]!.GetValue<int>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task A_hung_initialize_falls_back_to_offline()
    {
        await using var app = await FakeMcpApp.StartAsync();
        app.HangInitialize = true;
        await using var h = new ConnectorHarness("--handshake-ms", "300");
        h.WriteDiscovery(app.Port);

        h.Send(ConnectorHarness.Initialize(1));
        var init = await h.ReadAsync();

        Assert.StartsWith(Connector.OfflineMessage, init["result"]!["instructions"]!.GetValue<string>());
        AssertAllJson(h);
    }

    [Fact]
    public async Task Closes_the_session_when_stdin_closes()
    {
        await using var app = await FakeMcpApp.StartAsync();
        await using var h = new ConnectorHarness();
        h.WriteDiscovery(app.Port);
        h.Send(ConnectorHarness.Initialize(1));
        await h.ReadAsync();

        Assert.Equal(0, await h.CloseStdinAsync());
        Assert.Contains(app.Seen, s => s.Method == "DELETE" && s.SessionId == "session-1");
    }

    private static async Task WaitForAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "Timed out waiting for a condition");
            await Task.Delay(20);
        }
    }
}
