using System.Xml;
using System.Xml.Linq;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Metadata;

public static class DefaultViewColumns
{
    public static async Task<IReadOnlySet<string>> RetrieveAsync(ServiceClient svc, string logicalName)
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

    public static IReadOnlySet<string> ParseLayoutXml(string? layoutXml)
    {
        if (string.IsNullOrWhiteSpace(layoutXml))
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

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
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
        catch (XmlException)
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
