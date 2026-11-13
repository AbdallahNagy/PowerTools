using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.AttributeExplorer;

namespace PowerTools.API.Tools.CommunityToolApi;

/// <summary>The Dataverse calls behind the community tool endpoints.</summary>
public interface ICommunityToolClient
{
    Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken);

    Task<EntityCollection> RetrieveMultipleAsync(string fetchXml, CancellationToken cancellationToken);

    Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken);

    Task UpdateAsync(Entity entity, CancellationToken cancellationToken);

    Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken);

    Task AssociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken);

    Task DisassociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken);

    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);

    /// <summary>Entity-level metadata for every table. No attributes.</summary>
    Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken);

    Task<EntityMetadata> RetrieveTableAsync(string logicalName, EntityFilters filters, CancellationToken cancellationToken);

    Task<AttributeMetadata> RetrieveColumnAsync(string table, string column, CancellationToken cancellationToken);
}

public sealed class DataverseCommunityToolClient(IOrganizationServiceAsync2 service) : ICommunityToolClient
{
    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken) =>
        service.RetrieveAsync(table, id, columns, cancellationToken);

    public Task<EntityCollection> RetrieveMultipleAsync(string fetchXml, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(new FetchExpression(fetchXml), cancellationToken);

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken) =>
        service.CreateAsync(entity, cancellationToken);

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken) =>
        service.UpdateAsync(entity, cancellationToken);

    public Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken) =>
        service.DeleteAsync(table, id, cancellationToken);

    public Task AssociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken) =>
        service.AssociateAsync(table, id, relationship, related, cancellationToken);

    public Task DisassociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken) =>
        service.DisassociateAsync(table, id, relationship, related, cancellationToken);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);

    public async Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken)
    {
        var response = (RetrieveAllEntitiesResponse)await service.ExecuteAsync(
            AttributeExplorerRequests.AllTables(),
            cancellationToken);
        return response.EntityMetadata;
    }

    public async Task<EntityMetadata> RetrieveTableAsync(string logicalName, EntityFilters filters, CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityResponse)await service.ExecuteAsync(
            new RetrieveEntityRequest
            {
                LogicalName = logicalName,
                EntityFilters = filters,
                RetrieveAsIfPublished = true,
            },
            cancellationToken);
        return response.EntityMetadata;
    }

    public async Task<AttributeMetadata> RetrieveColumnAsync(string table, string column, CancellationToken cancellationToken)
    {
        var response = (RetrieveAttributeResponse)await service.ExecuteAsync(
            new RetrieveAttributeRequest
            {
                EntityLogicalName = table,
                LogicalName = column,
                RetrieveAsIfPublished = true,
            },
            cancellationToken);
        return response.AttributeMetadata;
    }
}
