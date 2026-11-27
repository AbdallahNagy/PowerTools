using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Dyno.Mcp;

/// <summary>
/// The stdio side of the Dyno MCP server. An MCP client starts this as a child process and
/// speaks newline-delimited JSON-RPC to it; the connector relays each message to the endpoint the
/// desktop app hosts on loopback. It holds no MCP logic: when the app is not running it only answers
/// enough (initialize, tools/list, ping) to stay connected, then picks the app up when it appears.
/// Stdout carries JSON-RPC lines only; diagnostics go to stderr.
/// <para>
/// The desktop app copies this connector to a per-user folder and does not replace a copy that is running, so a
/// client may keep using an older connector with a newer app. Keep what it depends on small and stable: the
/// discovery file's { port, token } and MCP Streamable HTTP on http://127.0.0.1:{port}/mcp with a bearer token.
/// Anything new belongs in the app, not here.
/// </para>
/// </summary>
public static class McpConnector
{
    public const string OfflineMessage =
        "Dyno is not running or its MCP server is off. Start Dyno and turn it on under Settings > Agents (MCP); the tools will appear automatically.";

    public const string InterruptedMessage =
        "The connection to Dyno was lost while the call was running. It may have completed; check before retrying.";

    public static async Task<int> RunAsync(string[] args, Stream stdin, Stream stdout, CancellationToken ct)
    {
        var discoveryPath = ArgValue(args, "--discovery") ?? McpDiscovery.DefaultPath();
        var poll = MsArg(args, "--poll-ms", 2000);
        // Hidden; tests shorten it.
        var handshake = MsArg(args, "--handshake-ms", 15000);
        await using var relay = new Relay(discoveryPath, poll, handshake, stdout, ct);
        await relay.RunAsync(stdin);
        return 0;
    }

