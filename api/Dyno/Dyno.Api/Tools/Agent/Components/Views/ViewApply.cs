using System.ComponentModel;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Views;

[JsonConverter(typeof(JsonStringEnumConverter<ViewType>))]
public enum ViewType
{
    [JsonStringEnumMemberName("public")] Public,
    [JsonStringEnumMemberName("advancedFind")] AdvancedFind,
    [JsonStringEnumMemberName("associated")] Associated,
    [JsonStringEnumMemberName("quickFind")] QuickFind,
    [JsonStringEnumMemberName("lookup")] Lookup,
}

[JsonConverter(typeof(JsonStringEnumConverter<FilterType>))]
public enum FilterType
{
    [JsonStringEnumMemberName("and")] And,
    [JsonStringEnumMemberName("or")] Or,
}

[Description("The desired state of one system view. Dyno writes the FetchXML and layout so they match. Parts left out stay as they are.")]
public sealed class ViewApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the changes go into.")]
    public required string Solution { get; init; }

    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("Default public. Only public views can be created; the others exist once per table and are updated.")]
    public ViewType? Type { get; init; }

    [Description("The view's name. Finds a public view; for the other types it renames.")]
    public string? Name { get; init; }

    public string? Description { get; init; }

    [Description("The grid's columns in order. Replaces the current columns.")]
    public List<ViewColumn>? Columns { get; init; }

    [Description("The view's filter. Replaces the current filter; link-entity filters stay.")]
    public ViewFilter? Filter { get; init; }

    [Description("Sort order. Replaces the current one.")]
    public List<ViewSort>? Sort { get; init; }

    [Description("quickFind: the columns searched.")]
    public List<string>? FindColumns { get; init; }

    [Description("Make this the table's default public view.")]
    public bool? IsDefault { get; init; }
}

public sealed class ViewColumn
{
    [Description("Column logical name of the table.")]
    public required string Name { get; init; }

    [Description("Width in pixels. Default 150.")]
    public int? Width { get; init; }
}

public sealed class ViewFilter
{
    [Description("Default and.")]
    public FilterType? Type { get; init; }

    public required List<ViewCondition> Conditions { get; init; }
}

public sealed class ViewCondition
{
    public required string Column { get; init; }

    [Description("FetchXML operator, for example eq, ne, like, null, not-null, in, gt, on-or-after, last-x-days, eq-userid.")]
    public required string Operator { get; init; }

    public string? Value { get; init; }

    [Description("For in, not-in and between.")]
    public List<string>? Values { get; init; }
}

public sealed class ViewSort
{
    public required string Column { get; init; }

    public bool? Descending { get; init; }
}

/// <summary>Reads and edits a view's FetchXML and layoutxml as a model, so a change touches only what the spec gives.</summary>
public static partial class ViewXml
{
    public const int DefaultWidth = 150;

    [GeneratedRegex("^[a-z][a-z-]*$")]
    private static partial Regex OperatorPattern();

    public static int QueryType(ViewType type) => type switch
    {
        ViewType.AdvancedFind => 1,
        ViewType.Associated => 2,
        ViewType.QuickFind => 4,
        ViewType.Lookup => 64,
        _ => 0,
    };

    public static ViewType? TypeOf(int queryType) => queryType switch
    {
        0 => ViewType.Public,
        1 => ViewType.AdvancedFind,
        2 => ViewType.Associated,
        4 => ViewType.QuickFind,
        64 => ViewType.Lookup,
        _ => null,
    };

    public static XDocument Parse(string xml, string what)
    {
        try
        {
            return XDocument.Parse(string.IsNullOrWhiteSpace(xml) ? $"<{what}/>" : xml);
        }
        catch (System.Xml.XmlException ex)
        {
            throw new AgentProblemException(AgentFaults.InvalidRequest($"The view's {what} XML cannot be read: {ex.Message}"));
        }
    }

    public static string Text(XDocument doc) => doc.Root!.ToString(SaveOptions.DisableFormatting);

    public static string NewFetch(string table, string primaryId) =>
        $"<fetch version=\"1.0\" output-format=\"xml-platform\" mapping=\"logical\" distinct=\"false\"><entity name=\"{table}\"><attribute name=\"{primaryId}\"/></entity></fetch>";

