using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.PolymorphicLookup;

public interface IPolymorphicLookupClient
{
    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);

    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);
}

public sealed class DataversePolymorphicLookupClient(IOrganizationServiceAsync2 service) : IPolymorphicLookupClient
{
    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);
}
