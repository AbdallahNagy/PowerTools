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
}