    public static string NewLayout(int objectTypeCode, string primaryId, string? primaryName) =>
        $"<grid name=\"resultset\" object=\"{objectTypeCode}\" jump=\"{primaryName ?? primaryId}\" select=\"1\" icon=\"1\" preview=\"1\"><row name=\"result\" id=\"{primaryId}\"></row></grid>";

    // ── Reading ──────────────────────────────────────────────────────────────

    public static List<ViewColumn> Columns(XDocument layout) =>
        layout.Descendants("row").FirstOrDefault()?.Elements("cell")
            .Select(cell => new ViewColumn { Name = (string?)cell.Attribute("name") ?? "", Width = (int?)cell.Attribute("width") })
            .ToList() ?? [];

    public static List<ViewSort> Sort(XDocument fetch) =>
        Entity(fetch)?.Elements("order")
            .Select(order => new ViewSort { Column = (string?)order.Attribute("attribute") ?? "", Descending = (string?)order.Attribute("descending") == "true" })
            .ToList() ?? [];

    public static ViewFilter? Filter(XDocument fetch)
    {
        var filters = Entity(fetch)?.Elements("filter").Where(f => !IsFind(f)).ToList() ?? [];
        if (filters.Count == 0) return null;
        var filter = filters.Count == 1 ? filters[0] : new XElement("filter", new XAttribute("type", "and"), filters.SelectMany(f => f.Elements("condition")));
        return new ViewFilter
        {
            Type = (string?)filter.Attribute("type") == "or" ? FilterType.Or : FilterType.And,
            Conditions = filter.Elements("condition").Select(c => new ViewCondition
            {
                Column = (string?)c.Attribute("attribute") ?? "",
                Operator = (string?)c.Attribute("operator") ?? "",
                Value = (string?)c.Attribute("value"),
                Values = c.Elements("value").Any() ? c.Elements("value").Select(v => v.Value).ToList() : null,
            }).ToList(),
        };
    }

    public static List<string> FindColumns(XDocument fetch) =>
        Entity(fetch)?.Elements("filter").Where(IsFind).SelectMany(f => f.Elements("condition"))
            .Select(c => (string?)c.Attribute("attribute") ?? "").ToList() ?? [];

    /// <summary>True when the filter has a condition the model cannot hold (a nested filter), so it is kept as is.</summary>
    public static bool HasNestedFilter(XDocument fetch) =>
        Entity(fetch)?.Elements("filter").Where(f => !IsFind(f)).Any(f => f.Elements("filter").Any()) == true;

    private static XElement? Entity(XDocument fetch) => fetch.Root?.Element("entity");

    private static bool IsFind(XElement filter) => (string?)filter.Attribute("isquickfindfields") == "1";

    // ── Comparing ────────────────────────────────────────────────────────────

    public static string Key(IEnumerable<ViewColumn> columns) =>
        string.Join(",", columns.Select(c => $"{c.Name.ToLowerInvariant()}:{c.Width ?? DefaultWidth}"));

    public static string Key(IEnumerable<ViewSort> sort) =>
        string.Join(",", sort.Select(s => $"{s.Column.ToLowerInvariant()}{(s.Descending == true ? " desc" : "")}"));

    public static string Key(ViewFilter? filter) => filter is null || filter.Conditions.Count == 0
        ? ""
        : $"{(filter.Type == FilterType.Or ? "or" : "and")}:" + string.Join(";", filter.Conditions.Select(c =>
            $"{c.Column.ToLowerInvariant()} {c.Operator} {c.Value}{(c.Values is null ? "" : "[" + string.Join("|", c.Values) + "]")}"));

    // ── Editing ──────────────────────────────────────────────────────────────

