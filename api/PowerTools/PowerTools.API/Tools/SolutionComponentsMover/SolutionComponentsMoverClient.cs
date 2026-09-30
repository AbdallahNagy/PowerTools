using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public interface ISolutionComponentsMoverClient
{
    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);

    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);
}

public sealed class DataverseSolutionComponentsMoverClient(IOrganizationServiceAsync2 service) : ISolutionComponentsMoverClient
{
    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);
}
