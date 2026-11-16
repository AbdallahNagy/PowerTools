using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>The Dataverse calls the Data Migration tool makes on one connection.</summary>
public interface IDataMigrationClient
{
    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);

    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);
}

/// <summary>Owns the SDK client it wraps and disposes it.</summary>
public sealed class DataverseDataMigrationClient(IOrganizationServiceAsync2 service) : IDataMigrationClient, IDisposable
{
    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);

    public void Dispose() => (service as IDisposable)?.Dispose();
}
