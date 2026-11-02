using System.Xml.Linq;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>The entity-level filters and link-entity joins taken from a user's filter.</summary>
public sealed record DataMigrationFilter(IReadOnlyList<XElement> Filters, IReadOnlyList<XElement> LinkEntities)
{
    public bool HasLinks => LinkEntities.Count > 0;

    /// <summary>The entity-level filters as one element, or null when there are none.</summary>
    public XElement? CombinedFilter() => Filters.Count switch
    {
        0 => null,
        1 => new XElement(Filters[0]),
        _ => new XElement("filter", new XAttribute("type", "and"), Filters.Select(f => new XElement(f))),
    };
}

public static class DataMigrationFetchXml
{
    public static string Build(
        string entityLogicalName,
        IReadOnlyCollection<string> attributes,
        string? filterFragment,
        int? page = null,
        int? count = null,
        string? pagingCookie = null)
    {
        var filter = ParseFilter(filterFragment, entityLogicalName);

        var fetch = new XElement("fetch");
        if (page is not null) fetch.SetAttributeValue("page", page.Value);
        if (count is not null) fetch.SetAttributeValue("count", count.Value);
        if (pagingCookie is not null) fetch.SetAttributeValue("paging-cookie", pagingCookie);
        // A join can return a record once per related row, so ask for each record once.
        if (filter?.HasLinks == true) fetch.SetAttributeValue("distinct", "true");

        var entity = new XElement("entity", new XAttribute("name", entityLogicalName));
        foreach (var attribute in attributes)
        {
            entity.Add(new XElement("attribute", new XAttribute("name", attribute)));
        }

        AddFilter(entity, filter);

        fetch.Add(entity);
        return fetch.ToString(SaveOptions.DisableFormatting);
    }

    public const string CountAlias = "recordcount";

    /// <summary>Aggregate FetchXML that counts the records matching the filter.</summary>
    public static string BuildCount(string entityLogicalName, string primaryIdAttribute, string? filterFragment)
    {
        var filter = ParseFilter(filterFragment, entityLogicalName);
        var countAttribute = new XElement("attribute",
            new XAttribute("name", primaryIdAttribute),
            new XAttribute("alias", CountAlias));
        if (filter?.HasLinks == true)
        {
            // Count each record once even when the join matches several related rows.
            countAttribute.SetAttributeValue("aggregate", "countcolumn");
            countAttribute.SetAttributeValue("distinct", "true");
        }
        else
        {
            countAttribute.SetAttributeValue("aggregate", "count");
        }

        var entity = new XElement("entity", new XAttribute("name", entityLogicalName), countAttribute);
        AddFilter(entity, filter);

        return new XElement("fetch", new XAttribute("aggregate", "true"), entity)
            .ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>
    /// FetchXML that returns which of the given ids exist, and also match the filter when one is given.
    /// </summary>
    public static string BuildIdLookup(
        string entityLogicalName,
        string primaryIdAttribute,
        IEnumerable<Guid> ids,
        string? filterFragment = null)
    {
        var condition = new XElement("condition",
            new XAttribute("attribute", primaryIdAttribute),
            new XAttribute("operator", "in"));
        foreach (var id in ids)
        {
            condition.Add(new XElement("value", id.ToString()));
        }

        var parsed = ParseFilter(filterFragment, entityLogicalName);
        var filter = new XElement("filter", condition);
        var userFilter = parsed?.CombinedFilter();
        if (userFilter is not null)
        {
            filter.SetAttributeValue("type", "and");
            filter.Add(userFilter);
        }

        var entity = new XElement("entity",
            new XAttribute("name", entityLogicalName),
            new XElement("attribute", new XAttribute("name", primaryIdAttribute)),
            filter);
        foreach (var link in parsed?.LinkEntities ?? [])
        {
            entity.Add(new XElement(link));
        }

        var fetch = new XElement("fetch", entity);
        if (parsed?.HasLinks == true) fetch.SetAttributeValue("distinct", "true");
        return fetch.ToString(SaveOptions.DisableFormatting);
    }

    private static void AddFilter(XElement entity, DataMigrationFilter? filter)
    {
        if (filter is null) return;

        var combined = filter.CombinedFilter();
        if (combined is not null) entity.Add(combined);
        foreach (var link in filter.LinkEntities)
        {
            entity.Add(new XElement(link));
        }
    }

    /// <summary>
    /// Reads a filter given as &lt;filter&gt; and &lt;link-entity&gt; elements, or as full FetchXML for the entity.
    /// Columns and sort orders inside link-entities are dropped, since the migration chooses its own columns.
    /// </summary>
    public static DataMigrationFilter? ParseFilter(string? filterFragment, string entityLogicalName)
    {
        if (string.IsNullOrWhiteSpace(filterFragment))
        {
            return null;
        }

        var root = XElement.Parse($"<root>{filterFragment.Trim()}</root>");
        var children = root.Elements().ToList();

        if (children.Count == 1 && children[0].Name.LocalName == "fetch")
        {
            var entity = children[0]
                .Elements()
                .FirstOrDefault(e =>
                    e.Name.LocalName == "entity" &&
                    string.Equals((string?)e.Attribute("name"), entityLogicalName, StringComparison.OrdinalIgnoreCase));

            var fromFetch = entity is null ? null : FromElements(entity.Elements());
            if (fromFetch is null)
            {
                throw new ArgumentException(
                    $"The FetchXML filter must include a <filter> or <link-entity> for the '{entityLogicalName}' entity.");
            }

            return fromFetch;
        }

        if (children.Count > 0 && children.All(e => e.Name.LocalName is "filter" or "link-entity"))
        {
            return FromElements(children);
        }

        throw new ArgumentException(
            "Enter <filter> or <link-entity> elements, or paste full FetchXML that contains the matching entity.");
    }

    private static DataMigrationFilter? FromElements(IEnumerable<XElement> elements)
    {
        var list = elements.ToList();
        var filters = list.Where(e => e.Name.LocalName == "filter").Select(e => new XElement(e)).ToList();
        var links = list.Where(e => e.Name.LocalName == "link-entity").Select(CleanLink).ToList();
        return filters.Count == 0 && links.Count == 0 ? null : new DataMigrationFilter(filters, links);
    }

    private static XElement CleanLink(XElement link)
    {
        var copy = new XElement(link);
        copy.Descendants()
            .Where(e => e.Name.LocalName is "attribute" or "all-attributes" or "order")
            .ToList()
            .ForEach(e => e.Remove());
        return copy;
    }
}
