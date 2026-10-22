using System.Xml;
using System.Xml.Linq;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Metadata;

public static class DefaultViewColumns
{
    public static async Task<IReadOnlySet<string>> RetrieveAsync(IOrganizationServiceAsync2 svc, string logicalName)
    {
        var query = new QueryExpression("savedquery")
        {
            ColumnSet = new ColumnSet("layoutxml"),
            TopCount = 1
        };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, logicalName);
        query.Criteria.AddCondition("querytype", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("isdefault", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

        var result = await svc.RetrieveMultipleAsync(query);
        var layoutXml = result.Entities.FirstOrDefault()?.GetAttributeValue<string>("layoutxml");

        return ParseLayoutXml(layoutXml);
    }

    public static IReadOnlySet<string> ParseLayoutXml(string? layoutXml) =>
        ParseLayoutCells(layoutXml).ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Columns of the view's own table, in grid order. Cells from linked tables
    /// ("alias.attribute") are left out.
    /// </summary>
    public static IReadOnlyList<string> ParseRootColumns(string? layoutXml) =>
        ParseLayoutCells(layoutXml)
            .Where(name => !name.Contains('.'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static IReadOnlyList<string> ParseLayoutCells(string? layoutXml)
    {
        if (string.IsNullOrWhiteSpace(layoutXml))
            return [];

        try
        {
            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null
            };
            using var reader = XmlReader.Create(new StringReader(layoutXml), settings);
            var doc = XDocument.Load(reader);

            return doc
                .Descendants("cell")
                .Select(cell => cell.Attribute("name")?.Value)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name!)
                .ToList();
        }
        catch (XmlException)
        {
            return [];
        }
    }
}
