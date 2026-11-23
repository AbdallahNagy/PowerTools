using System.Diagnostics;
using Dyno.Api.Filters;
using Dyno.Mcp;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Services;
using Dyno.Api.Tools.AttributeExplorer;
using Dyno.Api.Tools.BulkWorkflowExecution;
using Dyno.Api.Tools.CommunityToolApi;
using Dyno.Api.Tools.Connection;
using Dyno.Api.Tools.DataMigration;
using Dyno.Api.Tools.EnvironmentVariables;
using Dyno.Api.Tools.Fetch;
using Dyno.Api.Tools.Metadata;
using Dyno.Api.Tools.PluginRegistration;
using Dyno.Api.Tools.PluginRegistration.Gateway;
using Dyno.Api.Tools.PolymorphicLookup;
using Dyno.Api.Tools.SolutionComponentsMover;
using Dyno.Api.Tools.SolutionLayers;
using Dyno.Api.Tools.Translator;
using Dyno.Api.Tools.WorkflowActivities;
using Dyno.Api.Tools.PluginRegistration.Inspection;
using Dyno.Api.Tools.PluginRegistration.Services;

// ── stdio connector mode ─────────────────────────────────────────────────────
// Deprecated. MCP client setups made before Dyno.McpConnector.exe existed start this executable with
// --mcp-connector. A client keeps it running, which locks the installed file and blocks app updates, so the
// Agents (MCP) page asks users to switch to the separate connector. It never starts the sidecar web host.
if (args.Contains("--mcp-connector"))
{
    Console.Error.WriteLine("powertools-mcp: Dyno.Api.exe --mcp-connector is deprecated and blocks Power Tools updates. Use the command under File → Agents (MCP)… instead.");
    Environment.ExitCode = await McpConnector.RunAsync(args, Console.OpenStandardInput(), Console.OpenStandardOutput(), CancellationToken.None);
    return;
}

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
builder.Services.AddSingleton<ISolutionCopyJobStore, InMemorySolutionCopyJobStore>();
builder.Services.AddSingleton<ISolutionCopyDelay, SolutionCopyDelay>();
builder.Services.AddHostedService<SolutionCopyJobRunner>();
builder.Services.AddSingleton<IBulkWorkflowJobStore, InMemoryBulkWorkflowJobStore>();
builder.Services.AddSingleton<IBulkWorkflowDelay, BulkWorkflowDelay>();
builder.Services.AddHostedService<BulkWorkflowJobRunner>();
builder.Services.AddSingleton<ITranslatorJobStore, InMemoryTranslatorJobStore>();
builder.Services.AddSingleton<ITranslatorDelay, TranslatorDelay>();
builder.Services.AddHostedService<TranslatorJobRunner>();
builder.Services.AddScoped<IPluginRegistrationGateway, DataversePluginRegistrationGateway>();
builder.Services.AddScoped<CapabilitiesService>();
builder.Services.AddScoped<CatalogService>();
builder.Services.AddScoped<StepOptionsService>();
builder.Services.AddScoped<StepService>();
builder.Services.AddScoped<ImageService>();
builder.Services.AddSingleton<IPluginAssemblyInspector, PluginAssemblyInspector>();
builder.Services.AddScoped<AssemblyService>();
builder.Services.AddScoped<UnregisterService>();
builder.Services.AddSingleton<ISolutionLayersCache>(_ => new SolutionLayersCache());
builder.Services.AddSingleton<Dyno.Api.Tools.Agent.Kernel.ICapabilitiesCache>(_ => new Dyno.Api.Tools.Agent.Kernel.CapabilitiesCache());
Dyno.Api.Tools.Agent.Components.AgentComponentEndpoints.AddAgentApplyFamilies(builder.Services);

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
app.MapAttributeExplorerEndpoints();
app.MapFetchEndpoints();
app.MapDataMigrationEndpoints();
app.MapPreviewEndpoints();
app.MapMigrationEndpoints();
app.MapPluginRegistrationEndpoints();
app.MapPolymorphicLookupEndpoints();
app.MapWorkflowActivitiesEndpoints();
app.MapSolutionComponentsMoverEndpoints();
app.MapBulkWorkflowExecutionEndpoints();
app.MapTranslatorEndpoints();
app.MapSolutionLayersEndpoints();
app.MapEnvironmentVariablesEndpoints();
app.MapCommunityToolEndpoints();
app.MapAgentEndpoints();

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
