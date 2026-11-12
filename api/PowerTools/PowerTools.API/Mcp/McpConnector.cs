using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PowerTools.API.Mcp;

/// <summary>
/// The stdio side of the Power Tools MCP server. An MCP client starts this as a child process and
/// speaks newline-delimited JSON-RPC to it; the connector relays each message to the endpoint the
/// desktop app hosts on loopback. It holds no MCP logic: when the app is not running it only answers
/// enough (initialize, tools/list, ping) to stay connected, then picks the app up when it appears.
/// Stdout carries JSON-RPC lines only; diagnostics go to stderr.
/// </summary>
public static class McpConnector
{
    public const string OfflineMessage =
        "Power Tools is not running or its MCP server is off. Start Power Tools and turn on Settings → Agents (MCP); the tools will appear automatically.";

    public static async Task<int> RunAsync(string[] args, Stream stdin, Stream stdout, CancellationToken ct)
    {
        var discoveryPath = ArgValue(args, "--discovery") ?? McpDiscovery.DefaultPath();
        var pollMs = int.TryParse(ArgValue(args, "--poll-ms"), out var parsed) && parsed > 0 ? parsed : 2000;
        await using var relay = new Relay(discoveryPath, TimeSpan.FromMilliseconds(pollMs), stdout, ct);
        await relay.RunAsync(stdin);
        return 0;
    }

    private static string? ArgValue(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private enum Outcome { Ok, Reconnect, Error }

    private sealed class Relay : IAsyncDisposable
    {
        private readonly string _discoveryPath;
        private readonly TimeSpan _poll;
        private readonly StreamWriter _out;
        private readonly object _outLock = new();
        private readonly HttpClient _http = new() { Timeout = Timeout.InfiniteTimeSpan };
        private readonly CancellationTokenSource _lifetime;
        private readonly SemaphoreSlim _gate = new(1, 1);

        // Written while holding _gate; relays read them without it and re-check through the generation.
        private volatile bool _online;
        private int _generation;
        private (int Port, string Token)? _endpoint;
        private string? _sessionId;
        private CancellationTokenSource? _sseCts;
        private Task _sseTask = Task.CompletedTask;
        private JsonNode? _initialize;

        public Relay(string discoveryPath, TimeSpan poll, Stream stdout, CancellationToken ct)
        {
            _discoveryPath = discoveryPath;
            _poll = poll;
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
                        Console.Error.WriteLine("powertools-mcp: ignoring a line that is not JSON");
                        continue;
                    }

                    if (message is not JsonObject obj) continue;

                    if (obj["method"]?.GetValue<string>() == "initialize")
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
            await Task.WhenAll(pending);
            _lifetime.Cancel();
            await Task.WhenAny(poller, Task.Delay(1000));
            await Task.WhenAny(_sseTask, Task.Delay(1000));
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
                Console.Error.WriteLine($"powertools-mcp: {ex.GetType().Name}");
                if (message["id"] is not null) WriteError(message["id"], -32000, OfflineMessage);
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
                    var (outcome, _) = await PostAsync(endpoint, null, message, true, s => sessionId = s, _lifetime.Token);
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
            if (outcome == Outcome.Reconnect)
            {
                // The app restarted or the session is gone: start a new session and try once more.
                if (await ReconnectAsync(generation))
                {
                    (outcome, status) = await PostAsync(_endpoint!.Value, _sessionId, message, true, null, _lifetime.Token);
                    if (outcome == Outcome.Reconnect) await GoOfflineAsync(true);
                }
            }

            if (outcome == Outcome.Ok) return;
            if (message["id"] is not null)
            {
                WriteError(message["id"], -32000, outcome == Outcome.Error ? $"Power Tools answered HTTP {status}." : OfflineMessage);
            }
        }

        private void AnswerOffline(JsonObject message)
        {
            var id = message["id"];
            if (id is null) return; // A notification: nothing to answer.
            switch (message["method"]?.GetValue<string>())
            {
                case "tools/list":
                    WriteResult(id, new JsonObject { ["tools"] = new JsonArray() });
                    break;
                case "ping":
                    WriteResult(id, new JsonObject());
                    break;
                default:
                    WriteError(id, -32000, OfflineMessage);
                    break;
            }
        }

        private void WriteOfflineInitialize(JsonObject message)
        {
            var result = new JsonObject
            {
                ["protocolVersion"] = message["params"]?["protocolVersion"]?.DeepClone() ?? "2025-03-26",
                ["serverInfo"] = new JsonObject { ["name"] = "powertools", ["version"] = "connector" },
                ["capabilities"] = new JsonObject { ["tools"] = new JsonObject { ["listChanged"] = true } },
                ["instructions"] = OfflineMessage,
            };
            WriteResult(message["id"], result);
        }

        // ── Connection state ─────────────────────────────────────────────────

        private (int Port, string Token)? ReadEndpoint() => McpDiscovery.TryRead(_discoveryPath);

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
            init["id"] = "powertools-connector-init";
            string? sessionId = null;
            var (outcome, _) = await PostAsync(endpoint, null, init, false, s => sessionId = s, _lifetime.Token);
            if (outcome != Outcome.Ok || sessionId is null) return null;
            var initialized = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" };
            (outcome, _) = await PostAsync(endpoint, sessionId, initialized, false, null, _lifetime.Token);
            return outcome == Outcome.Ok ? sessionId : null;
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

        private async Task<(Outcome, int)> PostAsync(
            (int Port, string Token) endpoint, string? sessionId, JsonNode message, bool emit,
            Action<string>? onSession, CancellationToken ct)
        {
            using var request = NewRequest(HttpMethod.Post, endpoint, sessionId, "application/json, text/event-stream");
            request.Content = new StringContent(message.ToJsonString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response;
            try
            {
                response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            }
            catch (HttpRequestException)
            {
                return (Outcome.Reconnect, 0);
            }

            using (response)
            {
                var status = (int)response.StatusCode;
                if (status is 404 or 401) return (Outcome.Reconnect, status);
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
                    return (Outcome.Reconnect, status);
                }
            }

            return (Outcome.Ok, 200);
        }

        /// <summary>Holds the server-to-client stream open and relays what the app pushes, such as list_changed.</summary>
        private async Task SseLoopAsync((int Port, string Token) endpoint, string sessionId, int generation, CancellationToken ct)
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    var lost = false;
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
                            await using var stream = await response.Content.ReadAsStreamAsync(ct);
                            await foreach (var data in ReadSseAsync(stream, ct)) WriteRaw(data);
                        }
                    }
                    catch (HttpRequestException) { lost = true; }
                    catch (IOException) { }

                    if (lost)
                    {
                        await ReconnectAsync(generation);
                        return;
                    }

                    await Task.Delay(300, ct);
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
