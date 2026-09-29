using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.PolymorphicLookup;

public static class PolymorphicLookupRequests
{
    public const int SolutionPageSize = 5000;

    public static RetrieveMetadataChangesRequest CreateMetadataRequest()
    {
        var sides = new MetadataFilterExpression(LogicalOperator.Or);
        sides.Conditions.Add(new MetadataConditionExpression(
            "CanBePrimaryEntityInRelationship",
            MetadataConditionOperator.Equals,
            true));
        sides.Conditions.Add(new MetadataConditionExpression(
            "CanBeRelatedEntityInRelationship",
            MetadataConditionOperator.Equals,
            true));

        var criteria = new MetadataFilterExpression(LogicalOperator.And);
        criteria.Filters.Add(sides);
        criteria.Conditions.Add(new MetadataConditionExpression(
            "IsIntersect",
            MetadataConditionOperator.Equals,
            false));

        var attributes = new MetadataFilterExpression(LogicalOperator.And);
        attributes.Conditions.Add(new MetadataConditionExpression(
            "AttributeType",
            MetadataConditionOperator.Equals,
            AttributeTypeCode.Lookup));

        return new RetrieveMetadataChangesRequest
        {
            ClientVersionStamp = null,
            Query = new EntityQueryExpression
            {
                Criteria = criteria,
                Properties = Properties(
                    "DisplayName",
                    "SchemaName",
                    "LogicalName",
                    "PrimaryIdAttribute",
                    "CanBePrimaryEntityInRelationship",
                    "CanBeRelatedEntityInRelationship",
                    "IsSolutionAware",
                    "TableType",
                    "Attributes",
                    "ManyToOneRelationships"),
                AttributeQuery = new AttributeQueryExpression
                {
                    Criteria = attributes,
                    Properties = Properties(
                        "DisplayName",
                        "SchemaName",
                        "LogicalName",
                        "Targets",
                        "IsManaged",
                        "IsCustomizable"),
                },
                RelationshipQuery = new RelationshipQueryExpression
                {
                    Properties = Properties(
                        "SchemaName",
                        "ReferencingEntity",
                        "ReferencedEntity",
                        "ReferencingAttribute",
                        "ReferencedAttribute",
                        "IsValidForAdvancedFind",
                        "CascadeConfiguration",
                        "AssociatedMenuConfiguration"),
                },
            },
        };
    }

    public static QueryExpression CreateSolutionQuery(int pageNumber, string? pagingCookie, string? uniqueName = null)
    {
        var query = new QueryExpression("solution")
        {
            NoLock = true,
            ColumnSet = new ColumnSet("uniquename", "friendlyname", "version"),
            PageInfo = new PagingInfo
            {
                Count = SolutionPageSize,
                PageNumber = pageNumber,
                PagingCookie = pagingCookie,
            },
        };
        query.Criteria.AddCondition("ismanaged", ConditionOperator.Equal, false);
        if (!string.IsNullOrWhiteSpace(uniqueName))
        {
            query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
        }

        query.AddOrder("friendlyname", OrderType.Ascending);
        var publisher = query.AddLink("publisher", "publisherid", "publisherid", JoinOperator.Inner);
        publisher.EntityAlias = "pub";
        publisher.Columns = new ColumnSet("customizationprefix", "friendlyname");
        return query;
    }

    public static QueryExpression CreateOrganizationLanguageQuery() => new("organization")
    {
        NoLock = true,
        TopCount = 1,
        ColumnSet = new ColumnSet("languagecode"),
    };

    public static RetrieveEntityRequest CreateEntityRequest(string logicalName, EntityFilters filters) => new()
    {
        LogicalName = logicalName,
        EntityFilters = filters,
        RetrieveAsIfPublished = false,
    };

