using PowerTools.API.Services;
using PowerTools.API.Tools.SolutionLayers;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Agent;

internal static class AgentSolutionsEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/solutions", async (bool? unmanagedOnly, HttpContext ctx, DataverseClientFactory factory, ISolutionLayersCache cache, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory, cache).ListAsync(unmanagedOnly ?? false, ct)));

        group.MapGet("/solutions/{uniqueName}/components", async (string uniqueName, int? componentType, HttpContext ctx, DataverseClientFactory factory, ISolutionLayersCache cache, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory, cache).ListComponentsAsync(uniqueName, componentType, ct)));

        group.MapGet("/solutions/layers", async (int? componentType, string? componentId, HttpContext ctx, DataverseClientFactory factory, ISolutionLayersCache cache, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory, cache).GetLayersAsync(componentType, componentId, ct)));

        Post<CreateSolutionBody, SolutionCreatedDto>(group, "/solutions", (s, b, ct) => s.CreateAsync(b, ct));
        Post<CreatePatchBody, SolutionCreatedDto>(group, "/solutions/patch", (s, b, ct) => s.CreatePatchAsync(b, ct));
        Post<CloneSolutionBody, SolutionCreatedDto>(group, "/solutions/clone", (s, b, ct) => s.CloneAsync(b, ct));
        Post<SolutionComponentBody, SolutionComponentChangedDto>(group, "/solutions/components/add", (s, b, ct) => s.AddComponentAsync(b, ct));
        Post<SolutionComponentBody, SolutionComponentChangedDto>(group, "/solutions/components/remove", (s, b, ct) => s.RemoveComponentAsync(b, ct));
        Post<DeleteSolutionBody, SolutionDeletedDto>(group, "/solutions/delete", (s, b, ct) => s.DeleteAsync(b, ct));
        Post<RemoveActiveLayerBody, LayersResponse>(group, "/solutions/layers/remove-active", (s, b, ct) => s.RemoveActiveLayerAsync(b, ct));
    }

    private static AgentSolutionsService Service(HttpContext ctx, DataverseClientFactory factory, ISolutionLayersCache cache)
    {
        var connection = ctx.GetDataverseConnectionContext();
        var key = connection is OnPremisesConnectionContext onPremises
            ? $"{connection.EnvironmentUrl.ToLowerInvariant()}|{onPremises.Domain}\\{onPremises.Username}"
            : connection.EnvironmentUrl.ToLowerInvariant();
        return new AgentSolutionsService(AgentEndpoints.Client(ctx, factory), cache, key);
    }

    private static void Post<TRequest, TResult>(
        RouteGroupBuilder group,
        string route,
        Func<AgentSolutionsService, TRequest, CancellationToken, Task<AgentResult<TResult>>> call)
        where TRequest : class =>
        AgentEndpoints.PostWith<TRequest, TResult>(group, route, (ctx, factory, body, ct) =>
            call(Service(ctx, factory, ctx.RequestServices.GetRequiredService<ISolutionLayersCache>()), body, ct));
}
