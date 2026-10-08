using System.Security;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Translator;

/// <summary>One <c>RetrieveLocLabels</c> read: a view or chart record and its name or description.</summary>
public sealed record LocLabelTarget(string EntityName, Guid RecordId, string AttributeName);

/// <summary>A <c>RetrieveLocLabels</c> result: the label, or the fault that stopped the read.</summary>
public sealed record LocLabelResult(Label? Label, Exception? Error);

public interface ITranslatorClient
{
    Task<int> RetrieveBaseLanguageAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<int>> RetrieveProvisionedLanguagesAsync(CancellationToken cancellationToken);

    /// <summary>Names from the <c>languagelocale</c> table. Missing LCIDs are left out.</summary>
    Task<IReadOnlyDictionary<int, string>> RetrieveLanguageNamesAsync(
        IReadOnlyCollection<int> lcids,
        CancellationToken cancellationToken);

    /// <summary>One chunk of published table metadata.</summary>
    Task<IReadOnlyList<EntityMetadata>> RetrieveMetadataAsync(
        RetrieveMetadataChangesRequest request,
        CancellationToken cancellationToken);

    /// <summary>Published global choices.</summary>
    Task<IReadOnlyList<OptionSetMetadataBase>> RetrieveAllOptionSetsAsync(CancellationToken cancellationToken);

    /// <summary>Every page of a query.</summary>
    Task<IReadOnlyList<Entity>> RetrieveAllPagesAsync(QueryExpression query, CancellationToken cancellationToken);

    /// <summary>Batched <c>RetrieveLocLabels</c>, one result per target in the same order.</summary>
    Task<IReadOnlyList<LocLabelResult>> RetrieveLocLabelsAsync(
        IReadOnlyList<LocLabelTarget> targets,
        bool includeUnpublished,
        CancellationToken cancellationToken);

    /// <summary>One table, including unpublished changes.</summary>
    Task<EntityMetadata> RetrieveTableAsync(string logicalName, EntityFilters filters, CancellationToken cancellationToken);

    /// <summary>One global choice, including unpublished changes.</summary>
    Task<OptionSetMetadataBase> RetrieveOptionSetAsync(string name, CancellationToken cancellationToken);

    /// <summary>
    /// Sends the requests in one <c>ExecuteMultiple</c> with <c>ContinueOnError</c>. Returns the fault
    /// for each failed request index. Throws when the whole batch fails.
    /// </summary>
    Task<IReadOnlyDictionary<int, Exception>> ExecuteBatchAsync(
        IReadOnlyList<OrganizationRequest> requests,
        CancellationToken cancellationToken);

    Task PublishAsync(string parameterXml, CancellationToken cancellationToken);
}

public static class TranslatorRequests
{
    /// <summary>Tables per <c>RetrieveMetadataChanges</c>. A cautious default, not a documented limit.</summary>
    public const int MetadataChunkSize = 100;

    /// <summary><c>RetrieveLocLabels</c> reads per <c>ExecuteMultiple</c>.</summary>
    public const int LocLabelChunkSize = 200;

    public static readonly string[] TableProperties =
    [
        "LogicalName", "SchemaName", "DisplayName", "DisplayCollectionName", "Description",
        "IsRenameable", "IsCustomizable", "IsManaged",
    ];

    public static readonly string[] AttributeProperties =
    [
        "LogicalName", "AttributeType", "AttributeTypeName", "AttributeOf", "DisplayName", "Description",
        "IsRenameable", "IsCustomizable", "IsManaged", "OptionSet",
    ];

    public static readonly string[] RelationshipProperties =
    [
        "SchemaName", "AssociatedMenuConfiguration", "Entity1AssociatedMenuConfiguration",
        "Entity2AssociatedMenuConfiguration", "Entity1LogicalName", "Entity2LogicalName",
        "ReferencedEntity", "ReferencingEntity", "IsCustomizable",
    ];

