using System.Security;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Agent;

/// <summary>Adds a column to a view's layout and fetch XML as text, leaving everything else as it was.</summary>
public static class AgentViewXml
{
    public const int DefaultWidth = 150;

    public static AgentResult<(string LayoutXml, string FetchXml)> AddColumn(string layoutXml, string fetchXml, string column, int width)
    {
        var layout = AgentXmlSplice.Parse(layoutXml);
        var inLayout = layout.Descendants("cell").Any(cell =>
            string.Equals((string?)cell.Attribute("name"), column, StringComparison.OrdinalIgnoreCase));
        if (inLayout)
            return AgentResult<(string, string)>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is already in this view."));

        var row = layout.Descendants("row").FirstOrDefault();
        if (row is null)
            return AgentResult<(string, string)>.Fail(AgentFaults.InvalidRequest("This view's layout has no row to add the column to."));

        var cell = $"<cell name=\"{SecurityElement.Escape(column)}\" width=\"{width}\"/>";
        var newLayout = AgentXmlSplice.AppendChild(layoutXml, row, cell);

        var fetch = AgentXmlSplice.Parse(fetchXml);
        var entity = fetch.Root?.Element("entity");
        if (entity is null)
            return AgentResult<(string, string)>.Fail(AgentFaults.InvalidRequest("This view's query has no entity element."));

        var alreadyFetched = entity.Elements("attribute").Any(a =>
            string.Equals((string?)a.Attribute("name"), column, StringComparison.OrdinalIgnoreCase));
        if (alreadyFetched) return AgentResult<(string, string)>.Ok((newLayout, fetchXml));

        var attribute = $"<attribute name=\"{SecurityElement.Escape(column)}\"/>";
        var last = entity.Elements("attribute").LastOrDefault();
        var newFetch = last is not null
            ? fetchXml.Insert(AgentXmlSplice.EndOf(fetchXml, last), attribute)
            : entity.IsEmpty
                ? AgentXmlSplice.AppendChild(fetchXml, entity, attribute)
                : fetchXml.Insert(AgentXmlSplice.AfterOpenTag(fetchXml, entity), attribute);
        return AgentResult<(string, string)>.Ok((newLayout, newFetch));
    }

    /// <summary>
    /// Takes the column's cell out of the grid and its attribute out of the query's main entity. The attribute
    /// stays when it is the row's id or the grid's jump column, which the view needs whether shown or not. A
    /// view's last column is not removed.
    /// </summary>
    public static AgentResult<ViewColumnRemoval> RemoveColumn(string layoutXml, string fetchXml, string column)
    {
        var layout = AgentXmlSplice.Parse(layoutXml);
        var cells = layout.Descendants("cell").ToList();
        var cell = cells.FirstOrDefault(c => string.Equals((string?)c.Attribute("name"), column, StringComparison.OrdinalIgnoreCase));
        if (cell is null)
            return AgentResult<ViewColumnRemoval>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is not in this view."));
        if (cells.Count == 1)
            return AgentResult<ViewColumnRemoval>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is the view's only column; a view needs at least one."));

        var newLayout = AgentXmlSplice.Remove(layoutXml, cell);

        var needed = new[] { (string?)cell.Parent?.Attribute("id"), (string?)layout.Root?.Attribute("jump") };
        if (needed.Any(n => string.Equals(n, column, StringComparison.OrdinalIgnoreCase)))
            return AgentResult<ViewColumnRemoval>.Ok(new ViewColumnRemoval(newLayout, fetchXml, false));

        var fetch = AgentXmlSplice.Parse(fetchXml);
        var attribute = fetch.Root?.Element("entity")?.Elements("attribute")
            .FirstOrDefault(a => string.Equals((string?)a.Attribute("name"), column, StringComparison.OrdinalIgnoreCase));
        return attribute is null
            ? AgentResult<ViewColumnRemoval>.Ok(new ViewColumnRemoval(newLayout, fetchXml, false))
            : AgentResult<ViewColumnRemoval>.Ok(new ViewColumnRemoval(newLayout, AgentXmlSplice.Remove(fetchXml, attribute), true));
    }
}

public sealed record ViewColumnRemoval(string LayoutXml, string FetchXml, bool RemovedFromQuery);
