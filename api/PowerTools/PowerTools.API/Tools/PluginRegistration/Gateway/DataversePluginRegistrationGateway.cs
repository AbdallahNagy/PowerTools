using System.ServiceModel;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Gateway;

public sealed class DataversePluginRegistrationGateway(ICurrentConnection connection)
    : IPluginRegistrationGateway
{
    private const int ObjectDoesNotExist = unchecked((int)0x80040217);

    private IOrganizationServiceAsync2? _client;
    private IOrganizationServiceAsync2 Client => _client ??= connection.CreateClient();

    public async Task<IReadOnlyList<Entity>> RetrieveAllAsync(
        QueryExpression query,
        CancellationToken ct)
    {
        query.PageInfo = new PagingInfo
        {
            PageNumber = 1,
            Count = RegistrationOptionValues.CatalogPageSize,
        };

        var results = new List<Entity>();
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var page = await Client.RetrieveMultipleAsync(query);
            results.AddRange(page.Entities);
            if (!page.MoreRecords)
                break;

            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }

        return results;
    }

    public async Task<Entity?> RetrieveAsync(
        string entityName,
        Guid id,
        ColumnSet columns,
        CancellationToken ct)
    {
        try
        {
            return await Client.RetrieveAsync(entityName, id, columns, ct);
        }
        catch (FaultException<OrganizationServiceFault> ex)
            when (ex.Detail.ErrorCode == ObjectDoesNotExist)
        {
            return null;
        }
    }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken ct) =>
        Client.CreateAsync(entity, ct);

    public Task UpdateAsync(Entity entity, CancellationToken ct) =>
        Client.UpdateAsync(entity, ct);

    public Task DeleteAsync(string entityName, Guid id, CancellationToken ct) =>
        Client.DeleteAsync(entityName, id, ct);

    public Task<OrganizationResponse> ExecuteAsync(
        OrganizationRequest request,
        CancellationToken ct) =>
        Client.ExecuteAsync(request, ct);
}
