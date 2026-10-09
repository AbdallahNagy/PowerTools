using System.Text.RegularExpressions;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Translator;

/// <summary><c>solutioncomponent.componenttype</c> values the Translator reads and adds.</summary>
public static class SolutionComponentTypes
{
    public const int Entity = 1;
    public const int Attribute = 2;
    public const int OptionSet = 9;
    public const int Relationship = 10;
    public const int SavedQuery = 26;
    public const int SavedQueryVisualization = 59;

    public static readonly int[] All = [Entity, Attribute, OptionSet, Relationship, SavedQuery, SavedQueryVisualization];

    /// <summary><c>rootcomponentbehavior</c> 0: the table was added with all of its subcomponents.</summary>
    public const int IncludeSubcomponents = 0;
}

/// <summary>The components of one solution, grouped by type.</summary>
public sealed class SolutionScope
{
    /// <summary>Table metadata id to <c>rootcomponentbehavior</c>.</summary>
    public Dictionary<Guid, int> Tables { get; } = [];
    public HashSet<Guid> Attributes { get; } = [];
    public HashSet<Guid> OptionSets { get; } = [];
    public HashSet<Guid> Relationships { get; } = [];
    public HashSet<Guid> Views { get; } = [];
    public HashSet<Guid> Charts { get; } = [];

    /// <summary>The table itself is in the solution (any root behavior).</summary>
    public bool IncludesTable(Guid? tableId) => tableId is { } id && Tables.ContainsKey(id);

    /// <summary>The table was added with all subcomponents, so every label of it is in scope.</summary>
    public bool IncludesAll(Guid? tableId) =>
        tableId is { } id && Tables.TryGetValue(id, out var behavior) && behavior == SolutionComponentTypes.IncludeSubcomponents;

    public static bool Contains(HashSet<Guid> set, Guid? id) => id is { } value && set.Contains(value);

    public static SolutionScope From(IEnumerable<Entity> components)
    {
        var scope = new SolutionScope();
        foreach (var component in components)
        {
            var objectId = component.GetAttributeValue<Guid>("objectid");
            if (objectId == Guid.Empty) continue;
            var type = component.GetAttributeValue<OptionSetValue>("componenttype")?.Value;
            switch (type)
            {
                case SolutionComponentTypes.Entity:
                    // Older solutions have no root behavior; they included every subcomponent.
                    scope.Tables[objectId] = component.GetAttributeValue<OptionSetValue>("rootcomponentbehavior")?.Value
                        ?? SolutionComponentTypes.IncludeSubcomponents;
                    break;
                case SolutionComponentTypes.Attribute:
                    scope.Attributes.Add(objectId);
                    break;
                case SolutionComponentTypes.OptionSet:
                    scope.OptionSets.Add(objectId);
                    break;
                case SolutionComponentTypes.Relationship:
                    scope.Relationships.Add(objectId);
                    break;
                case SolutionComponentTypes.SavedQuery:
                    scope.Views.Add(objectId);
                    break;
                case SolutionComponentTypes.SavedQueryVisualization:
                    scope.Charts.Add(objectId);
                    break;
            }
        }

        return scope;
    }
}

/// <summary>The solution an apply job adds its changed components to.</summary>
public sealed record SolutionTarget(string UniqueName, string FriendlyName, NewSolutionPlan? New);

/// <summary>A solution the job creates before adding components.</summary>
public sealed record NewSolutionPlan(string UniqueName, string FriendlyName, Guid PublisherId, string Version);

/// <summary>One component to add with <c>AddSolutionComponent</c>.</summary>
public sealed record SolutionComponentRef(int Type, Guid? Id, string Name, bool DoNotIncludeSubcomponents = false);

public static class TranslatorSolutionQueries
{
    /// <summary>Ids per <c>In</c> condition when mapping solution components to tables.</summary>
    public const int IdChunkSize = 250;

    /// <summary>Solutions that are never offered as a source or a target.</summary>
    public static readonly string[] HiddenSolutions = ["Default", "Active"];