    private static string? ArgValue(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private static TimeSpan MsArg(string[] args, string name, int fallback) =>
        TimeSpan.FromMilliseconds(int.TryParse(ArgValue(args, name), out var parsed) && parsed > 0 ? parsed : fallback);

    private static string? MethodOf(JsonObject message) =>
        message["method"] is JsonValue value && value.TryGetValue<string>(out var method) ? method : null;

    /// <summary>
    /// Ok: answered. Unsent: the app provably did not act on it (no connection, or it rejected the session or token
    /// before dispatching), so sending it again is safe. Lost: the connection failed after the request may have
    /// reached the app, so it may have run. Error: the app answered with another HTTP error.
    /// </summary>
    private enum Outcome { Ok, Unsent, Lost, Error }

    private static readonly TimeSpan WatchInterval = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan SseRetryMin = TimeSpan.FromMilliseconds(300);
    private static readonly TimeSpan SseRetryMax = TimeSpan.FromSeconds(5);

    private sealed class Relay : IAsyncDisposable
    {
        private readonly string _discoveryPath;
        private readonly TimeSpan _poll;
        private readonly TimeSpan _handshake;
        private readonly StreamWriter _out;
        private readonly object _outLock = new();
        // Connecting to a closed loopback port takes about two seconds on Windows, and far longer when the machine is
        // busy. A live app accepts at once, so a short connect timeout only speeds up noticing that it has gone.
        private readonly HttpClient _http = new(new SocketsHttpHandler { ConnectTimeout = TimeSpan.FromSeconds(1) })
        {
            Timeout = Timeout.InfiniteTimeSpan,
        };
        private readonly CancellationTokenSource _lifetime;
        private readonly SemaphoreSlim _gate = new(1, 1);

        // Written while holding _gate. Relays read them without it, so a read can mix two states (the tuple is not
        // atomic); a request sent with a stale pair fails with 404 and is re-checked through the generation.
        private volatile bool _online;
        private int _generation;
        private (int Port, string Token)? _endpoint;
        private string? _sessionId;
        private CancellationTokenSource? _sseCts;
        private Task _sseTask = Task.CompletedTask;
        private JsonNode? _initialize;

        public Relay(string discoveryPath, TimeSpan poll, TimeSpan handshake, Stream stdout, CancellationToken ct)
        {
            _discoveryPath = discoveryPath;
            _poll = poll;
            _handshake = handshake;
            _out = new StreamWriter(stdout, new UTF8Encoding(false), 1024, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
            _lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        }

        public async Task RunAsync(Stream stdin)
        {
            var poller = Task.Run(() => PollAsync(_lifetime.Token));
            var pending = new List<Task>();
            using var reader = new StreamReader(stdin, new UTF8Encoding(false));
            try
            {
                while (!_lifetime.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync(_lifetime.Token);
                    if (line is null) break;
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    JsonNode? message;
                    try { message = JsonNode.Parse(line); }
                    catch (JsonException)
                    {
                        Console.Error.WriteLine("dyno-mcp: answering a line that is not JSON with a parse error");
                        WriteError(null, -32700, "Parse error");
                        continue;
                    }

                    if (message is not JsonObject obj) continue;

                    if (MethodOf(obj) == "initialize")
                    {
                        // Later messages depend on the state this sets, so it finishes first.
                        await GuardAsync(obj, () => HandleInitializeAsync(obj));
                    }
                    else
                    {
                        pending.Add(GuardAsync(obj, () => HandleAsync(obj)));
                        pending.RemoveAll(t => t.IsCompleted);
                    }
                }
            }
            catch (OperationCanceledException) { }

            // stdin closed: let relays already in flight finish, then stop the background work.
            // A relay that is still waiting after five seconds is given up on, so the process can always exit.
            await Task.WhenAny(Task.WhenAll(pending), Task.Delay(5000));
            _lifetime.Cancel();
            await Task.WhenAny(poller, Task.Delay(1000));
            await Task.WhenAny(_sseTask, Task.Delay(1000));
            // Only after the background work has stopped, so nothing reconnects once the session is gone.
            await EndSessionAsync();
        }

        /// <summary>Tells the app the session is over, so it does not hold a slot for it. Best effort.</summary>
        private async Task EndSessionAsync()
        {
            if (!_online || _endpoint is not { } endpoint || _sessionId is not { } sessionId) return;
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                using var request = NewRequest(HttpMethod.Delete, endpoint, sessionId, "application/json");
                using var response = await _http.SendAsync(request, timeout.Token);
            }
            catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException) { }
        }

        private async Task GuardAsync(JsonObject message, Func<Task> work)
        {
            try
            {
                await work();
            }
            catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"dyno-mcp: {ex.GetType().Name}: {ex.Message}");
                if (message["id"] is not null) WriteError(message["id"], -32000, Offline);
            }
        }

        // ── Message handling ─────────────────────────────────────────────────

        private async Task HandleInitializeAsync(JsonObject message)
        {
            // Held throughout so the poller cannot start a second session while this one is being made.
            await _gate.WaitAsync(_lifetime.Token);
            try
            {
                _initialize = message.DeepClone();
                if (ReadEndpoint() is { } endpoint)
                {
                    string? sessionId = null;
                    var (outcome, _) = await HandshakePostAsync(endpoint, null, message, true, s => sessionId = s);
                    if (outcome == Outcome.Ok && sessionId is not null)
                    {
                        SetOnline(endpoint, sessionId);
                        return;
                    }
                }

                WriteOfflineInitialize(message);
            }
            finally { _gate.Release(); }
        }

        private async Task HandleAsync(JsonObject message)
        {
            if (!_online)
            {
                AnswerOffline(message);
                return;
            }

            var generation = _generation;
            var (endpoint, sessionId) = (_endpoint, _sessionId);
            var (outcome, status) = await PostAsync(endpoint!.Value, sessionId, message, true, null, _lifetime.Token);
            var toolCall = MethodOf(message) == "tools/call";
            if (outcome is Outcome.Unsent or Outcome.Lost)
            {
                // The app restarted or the session is gone: start a new session. Send the message again only if the
                // app cannot have acted on it. A tool call may change data, so one that was lost in flight is not
                // repeated; anything else only reads and is safe to ask again.
                var resend = outcome == Outcome.Unsent || !toolCall;
                if (await ReconnectAsync(generation) && resend)
                {
                    (outcome, status) = await PostAsync(_endpoint!.Value, _sessionId, message, true, null, _lifetime.Token);
                    if (outcome is Outcome.Unsent or Outcome.Lost) await GoOfflineAsync(true);
                }
            }

            if (outcome == Outcome.Ok) return;
            if (message["id"] is not null)
            {
                WriteError(message["id"], -32000, outcome switch
                {
                    Outcome.Error => $"Dyno answered HTTP {status}.",
                    Outcome.Lost when toolCall => InterruptedMessage,
                    _ => Offline,
                });
            }
        }

        private void AnswerOffline(JsonObject message)
        {
            var id = message["id"];
            if (id is null) return; // A notification: nothing to answer.
            switch (MethodOf(message))
            {
                case "tools/list":
                    WriteResult(id, new JsonObject { ["tools"] = new JsonArray() });
                    break;
                case "resources/list":
                    WriteResult(id, new JsonObject { ["resources"] = new JsonArray() });
                    break;
                case "ping":
                    WriteResult(id, new JsonObject());
                    break;
                default:
                    WriteError(id, -32000, Offline);
                    break;
            }
        }

        /// <remarks>
        /// The client keeps the capabilities it gets here for the whole session, even after the app appears. They must
        /// match what the app offers (createSession in desktop/src/electron/mcp/mcpServer.ts): tools, and resources for the guides.
        /// </remarks>
        private void WriteOfflineInitialize(JsonObject message)
        {
            var result = new JsonObject
            {
                ["protocolVersion"] = message["params"]?["protocolVersion"]?.DeepClone() ?? "2025-03-26",
                ["serverInfo"] = new JsonObject { ["name"] = "dyno", ["version"] = "connector" },
                ["capabilities"] = new JsonObject
                {
                    ["tools"] = new JsonObject { ["listChanged"] = true },
                    ["resources"] = new JsonObject(),
                },
                ["instructions"] = Offline,
            };
            WriteResult(message["id"], result);
        }

        // ── Connection state ─────────────────────────────────────────────────

        private (int Port, string Token)? ReadEndpoint() => McpDiscovery.TryRead(_discoveryPath);

        /// <summary>The offline message with what the discovery file says, read when it is sent.</summary>
        private string Offline => McpDiscovery.OfflineMessage(_discoveryPath, McpDiscovery.DefaultPath(), McpDiscovery.IsRunning);

        /// <summary>Call while holding _gate.</summary>
        private void SetOnline((int Port, string Token) endpoint, string sessionId)
        {
            _generation++;
            _endpoint = endpoint;
            _sessionId = sessionId;
            _online = true;
            _sseCts?.Cancel();
            _sseCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            var generation = _generation;
            var token = _sseCts.Token;
            _sseTask = Task.Run(() => SseLoopAsync(endpoint, sessionId, generation, token));
        }

        private async Task GoOfflineAsync(bool notify)
        {
            await _gate.WaitAsync(_lifetime.Token);
            try { GoOfflineLocked(notify); }
            finally { _gate.Release(); }
        }

        /// <summary>Call while holding _gate.</summary>
        private void GoOfflineLocked(bool notify)
        {
            if (!_online) return;
            _online = false;
            _generation++;
            _sseCts?.Cancel();
            if (notify) WriteNotification("notifications/tools/list_changed");
        }

        /// <summary>Starts a new session on the endpoint in the discovery file. False, and offline, if that fails.</summary>
        private async Task<bool> ReconnectAsync(int failedGeneration)
        {
            await _gate.WaitAsync(_lifetime.Token);
            try
            {
                if (_online && _generation != failedGeneration) return true; // Someone else already did.
                if (ReadEndpoint() is { } endpoint && await ReplayInitializeAsync(endpoint) is { } sessionId)
                {
                    SetOnline(endpoint, sessionId);
                    return true;
                }

                GoOfflineLocked(true);
                return false;
            }
            finally { _gate.Release(); }
        }

        /// <summary>Replays the client's initialize and notifications/initialized to the app. Returns the new session id.</summary>
        private async Task<string?> ReplayInitializeAsync((int Port, string Token) endpoint)
        {
            if (_initialize?.DeepClone() is not JsonObject init) return null;
            init["id"] = "dyno-connector-init";
            string? sessionId = null;
            var (outcome, _) = await HandshakePostAsync(endpoint, null, init, false, s => sessionId = s);
            if (outcome != Outcome.Ok || sessionId is null) return null;
            var initialized = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" };
            (outcome, _) = await HandshakePostAsync(endpoint, sessionId, initialized, false, null);
            return outcome == Outcome.Ok ? sessionId : null;
        }

        /// <summary>
        /// A handshake message, with a time limit. These run while holding _gate, and the client's initialize also
        /// holds up reading stdin, so an app that accepts the connection and then never answers must not stall them.
        /// </summary>
        private async Task<(Outcome, int)> HandshakePostAsync(
            (int Port, string Token) endpoint, string? sessionId, JsonNode message, bool emit, Action<string>? onSession)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            timeout.CancelAfter(_handshake);
            try
            {
                return await PostAsync(endpoint, sessionId, message, emit, onSession, timeout.Token);
            }
            catch (OperationCanceledException) when (!_lifetime.IsCancellationRequested)
            {
                Console.Error.WriteLine("dyno-mcp: Dyno did not answer the handshake in time");
                return (Outcome.Lost, 0);
            }
        }

        private async Task PollAsync(CancellationToken ct)
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await Task.Delay(_poll, ct);
                    if (_online || _initialize is null) continue;
                    await _gate.WaitAsync(ct);
                    try
                    {
                        if (_online || ReadEndpoint() is not { } endpoint) continue;
                        if (await ReplayInitializeAsync(endpoint) is { } sessionId)
                        {
                            SetOnline(endpoint, sessionId);
                            WriteNotification("notifications/tools/list_changed");
                        }
                    }
                    finally { _gate.Release(); }
                }
            }
            catch (OperationCanceledException) { }
        }

        // ── HTTP ─────────────────────────────────────────────────────────────

        private static HttpRequestMessage NewRequest(HttpMethod method, (int Port, string Token) endpoint, string? sessionId, string accept)
        {
            var request = new HttpRequestMessage(method, $"http://127.0.0.1:{endpoint.Port}/mcp");
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {endpoint.Token}");
            request.Headers.TryAddWithoutValidation("Accept", accept);
            if (sessionId is not null) request.Headers.TryAddWithoutValidation("Mcp-Session-Id", sessionId);
            return request;
        }

        /// <summary>
        /// Sends one message and relays the answer. A request can legitimately take minutes, so it has no time limit; but
        /// while it waits, the discovery file is watched. The app deletes it when it stops, so a file that no longer names
        /// this endpoint means nobody is going to answer, and the request is given up on at once instead of hanging.
        /// </summary>
        private async Task<(Outcome, int)> PostAsync(
            (int Port, string Token) endpoint, string? sessionId, JsonNode message, bool emit,
            Action<string>? onSession, CancellationToken ct)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var watcher = WatchEndpointAsync(endpoint, linked);
            try
            {
                return await PostCoreAsync(endpoint, sessionId, message, emit, onSession, ct, linked.Token);
            }
            finally
            {
                linked.Cancel();
                await watcher;
            }
        }

        private async Task WatchEndpointAsync((int Port, string Token) endpoint, CancellationTokenSource request)
        {
            try
            {
                while (true)
                {
                    await Task.Delay(WatchInterval, request.Token);
                    if (ReadEndpoint() != endpoint)
                    {
                        request.Cancel();
                        return;
                    }
                }
            }
            catch (OperationCanceledException) { }
        }

        private async Task<(Outcome, int)> PostCoreAsync(
            (int Port, string Token) endpoint, string? sessionId, JsonNode message, bool emit,
            Action<string>? onSession, CancellationToken outer, CancellationToken ct)
        {
            using var request = NewRequest(HttpMethod.Post, endpoint, sessionId, "application/json, text/event-stream");
            request.Content = new StringContent(message.ToJsonString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response;
            try
            {
                response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            }
            catch (HttpRequestException ex)
            {
                // No connection was made, so the app never saw the request. Any other failure may come after it did.
                return (ex.HttpRequestError == HttpRequestError.ConnectionError ? Outcome.Unsent : Outcome.Lost, 0);
            }
            catch (OperationCanceledException ex) when (!outer.IsCancellationRequested)
            {
                // The connect timeout (nothing sent), or the app went away while this waited; not a shutdown.
                return (ex.InnerException is TimeoutException ? Outcome.Unsent : Outcome.Lost, 0);
            }

            using (response)
            {
                var status = (int)response.StatusCode;
                // The app checks the token and the session before it dispatches anything.
                if (status is 404 or 401) return (Outcome.Unsent, status);
                if (!response.IsSuccessStatusCode) return (Outcome.Error, status);
                if (onSession is not null && response.Headers.TryGetValues("Mcp-Session-Id", out var ids)) onSession(ids.First());
                if (status == 202) return (Outcome.Ok, status);

                try
                {
                    if (response.Content.Headers.ContentType?.MediaType == "text/event-stream")
                    {
                        await using var stream = await response.Content.ReadAsStreamAsync(ct);
                        await foreach (var data in ReadSseAsync(stream, ct))
                        {
                            if (emit) WriteRaw(data);
                        }
                    }
                    else
                    {
                        var body = await response.Content.ReadAsStringAsync(ct);
                        if (emit && !string.IsNullOrWhiteSpace(body)) WriteRaw(body);
                    }
                }
                catch (IOException)
                {
                    return (Outcome.Lost, status);
                }
                catch (OperationCanceledException) when (!outer.IsCancellationRequested)
                {
                    return (Outcome.Lost, status);
                }
            }

            return (Outcome.Ok, 200);
        }

        /// <summary>Holds the server-to-client stream open and relays what the app pushes, such as list_changed.</summary>
        private async Task SseLoopAsync((int Port, string Token) endpoint, string sessionId, int generation, CancellationToken ct)
        {
            var retry = SseRetryMin;
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    // The app deletes the discovery file when it stops, and rewrites it when it starts again. If it no
                    // longer names this endpoint, the stream is gone for good; no need to try connecting to find out.
                    if (ReadEndpoint() != endpoint)
                    {
                        await ReconnectAsync(generation);
                        return;
                    }

                    var lost = false;
                    var failed = false;
                    try
                    {
                        using var request = NewRequest(HttpMethod.Get, endpoint, sessionId, "text/event-stream");
                        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
                        var status = (int)response.StatusCode;
                        if (status == 405) return; // The app offers no push stream.
                        if (status is 404 or 401)
                        {
                            lost = true;
                        }
                        else if (response.IsSuccessStatusCode)
                        {
                            retry = SseRetryMin;
                            await using var stream = await response.Content.ReadAsStreamAsync(ct);
                            await foreach (var data in ReadSseAsync(stream, ct)) WriteRaw(data);
                        }
                        else
                        {
                            failed = true; // The app is up but erroring: back off rather than ask again every 300ms.
                        }
                    }
                    catch (HttpRequestException) { lost = true; }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested) { lost = true; }
                    catch (IOException) { }

                    if (lost)
                    {
                        await ReconnectAsync(generation);
                        return;
                    }

                    await Task.Delay(retry, ct);
                    if (failed) retry = TimeSpan.FromTicks(Math.Min(retry.Ticks * 2, SseRetryMax.Ticks));
                }
            }
            catch (OperationCanceledException) { }
        }

        private static async IAsyncEnumerable<string> ReadSseAsync(Stream stream, [EnumeratorCancellation] CancellationToken ct)
        {
            using var reader = new StreamReader(stream, Encoding.UTF8);
            var data = new StringBuilder();
            while (true)
            {
                var line = await reader.ReadLineAsync(ct);
                if (line is null)
                {
                    if (data.Length > 0) yield return data.ToString();
                    yield break;
                }

                if (line.Length == 0)
                {
                    if (data.Length > 0) yield return data.ToString();
                    data.Clear();
                }
                else if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    var value = line[5..];
                    if (value.StartsWith(' ')) value = value[1..];
                    if (data.Length > 0) data.Append('\n');
                    data.Append(value);
                }
            }
        }

        // ── Output ───────────────────────────────────────────────────────────

        /// <summary>Writes a JSON-RPC message as one line. Text that is not JSON is dropped so stdout stays clean.</summary>
        private void WriteRaw(string json)
        {
            JsonNode? node;
            try { node = JsonNode.Parse(json); }
            catch (JsonException) { return; }

            if (node is JsonArray array)
            {
                foreach (var item in array)
                {
                    if (item is not null) WriteLine(item.ToJsonString());
                }
            }
            else if (node is not null)
            {
                WriteLine(node.ToJsonString());
            }
        }

        private void WriteLine(string line)
        {
            lock (_outLock) _out.WriteLine(line);
        }

        private void WriteResult(JsonNode? id, JsonNode result) =>
            WriteLine(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id?.DeepClone(), ["result"] = result }.ToJsonString());

        private void WriteError(JsonNode? id, int code, string message) =>
            WriteLine(new JsonObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = id?.DeepClone(),
                ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
            }.ToJsonString());

        private void WriteNotification(string method) =>
            WriteLine(new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method }.ToJsonString());

        public ValueTask DisposeAsync()
        {
            _lifetime.Cancel();
            _http.Dispose();
            _out.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
