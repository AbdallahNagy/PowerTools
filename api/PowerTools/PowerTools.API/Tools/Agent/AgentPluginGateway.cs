using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.Agent;

/// <summary>Lets the existing plug-in registration services run on the agent client, so there is one implementation.</summary>
public sealed class AgentPluginGateway(IAgentClient client) : IPluginRegistrationGateway
{
    private const int ObjectDoesNotExist = unchecked((int)0x80040217);

    public async Task<IReadOnlyList<Entity>> RetrieveAllAsync(QueryExpression query, CancellationToken ct)
    {
        query.PageInfo = new PagingInfo { PageNumber = 1, Count = RegistrationOptionValues.CatalogPageSize };
        var results = new List<Entity>();
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var page = await client.RetrieveMultipleAsync(query, ct);
            results.AddRange(page.Entities);
            if (!page.MoreRecords) break;
            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }

        return results;
    }

    public async Task<Entity?> RetrieveAsync(string entityName, Guid id, ColumnSet columns, CancellationToken ct)
    {
        try
        {
            return await client.RetrieveAsync(entityName, id, columns, ct);
        }
        catch (FaultException<OrganizationServiceFault> ex) when (ex.Detail.ErrorCode == ObjectDoesNotExist)
        {
            return null;
        }
    }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken ct) => client.CreateAsync(entity, ct);

    public Task UpdateAsync(Entity entity, CancellationToken ct) => client.UpdateAsync(entity, ct);

    public Task DeleteAsync(string entityName, Guid id, CancellationToken ct) => client.DeleteAsync(entityName, id, ct);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken ct) =>
        client.ExecuteAsync(request, ct);
}