    public static void SetColumns(XDocument layout, XDocument fetch, IReadOnlyList<ViewColumn> columns)
    {
        var row = layout.Descendants("row").FirstOrDefault() ?? throw new AgentProblemException(AgentFaults.InvalidRequest("The view's layout has no row."));
        row.Elements("cell").Remove();
        foreach (var column in columns)
            row.Add(new XElement("cell", new XAttribute("name", column.Name.ToLowerInvariant()), new XAttribute("width", column.Width ?? DefaultWidth)));

        var entity = Entity(fetch)!;
        foreach (var column in columns)
        {
            var name = column.Name.ToLowerInvariant();
            if (entity.Elements("attribute").Any(a => (string?)a.Attribute("name") == name)) continue;
            var attribute = new XElement("attribute", new XAttribute("name", name));
            if (entity.Elements("attribute").LastOrDefault() is { } last) last.AddAfterSelf(attribute);
            else entity.AddFirst(attribute);
        }
    }

    public static void SetSort(XDocument fetch, IReadOnlyList<ViewSort> sort)
    {
        var entity = Entity(fetch)!;
        entity.Elements("order").Remove();
        var orders = sort.Select(s => new XElement("order",
            new XAttribute("attribute", s.Column.ToLowerInvariant()),
            new XAttribute("descending", s.Descending == true ? "true" : "false")));
        if (entity.Elements("attribute").LastOrDefault() is { } last) last.AddAfterSelf(orders);
        else entity.AddFirst(orders);
    }

    public static void SetFilter(XDocument fetch, ViewFilter filter)
    {
        var entity = Entity(fetch)!;
        entity.Elements("filter").Where(f => !IsFind(f)).Remove();
        if (filter.Conditions.Count == 0) return;
        entity.Add(new XElement("filter",
            new XAttribute("type", filter.Type == FilterType.Or ? "or" : "and"),
            filter.Conditions.Select(Condition)));
    }

    public static void SetFindColumns(XDocument fetch, IReadOnlyList<string> columns)
    {
        var entity = Entity(fetch)!;
        entity.Elements("filter").Where(IsFind).Remove();
        if (columns.Count == 0) return;
        entity.Add(new XElement("filter",
            new XAttribute("type", "or"),
            new XAttribute("isquickfindfields", "1"),
            columns.Select(c => new XElement("condition",
                new XAttribute("attribute", c.ToLowerInvariant()), new XAttribute("operator", "like"), new XAttribute("value", "{0}")))));
    }

    private static XElement Condition(ViewCondition condition)
    {
        if (!OperatorPattern().IsMatch(condition.Operator))
            throw new AgentProblemException(AgentFaults.InvalidRequest($"Condition on {condition.Column}: '{condition.Operator}' is not a FetchXML operator."));
        var element = new XElement("condition",
            new XAttribute("attribute", condition.Column.ToLowerInvariant()),
            new XAttribute("operator", condition.Operator));
        if (condition.Value is not null) element.Add(new XAttribute("value", condition.Value));
        foreach (var value in condition.Values ?? []) element.Add(new XElement("value", value));
        return element;
    }
}

/// <summary>
/// Plans view_apply: creates a public view or updates any system view of a table. It writes the FetchXML and layoutxml
/// together, so the grid's columns are always fetched. Parts the spec leaves out (and link-entities) stay as they are.
/// </summary>
public sealed class ViewPlanner : IComponentPlanner<ViewApplySpec>
{
    public const string Family = "view";

