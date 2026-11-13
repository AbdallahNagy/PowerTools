using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Agent;

public sealed record PublisherInfo(Guid Id, string UniqueName, string Prefix, int OptionValuePrefix, string FriendlyName = "");

public sealed record PublisherDto(string UniqueName, string FriendlyName, string Prefix);

/// <summary>Finds the publisher a new solution-aware component belongs to, and checks names against its prefix.</summary>
public static class AgentPublishers
{
    /// <summary>Microsoft's own publisher; agents never create components under it.</summary>
    public const string MicrosoftPublisher = "MicrosoftCorporation";

    public static QueryExpression PublishersQuery() => new("publisher")
    {
        NoLock = true,
        ColumnSet = new ColumnSet("uniquename", "friendlyname", "customizationprefix", "customizationoptionvalueprefix"),
    };

    public static QueryExpression SolutionQuery(string uniqueName)
    {
        var query = new QueryExpression("solution")
        {
            NoLock = true,
            TopCount = 1,
            ColumnSet = new ColumnSet("uniquename", "publisherid", "ismanaged"),
        };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
        return query;
    }

    public static async Task<IReadOnlyList<PublisherInfo>> ListAsync(IAgentClient client, CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveMultipleAsync(PublishersQuery(), cancellationToken);
        return rows.Entities
            .Select(row => new PublisherInfo(
                row.Id,
                row.GetAttributeValue<string>("uniquename") ?? "",
                row.GetAttributeValue<string>("customizationprefix") ?? "",
                row.GetAttributeValue<int?>("customizationoptionvalueprefix") ?? 0,
                row.GetAttributeValue<string>("friendlyname") ?? ""))
            .OrderBy(info => info.UniqueName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static IReadOnlyList<PublisherDto> ToDtos(IEnumerable<PublisherInfo> publishers) =>
        publishers
            .Where(info => !IsMicrosoft(info))
            .Select(info => new PublisherDto(info.UniqueName, info.FriendlyName, info.Prefix))
            .ToList();

    /// <summary>
    /// The publisher comes from <paramref name="solution"/>, or from <paramref name="publisher"/>
    /// (a unique name or a customization prefix). With neither the call needs a publisher, and the message lists them.
    /// </summary>
    public static async Task<AgentResult<PublisherInfo>> ResolveAsync(
        IAgentClient client,
        string? solution,
        string? publisher,
        CancellationToken cancellationToken)
    {
        var all = await ListAsync(client, cancellationToken);
        var choices = ListText(all);
        var hasSolution = !string.IsNullOrWhiteSpace(solution);
        var hasPublisher = !string.IsNullOrWhiteSpace(publisher);

        if (!hasSolution && !hasPublisher)
        {
            return AgentResult<PublisherInfo>.Fail(AgentFaults.PublisherRequired(
                $"A solution or a publisher is required. Publishers: {choices}."));
        }

        PublisherInfo? found = null;
        if (hasSolution)
        {
            var rows = await client.RetrieveMultipleAsync(SolutionQuery(solution!.Trim()), cancellationToken);
            var row = rows.Entities.FirstOrDefault();
            if (row is null)
                return AgentResult<PublisherInfo>.Fail(AgentFaults.NotFound($"Solution '{solution}' was not found."));
            if (row.GetAttributeValue<bool?>("ismanaged") == true)
                return AgentResult<PublisherInfo>.Fail(AgentFaults.InvalidRequest($"Solution '{solution}' is managed and cannot be changed."));

            var publisherId = row.GetAttributeValue<EntityReference>("publisherid")?.Id;
            found = all.FirstOrDefault(info => info.Id == publisherId);
            if (found is null)
                return AgentResult<PublisherInfo>.Fail(AgentFaults.NotFound($"The publisher of solution '{solution}' was not found."));
        }

        if (hasPublisher)
        {
            var wanted = publisher!.Trim();
            var named = all.FirstOrDefault(info =>
                string.Equals(info.UniqueName, wanted, StringComparison.OrdinalIgnoreCase)
                || (info.Prefix.Length > 0 && string.Equals(info.Prefix, wanted, StringComparison.OrdinalIgnoreCase)));
            if (named is null)
            {
                return AgentResult<PublisherInfo>.Fail(AgentFaults.NotFound(
                    $"Publisher '{publisher}' was not found. Publishers: {choices}."));
            }

            if (found is not null && found.Id != named.Id)
            {
                return AgentResult<PublisherInfo>.Fail(AgentFaults.InvalidRequest(
                    $"Solution '{solution}' belongs to publisher '{found.UniqueName}', not '{named.UniqueName}'. Give one of them, or matching ones."));
            }

            found = named;
        }

        if (found!.Prefix.Length == 0)
        {
            return AgentResult<PublisherInfo>.Fail(AgentFaults.InvalidRequest(
                $"Publisher '{found.UniqueName}' has no customization prefix, so it cannot own new components."));
        }

        return AgentResult<PublisherInfo>.Ok(found);
    }

    /// <summary>A schema name must start with the publisher's prefix and an underscore.</summary>
    public static AgentProblem? CheckSchemaName(string schemaName, PublisherInfo publisher)
    {
        var prefix = publisher.Prefix + "_";
        if (schemaName.Length <= prefix.Length || !schemaName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return AgentFaults.InvalidRequest(
                $"Schema name '{schemaName}' must start with the publisher prefix '{prefix}' and have a name after it.");
        }

        return null;
    }

    private static bool IsMicrosoft(PublisherInfo info) =>
        string.Equals(info.UniqueName, MicrosoftPublisher, StringComparison.OrdinalIgnoreCase);

    private static string ListText(IEnumerable<PublisherInfo> all) =>
        string.Join(", ", all.Where(info => !IsMicrosoft(info)).Select(info => $"{info.UniqueName} ({info.Prefix})"));
}