    public static QueryExpression Solutions()
    {
        var query = new QueryExpression("solution")
        {
            ColumnSet = new ColumnSet("solutionid", "uniquename", "friendlyname", "version", "ismanaged", "publisherid"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("uniquename", ConditionOperator.NotIn, HiddenSolutions.Cast<object>().ToArray());
        query.AddOrder("friendlyname", OrderType.Ascending);
        query.AddOrder("solutionid", OrderType.Ascending);
        return query;
    }

    public static QueryExpression SolutionByUniqueName(string uniqueName)
    {
        var query = new QueryExpression("solution")
        {
            ColumnSet = new ColumnSet("solutionid", "uniquename", "friendlyname", "ismanaged", "isvisible"),
        };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
        return query;
    }

    /// <summary>Publishers a new solution can use. Read-only publishers (for example Microsoft's) are left out.</summary>
    public static QueryExpression Publishers()
    {
        var query = new QueryExpression("publisher")
        {
            ColumnSet = new ColumnSet("publisherid", "uniquename", "friendlyname", "customizationprefix"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("isreadonly", ConditionOperator.Equal, false);
        query.AddOrder("friendlyname", OrderType.Ascending);
        query.AddOrder("publisherid", OrderType.Ascending);
        return query;
    }

    public static QueryExpression PublisherById(Guid publisherId)
    {
        var query = new QueryExpression("publisher")
        {
            ColumnSet = new ColumnSet("publisherid", "uniquename", "isreadonly"),
        };
        query.Criteria.AddCondition("publisherid", ConditionOperator.Equal, publisherId);
        return query;
    }

    /// <summary>Every component of the types the Translator shows. Paged; no 5,000-row cap.</summary>
    public static QueryExpression Components(Guid solutionId)
    {
        var query = new QueryExpression("solutioncomponent")
        {
            ColumnSet = new ColumnSet("objectid", "componenttype", "rootcomponentbehavior"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("solutionid", ConditionOperator.Equal, solutionId);
        query.Criteria.AddCondition(
            "componenttype",
            ConditionOperator.In,
            SolutionComponentTypes.All.Cast<object>().ToArray());
        query.AddOrder("solutioncomponentid", OrderType.Ascending);
        return query;
    }

    /// <summary>Views or charts by id, with the table they belong to.</summary>
    public static QueryExpression RecordsById(string entityName, string idAttribute, string tableAttribute, IReadOnlyCollection<Guid> ids)
    {
        var query = new QueryExpression(entityName)
        {
            ColumnSet = new ColumnSet(idAttribute, tableAttribute),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition(idAttribute, ConditionOperator.In, ids.Cast<object>().ToArray());
        query.AddOrder(idAttribute, OrderType.Ascending);
        return query;
    }

    /// <summary>
    /// The table list: every table with only its id, logical name, display name in one language, and the
    /// flags used to hide intersect and private tables. Far lighter than <c>RetrieveAllEntities</c>, which
    /// returns every label in every language for every table.
    /// </summary>
    public static RetrieveMetadataChangesRequest TableSummaries(int lcid)
    {
        var query = new EntityQueryExpression
        {
            Properties = new MetadataPropertiesExpression("MetadataId", "LogicalName", "DisplayName", "IsIntersect", "IsPrivate"),
            LabelQuery = new LabelQueryExpression(),
        };
        if (lcid > 0) query.LabelQuery.FilterLanguages.Add(lcid);
        return new RetrieveMetadataChangesRequest { Query = query, ClientVersionStamp = null };
    }

    /// <summary>
    /// Finds the tables that own the given columns and relationships. Returns every table, but each one
    /// carries only the matching columns and relationships.
    /// </summary>
    public static RetrieveMetadataChangesRequest ComponentTables(
        IReadOnlyCollection<Guid> attributeIds,
        IReadOnlyCollection<Guid> relationshipIds)
    {
        var properties = new MetadataPropertiesExpression("MetadataId", "LogicalName");
        var query = new EntityQueryExpression { Properties = properties };
        if (attributeIds.Count > 0)
        {
            properties.PropertyNames.Add("Attributes");
            var criteria = new MetadataFilterExpression(LogicalOperator.And);
            criteria.Conditions.Add(new MetadataConditionExpression("MetadataId", MetadataConditionOperator.In, attributeIds.ToArray()));
            query.AttributeQuery = new AttributeQueryExpression
            {
                Criteria = criteria,
                Properties = new MetadataPropertiesExpression("MetadataId", "LogicalName"),
            };
        }

        if (relationshipIds.Count > 0)
        {
            properties.PropertyNames.Add("OneToManyRelationships");
            properties.PropertyNames.Add("ManyToManyRelationships");
            var criteria = new MetadataFilterExpression(LogicalOperator.And);
            criteria.Conditions.Add(new MetadataConditionExpression("MetadataId", MetadataConditionOperator.In, relationshipIds.ToArray()));
            query.RelationshipQuery = new RelationshipQueryExpression
            {
                Criteria = criteria,
                Properties = new MetadataPropertiesExpression(
                    "MetadataId", "SchemaName", "ReferencedEntity", "Entity1LogicalName", "Entity2LogicalName"),
            };
        }

        return new RetrieveMetadataChangesRequest { Query = query, ClientVersionStamp = null };
    }

    public static Entity NewSolution(NewSolutionPlan plan)
    {
        var solution = new Entity("solution");
        solution["uniquename"] = plan.UniqueName;
        solution["friendlyname"] = plan.FriendlyName;
        solution["version"] = plan.Version;
        solution["publisherid"] = new EntityReference("publisher", plan.PublisherId);
        return solution;
    }

    public static AddSolutionComponentRequest AddComponent(string solutionUniqueName, SolutionComponentRef component) =>
        new()
        {
            ComponentType = component.Type,
            ComponentId = component.Id ?? Guid.Empty,
            SolutionUniqueName = solutionUniqueName,
            AddRequiredComponents = false,
            DoNotIncludeSubcomponents = component.DoNotIncludeSubcomponents,
        };
}

public static partial class TranslatorSolutionValidation
{
    public const int MaxUniqueNameLength = 65;
    public const int MaxFriendlyNameLength = 256;
    public const string DefaultVersion = "1.0.0.0";

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex UniqueNamePattern();

    [GeneratedRegex(@"^\d{1,9}(\.\d{1,9}){1,3}$")]
    private static partial Regex VersionPattern();

    public static bool IsHidden(string uniqueName) =>
        TranslatorSolutionQueries.HiddenSolutions.Contains(uniqueName.Trim(), StringComparer.OrdinalIgnoreCase);

    /// <summary>Checks the fields of a new solution without calling Dataverse.</summary>
    public static string? NewSolutionProblem(NewSolutionDto plan)
    {
        var friendly = plan.FriendlyName?.Trim() ?? "";
        var unique = plan.UniqueName?.Trim() ?? "";
        var version = string.IsNullOrWhiteSpace(plan.Version) ? DefaultVersion : plan.Version.Trim();
        if (friendly.Length == 0) return "Enter a display name for the new solution.";
        if (friendly.Length > MaxFriendlyNameLength) return $"The display name can have at most {MaxFriendlyNameLength} characters.";
        if (unique.Length == 0) return "Enter a unique name for the new solution.";
        if (unique.Length > MaxUniqueNameLength) return $"The unique name can have at most {MaxUniqueNameLength} characters.";
        if (!UniqueNamePattern().IsMatch(unique))
            return "The unique name can contain only letters, numbers, and underscores, and cannot start with a number.";
        if (IsHidden(unique)) return $"\"{unique}\" is reserved. Choose another unique name.";
        if (plan.PublisherId is null || plan.PublisherId == Guid.Empty) return "Choose a publisher for the new solution.";
        if (!VersionPattern().IsMatch(version)) return "The version must look like 1.0.0.0.";
        return null;
    }
}
