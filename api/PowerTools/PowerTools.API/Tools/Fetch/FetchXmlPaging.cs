using System.Xml;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Fetch;

public static class FetchXmlPaging
{
    public static string Apply(string fetchXml, int page, int count, string? pagingCookie)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null
        };

        using var reader = XmlReader.Create(new StringReader(fetchXml), settings);
        var doc = XDocument.Load(reader);

        return Apply(doc, page, count, pagingCookie);
    }

    public static string Apply(XDocument doc, int page, int count, string? pagingCookie)
    {
        var fetchEl = doc.Root ?? throw new ArgumentException("FetchXML must have a root element.", nameof(doc));

        fetchEl.SetAttributeValue("page", page);
        fetchEl.SetAttributeValue("count", count);

        if (pagingCookie is not null)
            fetchEl.SetAttributeValue("paging-cookie", pagingCookie);
        else
            fetchEl.Attribute("paging-cookie")?.Remove();

        return fetchEl.ToString(SaveOptions.DisableFormatting);
    }
}
