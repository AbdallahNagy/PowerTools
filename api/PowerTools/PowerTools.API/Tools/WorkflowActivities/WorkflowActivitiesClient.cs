using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.WorkflowActivities;

public interface IWorkflowActivitiesClient
{
    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);
}

public sealed class DataverseWorkflowActivitiesClient(IOrganizationServiceAsync2 service) : IWorkflowActivitiesClient
{
    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);
}