    public async Task<Plan> PlanAsync(ViewApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var type = spec.Type ?? ViewType.Public;
        var table = spec.Table.Trim().ToLowerInvariant();
        await context.SolutionAsync(spec.Solution, ct);
        var metadata = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Table {table} does not exist.");
        Validate(spec, type, metadata);

        var view = await FindAsync(context.Client, table, type, spec.Name, ct);
        var label = $"{table}/{spec.Name ?? view?.GetAttributeValue<string>("name") ?? type.ToString()}";
        var publish = new[] { new PublishTarget(PublishKind.Entity, table) };
        var lockKey = $"view:{table}:{ViewXml.QueryType(type)}:{(spec.Name ?? "").ToLowerInvariant()}";

        if (view is null)
        {
            if (type != ViewType.Public)
                throw Invalid($"Table {table} has no {type} view to update. Only public views can be created.");
            if (string.IsNullOrWhiteSpace(spec.Name)) throw Invalid("A public view needs name.");
            if (spec.Columns is not { Count: > 0 }) throw Invalid($"View {spec.Name} does not exist yet; a new view needs columns.");
            var fetch = ViewXml.Parse(ViewXml.NewFetch(table, metadata.PrimaryIdAttribute), "fetch");
            var layout = ViewXml.Parse(ViewXml.NewLayout(metadata.ObjectTypeCode ?? 0, metadata.PrimaryIdAttribute, metadata.PrimaryNameAttribute), "grid");
            Edit(spec, fetch, layout);
            var row = new Entity("savedquery")
            {
                ["name"] = spec.Name.Trim(),
                ["returnedtypecode"] = table,
                ["querytype"] = 0,
                ["fetchxml"] = ViewXml.Text(fetch),
                ["layoutxml"] = ViewXml.Text(layout),
            };
            if (spec.Description is not null) row["description"] = spec.Description;
            if (spec.IsDefault == true) row["isdefault"] = true;
            return new Plan(
                [new PlanStep
                {
                    Op = "createView",
                    Target = label,
                    Detail = Describe(spec),
                    Request = new CreateRequest { Target = row },
                    Publishes = publish,
                }],
                lockKeys: [lockKey]);
        }

        if (view.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
            return new Plan([PlanStep.Blocked("updateView", label, $"View {label} is managed and not customizable.")], lockKeys: [lockKey]);

        var currentFetch = ViewXml.Parse(view.GetAttributeValue<string>("fetchxml") ?? "", "fetch");
        var currentLayout = ViewXml.Parse(view.GetAttributeValue<string>("layoutxml") ?? "", "grid");
        var changes = Changes(spec, type, view, currentFetch, currentLayout);
        var stateToken = Hash($"{view.GetAttributeValue<string>("fetchxml")}|{view.GetAttributeValue<string>("layoutxml")}|{view.GetAttributeValue<string>("name")}");
        if (changes.Count == 0) return new Plan([], lockKeys: [lockKey, Locks.RecordKey(view.Id)], stateToken: stateToken);

        var editedFetch = new XDocument(currentFetch);
        var editedLayout = new XDocument(currentLayout);
        Edit(spec, editedFetch, editedLayout);
        var update = new Entity("savedquery", view.Id)
        {
            ["fetchxml"] = ViewXml.Text(editedFetch),
            ["layoutxml"] = ViewXml.Text(editedLayout),
        };
        if (spec.Name is not null && type != ViewType.Public) update["name"] = spec.Name.Trim();
        if (spec.Description is not null) update["description"] = spec.Description;
        if (spec.IsDefault == true) update["isdefault"] = true;
        return new Plan(
            [new PlanStep
            {
                Op = "updateView",
                Target = label,
                Detail = string.Join("; ", changes),
                Request = new UpdateRequest { Target = update },
                Publishes = publish,
            }],
            lockKeys: [lockKey, Locks.RecordKey(view.Id)],
            stateToken: stateToken);
    }

    private static void Edit(ViewApplySpec spec, XDocument fetch, XDocument layout)
    {
        if (spec.Columns is { Count: > 0 } columns) ViewXml.SetColumns(layout, fetch, columns);
        if (spec.Sort is { } sort) ViewXml.SetSort(fetch, sort);
        if (spec.Filter is { } filter) ViewXml.SetFilter(fetch, filter);
        if (spec.FindColumns is { } find) ViewXml.SetFindColumns(fetch, find);
    }

    private static List<string> Changes(ViewApplySpec spec, ViewType type, Entity view, XDocument fetch, XDocument layout)
    {
        var changes = new List<string>();
        if (spec.Name is not null && type != ViewType.Public && view.GetAttributeValue<string>("name") != spec.Name.Trim())
            changes.Add($"name → {spec.Name.Trim()}");
        if (spec.Description is not null && (view.GetAttributeValue<string>("description") ?? "") != spec.Description)
            changes.Add($"description → {spec.Description}");
        if (spec.IsDefault == true && view.GetAttributeValue<bool?>("isdefault") != true) changes.Add("make default");
        if (spec.Columns is { Count: > 0 } columns)
        {
            var current = ViewXml.Columns(layout);
            var fetched = fetch.Root?.Element("entity")?.Elements("attribute").Select(a => (string?)a.Attribute("name")).ToHashSet() ?? [];
            if (ViewXml.Key(current) != ViewXml.Key(columns) || columns.Any(c => !fetched.Contains(c.Name.ToLowerInvariant())))
                changes.Add($"columns → {ViewXml.Key(columns)}");
        }

        if (spec.Sort is { } sort && ViewXml.Key(ViewXml.Sort(fetch)) != ViewXml.Key(sort)) changes.Add($"sort → {ViewXml.Key(sort)}");
        if (spec.Filter is { } filter && (ViewXml.HasNestedFilter(fetch) || ViewXml.Key(ViewXml.Filter(fetch)) != ViewXml.Key(filter)))
            changes.Add($"filter → {ViewXml.Key(filter)}");
        if (spec.FindColumns is { } find && !ViewXml.FindColumns(fetch).Select(c => c.ToLowerInvariant()).SequenceEqual(find.Select(c => c.ToLowerInvariant())))
            changes.Add($"find columns → {string.Join(",", find.Select(c => c.ToLowerInvariant()))}");
        return changes;
    }

    private static string Describe(ViewApplySpec spec) => string.Join("; ", new[]
    {
        spec.Columns is { } c ? $"columns {ViewXml.Key(c)}" : null,
        spec.Sort is { } s ? $"sort {ViewXml.Key(s)}" : null,
        spec.Filter is { } f ? $"filter {ViewXml.Key(f)}" : null,
        spec.Description is { } d ? $"description {d}" : null,
        spec.IsDefault == true ? "default" : null,
    }.Where(p => p is not null));

    private static void Validate(ViewApplySpec spec, ViewType type, EntityMetadata metadata)
    {
        var known = (metadata.Attributes ?? []).Select(a => a.LogicalName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var named = (spec.Columns ?? []).Select(c => c.Name)
            .Concat((spec.Sort ?? []).Select(s => s.Column))
            .Concat((spec.Filter?.Conditions ?? []).Select(c => c.Column))
            .Concat(spec.FindColumns ?? []);
        var unknown = known.Count == 0 ? [] : named.Where(n => !known.Contains(n)).Distinct().ToList();
        if (unknown.Count > 0) throw Invalid($"Table {metadata.LogicalName} has no column {string.Join(", ", unknown)}. Use inspect_schema kind column for the names.");
        if ((spec.Columns ?? []).Any(c => c.Width is < 10 or > 1000)) throw Invalid("A column width must be from 10 to 1000.");
        if (spec.FindColumns is not null && type != ViewType.QuickFind) throw Invalid("findColumns is only for the quickFind view.");
        if (spec.IsDefault == true && type != ViewType.Public) throw Invalid("Only a public view can be the default.");
        if (spec.Columns is { } columns && columns.GroupBy(c => c.Name.ToLowerInvariant()).FirstOrDefault(g => g.Count() > 1) is { } twice)
            throw Invalid($"Column {twice.Key} is listed twice.");
    }

    /// <summary>The view as it stands, published or not, or null.</summary>
    internal static async Task<Entity?> FindAsync(IAgentClient client, string table, ViewType type, string? name, CancellationToken ct)
    {
        var query = new QueryExpression("savedquery") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name") };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, table);
        query.Criteria.AddCondition("querytype", ConditionOperator.Equal, ViewXml.QueryType(type));
        if (type == ViewType.Public) query.Criteria.AddCondition("name", ConditionOperator.Equal, (name ?? "").Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0) return null;
        if (rows.Count > 1 && type == ViewType.Public) throw Invalid($"Table {table} has more than one public view named '{name}'.");
        var response = (RetrieveUnpublishedResponse)await client.ExecuteAsync(new RetrieveUnpublishedRequest
        {
            Target = new EntityReference("savedquery", rows[0].Id),
            ColumnSet = new ColumnSet("name", "description", "fetchxml", "layoutxml", "isdefault", "iscustomizable", "querytype"),
        }, ct);
        return response.Entity;
    }

    internal static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
