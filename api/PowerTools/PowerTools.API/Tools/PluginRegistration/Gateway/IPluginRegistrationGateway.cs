using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.PluginRegistration.Gateway;

public interface IPluginRegistrationGateway
{
    Task<IReadOnlyList<Entity>> RetrieveAllAsync(QueryExpression query, CancellationToken ct);
    Task<Entity?> RetrieveAsync(string entityName, Guid id, ColumnSet columns, CancellationToken ct);
    Task<Guid> CreateAsync(Entity entity, CancellationToken ct);
    Task UpdateAsync(Entity entity, CancellationToken ct);
    Task DeleteAsync(string entityName, Guid id, CancellationToken ct);
    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken ct);
}
