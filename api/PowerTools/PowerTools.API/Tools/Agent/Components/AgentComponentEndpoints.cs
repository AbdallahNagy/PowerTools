using System.Text.Json;
using System.Text.Json.Serialization;
using PowerTools.API.Services;
using PowerTools.API.Tools.Agent.Components.Inspect;
using PowerTools.API.Tools.Agent.Components.Solutions;
using PowerTools.API.Tools.Agent.Components.Tables;
using PowerTools.API.Tools.Agent.Kernel;

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

        AgentEndpoints.PostWith<SolutionExportBody, SolutionExportedDto>(group, "/solution/export", async (ctx, factory, body, ct) =>
        {
            var client = AgentEndpoints.Client(ctx, factory);
            var cache = ctx.RequestServices.GetService<ICapabilitiesCache>() ?? FallbackCache;
            var capabilities = await cache.GetAsync(AgentConnectionKey.For(ctx), client, ct);
            return await new SolutionExport(client, capabilities).ExportAsync(body, ct);
        });
    }
}
