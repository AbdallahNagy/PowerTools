using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Agent;

/// <summary>One key per environment and sign-in, shared by the per-connection caches and locks.</summary>
public static class AgentConnectionKey
{
    public static string For(HttpContext ctx)
    {
        var connection = ctx.GetDataverseConnectionContext();
        return connection is OnPremisesConnectionContext onPremises
            ? $"{connection.EnvironmentUrl.ToLowerInvariant()}|{onPremises.Domain}\\{onPremises.Username}"
            : connection.EnvironmentUrl.ToLowerInvariant();
    }
}
