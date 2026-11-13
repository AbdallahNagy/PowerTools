using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Agent;

internal static class AgentPluginsEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/plugins/catalog", async (string? assembly, string? table, string? message, HttpContext ctx, DataverseClientFactory factory, IPluginAssemblyInspector inspector, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory, inspector).CatalogAsync(assembly, table, message, ct)));

        group.MapGet("/plugins/step-options", async (HttpContext ctx, DataverseClientFactory factory, IPluginAssemblyInspector inspector, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory, inspector).StepOptionsAsync(ct)));

        Post<RegisterAssemblyBody, MutationResultDto>(group, "/plugins/assemblies", (s, b, ct) => s.RegisterAssemblyAsync(b, ct));
        Post<StepBody, MutationResultDto>(group, "/plugins/steps", (s, b, ct) => s.CreateStepAsync(b, ct));
        Post<ImageBody, MutationResultDto>(group, "/plugins/images", (s, b, ct) => s.CreateImageAsync(b, ct));
        Post<UnregisterBody, MutationResultDto>(group, "/plugins/unregister", (s, b, ct) => s.UnregisterAsync(b, ct));

        PostWithId<UpdateAssemblyBody>(group, "/plugins/assemblies/{id:guid}/update", (s, id, b, ct) => s.UpdateAssemblyAsync(id, b, ct));
        PostWithId<StepBody>(group, "/plugins/steps/{id:guid}/update", (s, id, b, ct) => s.UpdateStepAsync(id, b, ct));
        PostWithId<StepStateBody>(group, "/plugins/steps/{id:guid}/state", (s, id, b, ct) => s.SetStepStateAsync(id, b, ct));
        PostWithId<ImageBody>(group, "/plugins/images/{id:guid}/update", (s, id, b, ct) => s.UpdateImageAsync(id, b, ct));
    }

    private static AgentPluginsService Service(HttpContext ctx, DataverseClientFactory factory, IPluginAssemblyInspector inspector) =>
        new(AgentEndpoints.Client(ctx, factory), inspector, ctx.GetDataverseConnectionContext() is OnlineConnectionContext);

    private static void Post<TRequest, TResult>(
        RouteGroupBuilder group,
        string route,
        Func<AgentPluginsService, TRequest, CancellationToken, Task<AgentResult<TResult>>> call)
        where TRequest : class =>
        AgentEndpoints.PostWith<TRequest, TResult>(group, route, (ctx, factory, body, ct) =>
            call(Service(ctx, factory, ctx.RequestServices.GetRequiredService<IPluginAssemblyInspector>()), body, ct));

    private static void PostWithId<TRequest>(
        RouteGroupBuilder group,
        string route,
        Func<AgentPluginsService, Guid, TRequest, CancellationToken, Task<AgentResult<MutationResultDto>>> call)
        where TRequest : class =>
        AgentEndpoints.PostWith<TRequest, MutationResultDto>(group, route, (ctx, factory, body, ct) =>
        {
            var id = Guid.Parse((string)ctx.Request.RouteValues["id"]!);
            return call(Service(ctx, factory, ctx.RequestServices.GetRequiredService<IPluginAssemblyInspector>()), id, body, ct);
        });
}
