using System.ServiceModel;
using Microsoft.AspNetCore.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent;

namespace PowerTools.API.Agent.Tests;

public sealed class FakeAgentClient : IAgentClient
{
    public List<OrganizationRequest> Executed { get; } = [];
    public List<Entity> Updated { get; } = [];
    public Func<OrganizationRequest, OrganizationResponse> OnExecute { get; set; } = _ => new OrganizationResponse();
    public Dictionary<(string Table, Guid Id), Entity> Records { get; } = [];
    public List<Entity> Publishers { get; } = [];
    public List<Entity> Solutions { get; } = [];
    public List<Entity> SavedQueries { get; } = [];
    public List<Entity> SystemForms { get; } = [];
    public Dictionary<string, List<Entity>> ByEntity { get; } = new(StringComparer.OrdinalIgnoreCase);
    public int LanguageCode { get; set; } = 1033;

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Executed.Add(request);
        // Unpublished reads come from the same records as plain reads.
        if (request is Microsoft.Crm.Sdk.Messages.RetrieveUnpublishedRequest unpublished)
        {
            var target = unpublished.Target;
            if (!Records.TryGetValue((target.LogicalName, target.Id), out var row))
                throw Fault(unchecked((int)0x80040217), $"{target.LogicalName} {target.Id} does not exist.");
            var response = new Microsoft.Crm.Sdk.Messages.RetrieveUnpublishedResponse { Results = new ParameterCollection { ["Entity"] = row } };
            return Task.FromResult<OrganizationResponse>(response);
        }

        return Task.FromResult(OnExecute(request));
    }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        var expression = (QueryExpression)query;
        var rows = expression.EntityName switch
        {
            "publisher" => Publishers,
            "solution" => Solutions.Where(row => Matches(expression, row)).ToList(),
            "solutioncomponent" => SolutionComponents,
            "organization" => [new Entity("organization") { ["languagecode"] = LanguageCode }],
            "savedquery" => SavedQueries,
            "systemform" => SystemForms,
            var other when ByEntity.TryGetValue(other, out var found) => found.Where(row => EqualConditionsMatch(expression, row)).ToList(),
            _ => [],
        };
        return Task.FromResult(new EntityCollection(rows));
    }

    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken) =>
        Records.TryGetValue((table, id), out var entity)
            ? Task.FromResult(entity)
            : throw Fault(unchecked((int)0x80040217), $"{table} {id} does not exist.");

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken)
    {
        Updated.Add(entity);
        return Task.CompletedTask;
    }

    public List<Entity> Created { get; } = [];
    public List<(string Table, Guid Id)> Deleted { get; } = [];
    public List<Entity> SolutionComponents { get; } = [];
    public Func<Entity, Guid>? OnCreate { get; set; }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken)
    {
        Created.Add(entity);
        return Task.FromResult(OnCreate?.Invoke(entity) ?? Guid.NewGuid());
    }

    public Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken)
    {
        Deleted.Add((table, id));
        return Task.CompletedTask;
    }

    public List<(HttpMethod Method, string Path, string? Body, IReadOnlyDictionary<string, string>? Headers)> WebCalls { get; } = [];
    public Func<HttpMethod, string, string?, string> OnWebApi { get; set; } = (_, _, _) => "{}";

    public Task<string> WebApiAsync(
        HttpMethod method, string path, string? body, IReadOnlyDictionary<string, string>? headers, CancellationToken cancellationToken)
    {
        WebCalls.Add((method, path, body, headers));
        return Task.FromResult(OnWebApi(method, path, body));
    }

    /// <summary>Applies the Equal conditions of a query to a row, the way the tests need them.</summary>
    private static bool EqualConditionsMatch(QueryExpression query, Entity row) =>
        query.Criteria.Conditions
            .Where(c => c.Operator == ConditionOperator.Equal && c.Values.Count == 1 && row.Contains(c.AttributeName))
            .All(c => row[c.AttributeName] switch
            {
                EntityReference reference => reference.Id.Equals(c.Values[0]),
                var other => Equals(other, c.Values[0]),
            });

    private static bool Matches(QueryExpression query, Entity row)
    {
        var wanted = query.Criteria.Conditions.FirstOrDefault(c => c.AttributeName == "uniquename" && c.Operator == ConditionOperator.Equal)?.Values.FirstOrDefault();
        if (wanted is not null && !string.Equals(row.GetAttributeValue<string>("uniquename"), wanted.ToString(), StringComparison.Ordinal))
            return false;
        var parent = query.Criteria.Conditions.FirstOrDefault(c => c.AttributeName == "parentsolutionid" && c.Operator == ConditionOperator.Equal)?.Values.FirstOrDefault();
        return parent is null || row.GetAttributeValue<EntityReference>("parentsolutionid")?.Id.Equals(parent) == true;
    }

    public static FaultException<OrganizationServiceFault> Fault(int code, string message) =>
        new(new OrganizationServiceFault { ErrorCode = code, Message = message }, message);
}

internal static class Data
{
    public static readonly Guid ContosoPublisherId = Guid.Parse("11111111-aaaa-aaaa-aaaa-111111111111");
    public static readonly Guid FabrikamPublisherId = Guid.Parse("22222222-bbbb-bbbb-bbbb-222222222222");
    public static readonly Guid MicrosoftPublisherId = Guid.Parse("33333333-cccc-cccc-cccc-333333333333");

    public static Entity Publisher(Guid id, string unique, string friendly, string prefix, int optionPrefix) =>
        new("publisher", id)
        {
            ["uniquename"] = unique,
            ["friendlyname"] = friendly,
            ["customizationprefix"] = prefix,
            ["customizationoptionvalueprefix"] = optionPrefix,
        };

    public static Entity Solution(string unique, Guid publisherId, bool managed = false) =>
        new("solution", Guid.NewGuid())
        {
            ["uniquename"] = unique,
            ["publisherid"] = new EntityReference("publisher", publisherId),
            ["ismanaged"] = managed,
        };

    /// <summary>A client with Contoso (new), Fabrikam (fab) and Microsoft's publisher, and a Core solution under Contoso.</summary>
    public static FakeAgentClient Client()
    {
        var client = new FakeAgentClient();
        client.Publishers.Add(Publisher(ContosoPublisherId, "contoso", "Contoso", "new", 10000));
        client.Publishers.Add(Publisher(FabrikamPublisherId, "fabrikam", "Fabrikam", "fab", 20000));
        client.Publishers.Add(Publisher(MicrosoftPublisherId, "MicrosoftCorporation", "Microsoft", "", 0));
        client.Solutions.Add(Solution("Core", ContosoPublisherId));
        client.Solutions.Add(Solution("Managed1", ContosoPublisherId, managed: true));
        return client;
    }
}

internal sealed class FixedClientSource(IAgentClient client) : IAgentClientSource
{
    public IAgentClient Create(HttpContext context) => client;
}