    public static RetrieveMetadataChangesRequest Metadata(
        IReadOnlyCollection<string> tables,
        IReadOnlyCollection<int> lcids,
        bool includeAttributes,
        bool includeRelationships)
    {
        var properties = new MetadataPropertiesExpression(TableProperties);
        if (includeAttributes) properties.PropertyNames.Add("Attributes");
        if (includeRelationships)
        {
            properties.PropertyNames.Add("OneToManyRelationships");
            properties.PropertyNames.Add("ManyToManyRelationships");
        }

        var criteria = new MetadataFilterExpression(LogicalOperator.And);
        criteria.Conditions.Add(new MetadataConditionExpression(
            "LogicalName",
            MetadataConditionOperator.In,
            tables.ToArray()));

        var query = new EntityQueryExpression
        {
            Criteria = criteria,
            Properties = properties,
            LabelQuery = new LabelQueryExpression(),
        };
        query.LabelQuery.FilterLanguages.AddRange(lcids);

        if (includeAttributes)
        {
            query.AttributeQuery = new AttributeQueryExpression
            {
                Properties = new MetadataPropertiesExpression(AttributeProperties),
            };
        }

        if (includeRelationships)
        {
            query.RelationshipQuery = new RelationshipQueryExpression
            {
                Properties = new MetadataPropertiesExpression(RelationshipProperties),
            };
        }

        return new RetrieveMetadataChangesRequest
        {
            Query = query,
            ClientVersionStamp = null,
        };
    }

