using System.Xml;
using System.Xml.Linq;
using PowerTools.API.Tools.Fetch;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

/// <summary>
/// A FetchXML query reduced to the primary id of its root entity, ready to page.
/// </summary>
public sealed class IdQuery
{
    public required string Entity { get; init; }
    public required string PrimaryIdAttribute { get; init; }
    /// <summary>The id-only query without any paging attributes.</summary>
    public required string FetchXml { get; init; }
    /// <summary>Set when the user's query had <c>top</c>; the query is then sent once, unpaged.</summary>
    public int? Top { get; init; }
}

public sealed record FetchXmlCheck(string? Entity, BulkWorkflowProblem? Problem);

/// <summary>
/// Pure FetchXML validation and the id-only rewrite used by the count and the run snapshot.
/// </summary>
public static class BulkWorkflowFetchXml
{
    public const int MaxTop = 5000;

    private static readonly string[] PagingAttributes =
        ["page", "count", "paging-cookie", "returntotalrecordcount"];

    /// <summary>
    /// Parses the FetchXML and checks everything that does not need the server.
    /// Returns the root entity logical name.
    /// </summary>
    public static FetchXmlCheck Check(string? fetchXml, string workflowEntity)
    {
        var parsed = Parse(fetchXml);
        if (parsed.Problem is not null) return new FetchXmlCheck(null, parsed.Problem);
        var entity = parsed.Entity!;
        var entityName = entity.Attribute("name")?.Value.Trim() ?? "";
        if (entityName.Length == 0)
            return new FetchXmlCheck(null, BulkWorkflowFaults.InvalidFetchXml("The <entity> element needs a name."));

        if (!string.Equals(entityName, workflowEntity, StringComparison.OrdinalIgnoreCase))
        {
            return new FetchXmlCheck(null, BulkWorkflowFaults.Local(
                "EntityMismatch",
                $"The query returns {entityName} records, but the workflow runs on {workflowEntity}."));
        }

        return new FetchXmlCheck(entityName.ToLowerInvariant(), null);
    }

    /// <summary>
    /// Rewrites a checked query to select only the primary id: every attribute and order is removed,
    /// one order on the primary id is added, <c>distinct</c> is set when link-entities are present,
    /// and paging attributes are stripped.
    /// </summary>
    public static IdQuery ToIdQuery(string fetchXml, string entityName, string primaryIdAttribute)
    {
        var parsed = Parse(fetchXml);
        if (parsed.Problem is not null)
            throw new InvalidOperationException(parsed.Problem.Message);

        var fetch = parsed.Document!.Root!;
        var entity = parsed.Entity!;

        foreach (var name in PagingAttributes)
            fetch.Attribute(name)?.Remove();

        int? top = null;
        var topAttribute = fetch.Attribute("top");
        if (topAttribute is not null && int.TryParse(topAttribute.Value, out var topValue))
            top = topValue;

        foreach (var element in entity.Descendants()
                     .Where(e => e.Name.LocalName is "attribute" or "all-attributes" or "order")
                     .ToList())
        {
            element.Remove();
        }

        var hasLinks = entity.Descendants().Any(e => e.Name.LocalName == "link-entity");
        if (hasLinks)
            fetch.SetAttributeValue("distinct", "true");

        entity.AddFirst(
            new XElement("attribute", new XAttribute("name", primaryIdAttribute)),
            new XElement("order", new XAttribute("attribute", primaryIdAttribute)));

        return new IdQuery
        {
            Entity = entityName,
            PrimaryIdAttribute = primaryIdAttribute,
            FetchXml = fetch.ToString(SaveOptions.DisableFormatting),
            Top = top,
        };
    }

    /// <summary>The FetchXML for one page. A query with <c>top</c> is never paged.</summary>
    public static string ForPage(IdQuery query, int page, int count, string? pagingCookie) =>
        query.Top is not null
            ? query.FetchXml
            : FetchXmlPaging.Apply(query.FetchXml, page, count, pagingCookie);

    private sealed record Parsed(XDocument? Document, XElement? Entity, BulkWorkflowProblem? Problem);

    private static Parsed Parse(string? fetchXml)
    {
        if (string.IsNullOrWhiteSpace(fetchXml))
            return new Parsed(null, null, BulkWorkflowFaults.InvalidFetchXml("Enter a FetchXML query."));

        XDocument doc;
        try
        {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
            using var reader = XmlReader.Create(new StringReader(fetchXml), settings);
            doc = XDocument.Load(reader);
        }
        catch (XmlException ex)
        {
            return new Parsed(null, null, BulkWorkflowFaults.InvalidFetchXml($"The FetchXML is not well formed: {ex.Message}"));
        }

        var fetch = doc.Root;
        if (fetch is null || fetch.Name.LocalName != "fetch")
            return new Parsed(null, null, BulkWorkflowFaults.InvalidFetchXml("The root element must be <fetch>."));

        if (IsTrue(fetch.Attribute("aggregate")?.Value)
            || fetch.Descendants().Any(e =>
                e.Name.LocalName == "attribute"
                && (e.Attribute("aggregate") is not null
                    || IsTrue(e.Attribute("groupby")?.Value)
                    || e.Attribute("dategrouping") is not null)))
        {
            return new Parsed(null, null, BulkWorkflowFaults.Local(
                "AggregateNotSupported",
                "Aggregate queries return no record IDs. Remove aggregate and groupby."));
        }

        var entities = fetch.Elements().Where(e => e.Name.LocalName == "entity").ToList();
        if (entities.Count != 1)
            return new Parsed(null, null, BulkWorkflowFaults.InvalidFetchXml("The query needs exactly one <entity> element."));

        var topText = fetch.Attribute("top")?.Value;
        if (topText is not null)
        {
            if (!int.TryParse(topText, out var top) || top < 1)
                return new Parsed(null, null, BulkWorkflowFaults.InvalidFetchXml("The top attribute must be a positive number."));
            if (top > MaxTop)
            {
                return new Parsed(null, null, BulkWorkflowFaults.Local(
                    "TopTooLarge",
                    $"The top attribute cannot be more than {MaxTop:N0}. Remove top to run on every matching record."));
            }
        }

        return new Parsed(doc, entities[0], null);
    }

    private static bool IsTrue(string? value) =>
        value is not null && (value == "1" || value.Equals("true", StringComparison.OrdinalIgnoreCase));
}
