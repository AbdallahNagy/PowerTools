using System.Xml.Linq;

namespace PowerTools.API.Tools.DataMigration;

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
        var fetch = new XElement("fetch");
        if (page is not null) fetch.SetAttributeValue("page", page.Value);
        if (count is not null) fetch.SetAttributeValue("count", count.Value);
        if (pagingCookie is not null) fetch.SetAttributeValue("paging-cookie", pagingCookie);

        var entity = new XElement("entity", new XAttribute("name", entityLogicalName));
        foreach (var attribute in attributes)
        {
            entity.Add(new XElement("attribute", new XAttribute("name", attribute)));
        }

        var normalizedFilter = NormalizeFilterFragment(filterFragment, entityLogicalName);
        if (normalizedFilter is not null)
        {
            entity.Add(XElement.Parse(normalizedFilter));
        }

        fetch.Add(entity);
        return fetch.ToString(SaveOptions.DisableFormatting);
    }

    public static string? NormalizeFilterFragment(string? filterFragment, string entityLogicalName)
    {
        if (string.IsNullOrWhiteSpace(filterFragment))
        {
            return null;
        }

        var xml = filterFragment.Trim();
        var root = XElement.Parse($"<root>{xml}</root>");
        var children = root.Elements().ToList();

        if (children.Count == 1 && children[0].Name.LocalName == "fetch")
        {
            var entity = children[0]
                .Elements()
                .FirstOrDefault(e =>
                    e.Name.LocalName == "entity" &&
                    string.Equals((string?)e.Attribute("name"), entityLogicalName, StringComparison.OrdinalIgnoreCase));

            var filter = entity?.Elements().FirstOrDefault(e => e.Name.LocalName == "filter");
            if (filter is null)
            {
                throw new ArgumentException(
                    $"The FetchXML filter must include a <filter> for the '{entityLogicalName}' entity.");
            }

            return filter.ToString(SaveOptions.DisableFormatting);
        }

        if (children.Count == 1 && children[0].Name.LocalName == "filter")
        {
            return children[0].ToString(SaveOptions.DisableFormatting);
        }

        throw new ArgumentException("Enter a <filter> element, or paste full FetchXML that contains one matching entity filter.");
    }
}
