using System.Diagnostics;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.Connection;
using PowerTools.API.Tools.DataMigration;
using PowerTools.API.Tools.Fetch;
using PowerTools.API.Tools.Metadata;

var builder = WebApplication.CreateBuilder(args);

// ── Sidecar arguments (passed by the Electron host) ──────────────────────────
//   --port <int>       Loopback port to bind. Required.
//   --secret <hex>     Per-launch shared secret. Required.
//   --parentPid <int>  PID of the spawning Electron process. Optional but
//                      strongly recommended — we self-terminate if the host
//                      dies, so orphaned sidecars cannot linger.
var port        = builder.Configuration["port"]
    ?? throw new InvalidOperationException("Missing required argument: --port");
var localSecret = builder.Configuration["secret"]
    ?? throw new InvalidOperationException("Missing required argument: --secret");
var parentPid   = builder.Configuration["parentPid"];

// Loopback only. No firewall prompts, nothing on the LAN can reach this.
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

// ── App services ─────────────────────────────────────────────────────────────
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<DataverseClientFactory>();
builder.Services.AddSingleton<IConnectionStore, InMemoryConnectionStore>();
builder.Services.AddScoped<ICurrentConnection, HttpContextCurrentConnection>();
builder.Services.AddScoped<DataverseContextFilter>();
builder.Services.AddScoped<DataverseTargetContextFilter>();
builder.Services.AddSingleton<IMigrationJobStore, InMemoryMigrationJobStore>();
builder.Services.AddHostedService<MigrationJobRunner>();

var app = builder.Build();

// ── CORS + local-secret gate ─────────────────────────────────────────────────
app.Use(async (ctx, next) =>
{
    var origin = ctx.Request.Headers.Origin.FirstOrDefault();
    if (!string.IsNullOrEmpty(origin))
    {
        ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
        ctx.Response.Headers.Append("Vary", "Origin");
    }

    if (HttpMethods.IsOptions(ctx.Request.Method))
    {
        var reqHeaders = ctx.Request.Headers["Access-Control-Request-Headers"].FirstOrDefault();
        if (!string.IsNullOrEmpty(reqHeaders))
            ctx.Response.Headers["Access-Control-Allow-Headers"] = reqHeaders;
        var reqMethod = ctx.Request.Headers["Access-Control-Request-Method"].FirstOrDefault();
        if (!string.IsNullOrEmpty(reqMethod))
            ctx.Response.Headers["Access-Control-Allow-Methods"] = reqMethod;
        ctx.Response.Headers["Access-Control-Max-Age"] = "600";
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    var header = ctx.Request.Headers["X-Local-Secret"].ToString();
    if (!CryptographicEquals(header, localSecret))
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }

    await next();
});

// ── Endpoint groups — one per tool ───────────────────────────────────────────
app.MapConnectionEndpoints();
app.MapMetadataEndpoints();
app.MapFetchEndpoints();
app.MapDataMigrationEndpoints();
app.MapPreviewEndpoints();
app.MapMigrationEndpoints();

// ── Parent-process watchdog ──────────────────────────────────────────────────
// If Electron crashes or is killed without a clean shutdown, the OS would
// otherwise leave us running. Watch the parent and exit when it goes away.
if (int.TryParse(parentPid, out var pid))
{
    _ = Task.Run(() =>
    {
        try
        {
            using var parent = Process.GetProcessById(pid);
            parent.WaitForExit();
        }
        catch
        {
            // Parent already gone or inaccessible; treat as a kill signal.
        }
        Environment.Exit(0);
    });
}

// ── Start, announce, wait ────────────────────────────────────────────────────
// Electron blocks on this line before creating its main window.
await app.StartAsync();
Console.WriteLine($"LISTENING {port}");
Console.Out.Flush();
await app.WaitForShutdownAsync();
return;

static bool CryptographicEquals(string a, string b)
{
    if (a.Length != b.Length) return false;
    var diff = 0;
    for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
    return diff == 0;
}
