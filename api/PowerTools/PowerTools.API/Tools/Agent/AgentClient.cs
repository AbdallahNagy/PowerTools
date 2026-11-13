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

    /// <summary>
    /// Sends a Web API request (path relative to /api/data/v9.2/) and answers the response body. For the few
    /// changes the SDK accepts but does not apply, such as a column's required level.
    /// </summary>
    Task<string> WebApiAsync(HttpMethod method, string path, string? body, IReadOnlyDictionary<string, string>? headers, CancellationToken cancellationToken);
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

    public async Task<string> WebApiAsync(
        HttpMethod method, string path, string? body, IReadOnlyDictionary<string, string>? headers, CancellationToken cancellationToken)
    {
        if (service is not ServiceClient web)
            throw new NotSupportedException("This connection cannot send Web API requests.");

        var custom = (headers ?? new Dictionary<string, string>())
            .ToDictionary(pair => pair.Key, pair => new List<string> { pair.Value });
        // ExecuteWebRequest is synchronous; keep it off the request thread.
        var response = await Task.Run(
            () => web.ExecuteWebRequest(method, path, body ?? "", custom, "application/json", cancellationToken),
            cancellationToken);
        if (response is null)
            throw new InvalidOperationException(web.LastError is { Length: > 0 } error ? error : "The Web API request failed.");

        var text = response.Content is null ? "" : await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Web API {method} {path} failed ({(int)response.StatusCode}): {text}");
        return text;
    }
}

/// <summary>Supplies the Dataverse client for a request. Tests register one to drive the routes without an environment.</summary>
public interface IAgentClientSource
{
    IAgentClient Create(HttpContext context);
}
