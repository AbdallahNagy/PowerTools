using System.Text.Json;
using Dyno.Api.Services;

namespace Dyno.Api.Tools.Agent.Kernel;

public sealed record ApplyRequest(JsonElement Spec, string? PlanHash);

/// <summary>
/// The routes every apply tool uses: POST /api/agent/{family}/plan with the spec, and POST /api/agent/{family}/apply
/// with the spec and the approved plan hash. Families come from DI, so one registration adds both routes.
/// </summary>
public static class AgentApplyEndpoints
{
    private static readonly ICapabilitiesCache FallbackCache = new CapabilitiesCache();

    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/capabilities", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            await AgentEndpoints.Run(() => Cache(ctx).GetAsync(AgentConnectionKey.For(ctx), AgentEndpoints.Client(ctx, factory), ct)));

        group.MapPost("/{family}/plan", async (string family, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            await Handle(ctx, factory, family, ct, async (kernel, found, body) =>
                Results.Ok(await kernel.PlanAsync(found.ReadSpec(body), ct))));

        group.MapPost("/{family}/apply", async (string family, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            await Handle(ctx, factory, family, ct, async (kernel, found, body) =>
            {
                var request = body.Deserialize<ApplyRequest>(JsonSerializerOptions.Web);
                if (request is null || request.Spec.ValueKind != JsonValueKind.Object)
                    return AgentEndpoints.ToHttp(AgentFaults.InvalidRequest("The body needs \"spec\" (an object) and \"planHash\"."));
                if (string.IsNullOrWhiteSpace(request.PlanHash))
                    return AgentEndpoints.ToHttp(AgentFaults.InvalidRequest("\"planHash\" is required: apply runs only an approved plan."));
                return Results.Ok(await kernel.ApplyAsync(found.ReadSpec(request.Spec), request.PlanHash, ct));
            }));
    }

    private static async Task<IResult> Handle(
        HttpContext ctx,
        DataverseClientFactory factory,
        string family,
        CancellationToken ct,
        Func<ApplyKernel, IApplyFamily, JsonElement, Task<IResult>> work)
    {
        var found = ctx.RequestServices.GetServices<IApplyFamily>()
            .FirstOrDefault(f => string.Equals(f.Name, family, StringComparison.Ordinal));
        if (found is null) return AgentEndpoints.ToHttp(AgentFaults.NotFound($"There is no apply family '{family}'."));

        try
        {
            JsonElement body;
            try
            {
                body = (await JsonDocument.ParseAsync(ctx.Request.Body, cancellationToken: ct)).RootElement.Clone();
            }
            catch (JsonException)
            {
                return AgentEndpoints.ToHttp(AgentFaults.InvalidRequest("The request body is not valid JSON."));
            }

            if (body.ValueKind != JsonValueKind.Object)
                return AgentEndpoints.ToHttp(AgentFaults.InvalidRequest("The request body must be a JSON object."));

            var client = AgentEndpoints.Client(ctx, factory);
            var key = AgentConnectionKey.For(ctx);
            var capabilities = await Cache(ctx).GetAsync(key, client, ct);
            var options = ctx.RequestServices.GetService<KernelOptions>();
            var kernel = new ApplyKernel(found, () => new PlanContext(client, capabilities, key), options);
            return await work(kernel, found, body);
        }
        catch (Exception ex)
        {
            return AgentEndpoints.ToHttp(AgentFaults.From(ex));
        }
    }

    private static ICapabilitiesCache Cache(HttpContext ctx) =>
        ctx.RequestServices.GetService<ICapabilitiesCache>() ?? FallbackCache;
}
