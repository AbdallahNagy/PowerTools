using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Agent;

internal static class AgentEnvVarsEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/envvars", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await Service(ctx, factory).ListAsync(ct)));

        AgentEndpoints.PostWith<CreateEnvVarDefinitionBody, EnvVarChangedDto>(group, "/envvars/definitions", (ctx, factory, body, ct) =>
            Service(ctx, factory).CreateDefinitionAsync(body, ct));
        AgentEndpoints.PostWith<SetEnvVarValueBody, EnvVarChangedDto>(group, "/envvars/values", (ctx, factory, body, ct) =>
            Service(ctx, factory).SetValueAsync(body, ct));
        AgentEndpoints.PostWith<DeleteEnvVarBody, EnvVarChangedDto>(group, "/envvars/delete", (ctx, factory, body, ct) =>
            Service(ctx, factory).DeleteAsync(body, ct));
    }

    private static AgentEnvVarsService Service(HttpContext ctx, DataverseClientFactory factory) =>
        new(AgentEndpoints.Client(ctx, factory), ctx.GetDataverseConnectionContext() is OnPremisesConnectionContext);
}
