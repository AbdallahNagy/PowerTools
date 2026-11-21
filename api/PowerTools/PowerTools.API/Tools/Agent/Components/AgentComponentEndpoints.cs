using System.Text.Json;
using System.Text.Json.Serialization;
using PowerTools.API.Services;
using PowerTools.API.Tools.Agent.Components.Apps;
using PowerTools.API.Tools.Agent.Components.Choices;
using PowerTools.API.Tools.Agent.Components.Config;
using PowerTools.API.Tools.Agent.Components.CustomApis;
using PowerTools.API.Tools.Agent.Components.Flows;
using PowerTools.API.Tools.Agent.Components.Forms;
using PowerTools.API.Tools.Agent.Components.Inspect;
using PowerTools.API.Tools.Agent.Components.Plugins;
using PowerTools.API.Tools.Agent.Components.Records;
using PowerTools.API.Tools.Agent.Components.Remove;
using PowerTools.API.Tools.Agent.Components.Security;
using PowerTools.API.Tools.Agent.Components.Solutions;
using PowerTools.API.Tools.Agent.Components.Tables;
using PowerTools.API.Tools.Agent.Components.Views;
using PowerTools.API.Tools.Agent.Components.WebResources;
using PowerTools.API.Tools.Agent.Kernel;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.SolutionLayers;

namespace PowerTools.API.Tools.Agent.Components;

/// <summary>
/// The apply families of the consolidated tool set, and the routes of its reads that are not plan/apply:
/// POST /api/agent/inspect/schema and POST /api/agent/solution/export.
/// </summary>
public static class AgentComponentEndpoints
{
    private static readonly ICapabilitiesCache FallbackCache = new CapabilitiesCache();

    private static readonly JsonSerializerOptions Output = new(JsonSerializerOptions.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Registers every apply family; each one gets /api/agent/{family}/plan and /apply.</summary>
    public static IServiceCollection AddAgentApplyFamilies(this IServiceCollection services)
    {
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<TableApplySpec>(TablePlanner.Family, new TablePlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<SolutionImportSpec>(
            SolutionImportPlanner.Family, new SolutionImportPlanner(), SolutionImportPlanner.ForVerification));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<RecordsWriteSpec>(
            RecordsWritePlanner.Family, new RecordsWritePlanner(), RecordsWritePlanner.ForVerification, idempotent: false));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<RecordsDeleteSpec>(
            RecordsDeletePlanner.Family, new RecordsDeletePlanner(), RecordsDeletePlanner.ForVerification));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<ChoiceApplySpec>(ChoicePlanner.Family, new ChoicePlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<ViewApplySpec>(ViewPlanner.Family, new ViewPlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<FormApplySpec>(FormPlanner.Family, new FormPlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<SolutionApplySpec>(SolutionPlanner.Family, new SolutionPlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<ConfigApplySpec>(ConfigPlanner.Family, new ConfigPlanner()));
        services.AddSingleton<IApplyFamily>(sp => new ApplyFamily<PluginDeploySpec>(
            PluginDeployPlanner.Family, new PluginDeployPlanner(sp.GetRequiredService<IPluginAssemblyInspector>())));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<PluginStepApplySpec>(PluginStepPlanner.Family, new PluginStepPlanner()));
        services.AddSingleton<IApplyFamily>(sp => new ApplyFamily<RemoveSpec>(
            RemovePlanner.Family, new RemovePlanner(sp.GetRequiredService<ISolutionLayersCache>())));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<WebResourceApplySpec>(WebResourcePlanner.Family, new WebResourcePlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<CustomApiApplySpec>(CustomApiPlanner.Family, new CustomApiPlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<RoleApplySpec>(RolePlanner.Family, new RolePlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<AppApplySpec>(AppPlanner.Family, new AppPlanner()));
        services.AddSingleton<IApplyFamily>(_ => new ApplyFamily<FlowApplySpec>(FlowPlanner.Family, new FlowPlanner()));
        return services;
    }

    public static void Map(RouteGroupBuilder group)
    {
        AgentEndpoints.PostWith<InspectSchemaBody, JsonElement>(group, "/inspect/schema", async (ctx, factory, body, ct) =>
        {
            var result = await new SchemaInspector(AgentEndpoints.Client(ctx, factory)).InspectAsync(body, ct);
            // Leave out empty properties, so a described column reads like a spec.
            return result.Problem is null
                ? AgentResult<JsonElement>.Ok(JsonSerializer.SerializeToElement(result.Value, Output))
                : AgentResult<JsonElement>.Fail(result.Problem);
        });

        AgentEndpoints.PostWith<InspectBody, JsonElement>(group, "/inspect/ui", async (ctx, factory, body, ct) =>
        {
            var client = AgentEndpoints.Client(ctx, factory);
            var capabilities = await Capabilities(ctx, client, ct);
            return Serialize(await new UiInspector(client, capabilities).InspectAsync(body, ct));
        });

        AgentEndpoints.PostWith<InspectBody, JsonElement>(group, "/inspect/solution", async (ctx, factory, body, ct) =>
        {
            var client = AgentEndpoints.Client(ctx, factory);
            var capabilities = await Capabilities(ctx, client, ct);
            var layers = ctx.RequestServices.GetRequiredService<ISolutionLayersCache>();
            return Serialize(await new SolutionInspector(client, capabilities, layers, AgentConnectionKey.For(ctx)).InspectAsync(body, ct));
        });

        AgentEndpoints.PostWith<SolutionExportBody, SolutionExportedDto>(group, "/solution/export", async (ctx, factory, body, ct) =>
        {
            var client = AgentEndpoints.Client(ctx, factory);
            var cache = ctx.RequestServices.GetService<ICapabilitiesCache>() ?? FallbackCache;
            var capabilities = await cache.GetAsync(AgentConnectionKey.For(ctx), client, ct);
            return await new SolutionExport(client, capabilities).ExportAsync(body, ct);
        });
    }

    private static Task<Capabilities> Capabilities(HttpContext ctx, IAgentClient client, CancellationToken ct) =>
        (ctx.RequestServices.GetService<ICapabilitiesCache>() ?? FallbackCache).GetAsync(AgentConnectionKey.For(ctx), client, ct);

    /// <summary>Leaves out empty properties, so a described component reads like a spec.</summary>
    private static AgentResult<JsonElement> Serialize(AgentResult<object> result) =>
        result.Problem is null
            ? AgentResult<JsonElement>.Ok(JsonSerializer.SerializeToElement(result.Value, Output))
            : AgentResult<JsonElement>.Fail(result.Problem);
}
