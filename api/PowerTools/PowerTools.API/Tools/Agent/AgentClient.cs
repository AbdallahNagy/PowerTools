using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.EnvironmentVariables;
using PowerTools.API.Tools.PolymorphicLookup;
using PowerTools.API.Tools.SolutionComponentsMover;
using PowerTools.API.Tools.SolutionLayers;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// The Dataverse calls behind the agent routes. It also is the client of the existing tool services the agent
/// routes reuse (polymorphic lookups, solution components, solution layers, environment variables), so each of
/// them runs unchanged. The two members they share are redeclared here to keep calls on this type unambiguous.
/// </summary>
public interface IAgentClient :
    IPolymorphicLookupClient,
    ISolutionComponentsMoverClient,
    ISolutionLayersClient,
    IEnvironmentVariablesClient
{
    new Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);

    new Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);

    Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken);

    Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken);

    Task UpdateAsync(Entity entity, CancellationToken cancellationToken);

    Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken);
}

public sealed class DataverseAgentClient(IOrganizationServiceAsync2 service) : IAgentClient
{
    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken) =>
        service.RetrieveAsync(table, id, columns, cancellationToken);

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken) =>
        service.CreateAsync(entity, cancellationToken);

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken) =>
        service.UpdateAsync(entity, cancellationToken);

    public Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken) =>
        service.DeleteAsync(table, id, cancellationToken);
}

/// <summary>Supplies the Dataverse client for a request. Tests register one to drive the routes without an environment.</summary>
public interface IAgentClientSource
{
    IAgentClient Create(HttpContext context);
}
