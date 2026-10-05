using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public interface IBulkWorkflowClient
{
    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);

    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);
}

public sealed class DataverseBulkWorkflowClient(IOrganizationServiceAsync2 service) : IBulkWorkflowClient
{
    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);
}

public interface IBulkWorkflowDelay
{
    Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken);
}

public sealed class BulkWorkflowDelay : IBulkWorkflowDelay
{
    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken) =>
        Task.Delay(delay, cancellationToken);
}