    public static PolymorphicMetadataDto MapMetadata(EntityMetadataCollection? entities, int languageCode)
    {
        var mapped = (entities ?? [])
            .Where(entity => entity.IsIntersect != true)
            .Select(MapEntity)
            .OrderBy(entity => entity.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return new PolymorphicMetadataDto(languageCode, mapped);
    }

    public static IReadOnlyList<UnmanagedSolutionDto> MapSolutions(IEnumerable<Entity> solutions) =>
        solutions.Select(solution => new UnmanagedSolutionDto(
            solution.GetAttributeValue<string>("uniquename") ?? "",
            solution.GetAttributeValue<string>("friendlyname") ?? "",
            solution.GetAttributeValue<string>("version") ?? "",
            Aliased(solution, "pub.friendlyname") ?? "",
            Aliased(solution, "pub.customizationprefix") ?? "")).ToArray();

    private static PolymorphicEntityDto MapEntity(EntityMetadata entity)
    {
        var lookups = (entity.Attributes ?? [])
            .OfType<LookupAttributeMetadata>()
            .Select(lookup => new LookupColumnDto(
                lookup.LogicalName ?? "",
                lookup.SchemaName ?? "",
                Label(lookup.DisplayName, lookup.LogicalName),
                lookup.Targets ?? [],
                lookup.IsManaged,
                lookup.IsCustomizable?.Value))
            .OrderBy(lookup => lookup.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var manyToOne = (entity.ManyToOneRelationships ?? [])
            .Select(MapRelationship)
            .ToArray();

        return new PolymorphicEntityDto(
            entity.LogicalName ?? "",
            entity.SchemaName ?? "",
            Label(entity.DisplayName, entity.LogicalName),
            entity.PrimaryIdAttribute ?? "",
            entity.CanBePrimaryEntityInRelationship?.Value == true,
            entity.CanBeRelatedEntityInRelationship?.Value == true,
            string.IsNullOrWhiteSpace(entity.TableType) ? null : entity.TableType,
            entity.IsSolutionAware == true,
            lookups,
            manyToOne);
    }

    private static ManyToOneDto MapRelationship(OneToManyRelationshipMetadata relationship)
    {
        var cascade = relationship.CascadeConfiguration;
        var menu = relationship.AssociatedMenuConfiguration;
        return new ManyToOneDto(
            relationship.SchemaName ?? "",
            relationship.ReferencingAttribute ?? "",
            relationship.ReferencedEntity ?? "",
            relationship.ReferencedAttribute ?? "",
            relationship.IsValidForAdvancedFind ?? true,
            new CascadeDto(
                CascadeName(cascade?.Assign, "NoCascade"),
                CascadeName(cascade?.Delete, "RemoveLink"),
                CascadeName(cascade?.Merge, "NoCascade"),
                CascadeName(cascade?.Reparent, "NoCascade"),
                CascadeName(cascade?.Share, "NoCascade"),
                CascadeName(cascade?.Unshare, "NoCascade"),
                CascadeName(cascade?.RollupView, "NoCascade")),
            menu?.Behavior?.ToString() ?? "UseCollectionName",
            menu?.Group?.ToString() ?? "Details",
            menu?.Order,
            menu?.Label?.UserLocalizedLabel?.Label);
    }

    private static string CascadeName(CascadeType? value, string fallback) =>
        value?.ToString() ?? fallback;

    private static string Label(Label? label, string? fallback) =>
        label?.UserLocalizedLabel?.Label
        ?? label?.LocalizedLabels?.FirstOrDefault()?.Label
        ?? fallback
        ?? "";

    private static string? Aliased(Entity entity, string name)
    {
        var value = entity.GetAttributeValue<AliasedValue>(name)?.Value;
        return value?.ToString();
    }

    private static MetadataPropertiesExpression Properties(params string[] names)
    {
        var expression = new MetadataPropertiesExpression { AllProperties = false };
        foreach (var name in names)
        {
            expression.PropertyNames.Add(name);
        }

        return expression;
    }
}