    public static QueryExpression Views(IReadOnlyCollection<string> tables)
    {
        var query = new QueryExpression("savedquery")
        {
            ColumnSet = new ColumnSet("savedqueryid", "returnedtypecode", "querytype", "iscustomizable"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.In, tables.Cast<object>().ToArray());
        query.Criteria.AddCondition("isprivate", ConditionOperator.Equal, false);
        query.AddOrder("savedqueryid", OrderType.Ascending);
        return query;
    }

    public static QueryExpression Charts(IReadOnlyCollection<string> tables)
    {
        var query = new QueryExpression("savedqueryvisualization")
        {
            ColumnSet = new ColumnSet("savedqueryvisualizationid", "primaryentitytypecode", "iscustomizable"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("primaryentitytypecode", ConditionOperator.In, tables.Cast<object>().ToArray());
        query.AddOrder("savedqueryvisualizationid", OrderType.Ascending);
        return query;
    }

    public static RetrieveLocLabelsRequest LocLabels(LocLabelTarget target, bool includeUnpublished) =>
        new()
        {
            EntityMoniker = new EntityReference(target.EntityName, target.RecordId),
            AttributeName = target.AttributeName,
            IncludeUnpublished = includeUnpublished,
        };

    /// <summary>Publish only the touched tables and global choices. Never <c>PublishAllXml</c>.</summary>
    public static string PublishXml(PublishTargetsDto targets)
    {
        var builder = new System.Text.StringBuilder("<importexportxml>");
        if (targets.Tables.Count > 0)
        {
            builder.Append("<entities>");
            foreach (var table in targets.Tables)
                builder.Append("<entity>").Append(SecurityElement.Escape(table)).Append("</entity>");
            builder.Append("</entities>");
        }

        if (targets.OptionSets.Count > 0)
        {
            builder.Append("<optionsets>");
            foreach (var optionSet in targets.OptionSets)
                builder.Append("<optionset>").Append(SecurityElement.Escape(optionSet)).Append("</optionset>");
            builder.Append("</optionsets>");
        }

        return builder.Append("</importexportxml>").ToString();
    }
}

public sealed class DataverseTranslatorClient(IOrganizationServiceAsync2 service) : ITranslatorClient
{
    public async Task<int> RetrieveBaseLanguageAsync(CancellationToken cancellationToken)
    {
        var query = new QueryExpression("organization")
        {
            ColumnSet = new ColumnSet("languagecode"),
            TopCount = 1,
        };
        var result = await service.RetrieveMultipleAsync(query, cancellationToken);
        return result.Entities.FirstOrDefault()?.GetAttributeValue<int>("languagecode") ?? 1033;
    }

    public async Task<IReadOnlyList<int>> RetrieveProvisionedLanguagesAsync(CancellationToken cancellationToken)
    {
        var response = (RetrieveProvisionedLanguagesResponse)await service.ExecuteAsync(
            new RetrieveProvisionedLanguagesRequest(),
            cancellationToken);
        return response.RetrieveProvisionedLanguages ?? [];
    }

    public async Task<IReadOnlyDictionary<int, string>> RetrieveLanguageNamesAsync(
        IReadOnlyCollection<int> lcids,
        CancellationToken cancellationToken)
    {
        var names = new Dictionary<int, string>();
        if (lcids.Count == 0) return names;

        var query = new QueryExpression("languagelocale")
        {
            ColumnSet = new ColumnSet("localeid", "name", "language"),
        };
        query.Criteria.AddCondition("localeid", ConditionOperator.In, lcids.Cast<object>().ToArray());
        var result = await service.RetrieveMultipleAsync(query, cancellationToken);
        foreach (var row in result.Entities)
        {
            var lcid = row.GetAttributeValue<int>("localeid");
            var name = row.GetAttributeValue<string>("language");
            if (string.IsNullOrWhiteSpace(name)) name = row.GetAttributeValue<string>("name");
            if (lcid != 0 && !string.IsNullOrWhiteSpace(name)) names[lcid] = name.Trim();
        }

        return names;
    }

    public async Task<IReadOnlyList<EntityMetadata>> RetrieveMetadataAsync(
        RetrieveMetadataChangesRequest request,
        CancellationToken cancellationToken)
    {
        var response = (RetrieveMetadataChangesResponse)await service.ExecuteAsync(request, cancellationToken);
        return response.EntityMetadata;
    }

    public async Task<IReadOnlyList<OptionSetMetadataBase>> RetrieveAllOptionSetsAsync(CancellationToken cancellationToken)
    {
        var response = (RetrieveAllOptionSetsResponse)await service.ExecuteAsync(
            new RetrieveAllOptionSetsRequest { RetrieveAsIfPublished = false },
            cancellationToken);
        return response.OptionSetMetadata;
    }

    public async Task<IReadOnlyList<Entity>> RetrieveAllPagesAsync(QueryExpression query, CancellationToken cancellationToken)
    {
        var rows = new List<Entity>();
        query.PageInfo ??= new PagingInfo { Count = 5000, PageNumber = 1 };
        while (true)
        {
            var page = await service.RetrieveMultipleAsync(query, cancellationToken);
            rows.AddRange(page.Entities);
            if (!page.MoreRecords) return rows;
            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }
    }

    public async Task<IReadOnlyList<LocLabelResult>> RetrieveLocLabelsAsync(
        IReadOnlyList<LocLabelTarget> targets,
        bool includeUnpublished,
        CancellationToken cancellationToken)
    {
        var results = new LocLabelResult[targets.Count];
        for (var start = 0; start < targets.Count; start += TranslatorRequests.LocLabelChunkSize)
        {
            var chunk = targets.Skip(start).Take(TranslatorRequests.LocLabelChunkSize).ToList();
            var batch = new ExecuteMultipleRequest
            {
                Settings = new ExecuteMultipleSettings { ContinueOnError = true, ReturnResponses = true },
                Requests = [],
            };
            batch.Requests.AddRange(chunk.Select(target => TranslatorRequests.LocLabels(target, includeUnpublished)));

            var response = (ExecuteMultipleResponse)await service.ExecuteAsync(batch, cancellationToken);
            foreach (var item in response.Responses)
            {
                var index = start + item.RequestIndex;
                results[index] = item.Fault is not null
                    ? new LocLabelResult(null, TranslatorFaults.ToException(item.Fault))
                    : new LocLabelResult((item.Response as RetrieveLocLabelsResponse)?.Label, null);
            }
        }

        for (var i = 0; i < results.Length; i++)
            results[i] ??= new LocLabelResult(null, new InvalidOperationException("Dataverse returned no labels."));
        return results;
    }

    public async Task<EntityMetadata> RetrieveTableAsync(
        string logicalName,
        EntityFilters filters,
        CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityResponse)await service.ExecuteAsync(
            new RetrieveEntityRequest
            {
                LogicalName = logicalName,
                EntityFilters = filters,
                RetrieveAsIfPublished = true,
            },
            cancellationToken);
        return response.EntityMetadata;
    }

    public async Task<OptionSetMetadataBase> RetrieveOptionSetAsync(string name, CancellationToken cancellationToken)
    {
        var response = (RetrieveOptionSetResponse)await service.ExecuteAsync(
            new RetrieveOptionSetRequest { Name = name, RetrieveAsIfPublished = true },
            cancellationToken);
        return response.OptionSetMetadata;
    }

    public async Task<IReadOnlyDictionary<int, Exception>> ExecuteBatchAsync(
        IReadOnlyList<OrganizationRequest> requests,
        CancellationToken cancellationToken)
    {
        var batch = new ExecuteMultipleRequest
        {
            Settings = new ExecuteMultipleSettings { ContinueOnError = true, ReturnResponses = false },
            Requests = [],
        };
        batch.Requests.AddRange(requests);

        var response = (ExecuteMultipleResponse)await service.ExecuteAsync(batch, cancellationToken);
        var faults = new Dictionary<int, Exception>();
        foreach (var item in response.Responses)
        {
            if (item.Fault is not null)
                faults[item.RequestIndex] = TranslatorFaults.ToException(item.Fault);
        }

        return faults;
    }

    public async Task PublishAsync(string parameterXml, CancellationToken cancellationToken)
    {
        await service.ExecuteAsync(new PublishXmlRequest { ParameterXml = parameterXml }, cancellationToken);
    }
}
