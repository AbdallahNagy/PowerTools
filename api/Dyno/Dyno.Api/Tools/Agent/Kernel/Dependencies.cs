using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;

namespace Dyno.Api.Tools.Agent.Kernel;

public sealed record DependencyDto(int DependentComponentType, Guid DependentComponentId, int RequiredComponentType, Guid RequiredComponentId);

/// <summary>What would block deleting a component, for the remove dialog. Same message online and on-premises.</summary>
public static class Dependencies
{
    public static async Task<IReadOnlyList<DependencyDto>> ForDeleteAsync(IAgentClient client, int componentType, Guid objectId, CancellationToken ct)
    {
        var response = (RetrieveDependenciesForDeleteResponse)await client.ExecuteAsync(
            new RetrieveDependenciesForDeleteRequest { ComponentType = componentType, ObjectId = objectId }, ct);
        return (response.EntityCollection?.Entities.ToList() ?? [])
            .Select(row => new DependencyDto(
                Option(row, "dependentcomponenttype"),
                row.GetAttributeValue<Guid>("dependentcomponentobjectid"),
                Option(row, "requiredcomponenttype"),
                row.GetAttributeValue<Guid>("requiredcomponentobjectid")))
            .ToList();
    }

    private static int Option(Entity row, string column) =>
        row.GetAttributeValue<OptionSetValue>(column)?.Value ?? row.GetAttributeValue<int?>(column) ?? 0;
}
