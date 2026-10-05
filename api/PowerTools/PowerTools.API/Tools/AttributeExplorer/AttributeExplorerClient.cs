using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.AttributeExplorer;

public interface IAttributeExplorerClient
{
    /// <summary>Entity-level metadata for every table. No attributes.</summary>
    Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken);

    /// <summary>One table with its attributes and relationships.</summary>
    Task<EntityMetadata> RetrieveTableAsync(string logicalName, CancellationToken cancellationToken);
}

public static class AttributeExplorerRequests
{
    public static RetrieveAllEntitiesRequest AllTables() =>
        new()
        {
            EntityFilters = EntityFilters.Entity,
            RetrieveAsIfPublished = true,
        };

    public static RetrieveEntityRequest Table(string logicalName) =>
        new()
        {
            LogicalName = logicalName,
            EntityFilters = EntityFilters.Attributes | EntityFilters.Relationships,
            RetrieveAsIfPublished = true,
        };
}

public sealed class DataverseAttributeExplorerClient(IOrganizationServiceAsync2 service) : IAttributeExplorerClient
{
    public async Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken)
    {
        var response = (RetrieveAllEntitiesResponse)await service.ExecuteAsync(
            AttributeExplorerRequests.AllTables(),
            cancellationToken);
        return response.EntityMetadata;
    }

    public async Task<EntityMetadata> RetrieveTableAsync(string logicalName, CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityResponse)await service.ExecuteAsync(
            AttributeExplorerRequests.Table(logicalName),
            cancellationToken);
        return response.EntityMetadata;
    }
}
