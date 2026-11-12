using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PolymorphicLookup;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// The Dataverse calls behind the agent routes. It extends the polymorphic lookup client
/// (Execute and RetrieveMultiple) so multi-target lookups can reuse that service unchanged.
/// </summary>
public interface IAgentClient : IPolymorphicLookupClient
{
    Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken);

    Task UpdateAsync(Entity entity, CancellationToken cancellationToken);
}

public sealed class DataverseAgentClient(IOrganizationServiceAsync2 service) : IAgentClient
{
    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken) =>
        service.RetrieveAsync(table, id, columns, cancellationToken);

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken) =>
        service.UpdateAsync(entity, cancellationToken);
}

/// <summary>Supplies the Dataverse client for a request. Tests register one to drive the routes without an environment.</summary>
public interface IAgentClientSource
{
    IAgentClient Create(HttpContext context);
}
