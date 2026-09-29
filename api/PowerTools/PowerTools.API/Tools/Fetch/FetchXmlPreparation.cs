using System.Xml;
using System.Xml.Linq;
using PowerTools.API.Tools.Fetch.Dtos;

namespace PowerTools.API.Tools.Fetch;

public readonly record struct FetchXmlPreparationResult(string FetchXml, string ValueMode, string? Error)
{
    public bool IsValid => Error is null;
}

public static class FetchXmlPreparation
{
    public const int MaxPageSize = 250;

    public static FetchXmlPreparationResult Prepare(ExecuteFetchRequest request)
    {
        if (!FetchValueModes.TryNormalize(request.ValueMode, out var valueMode))
        {
            return Invalid("valueMode must be builder, formatted, or raw.");
        }

        if (request.FetchXml is null)
        {
            return Invalid("Invalid FetchXML: Root element is missing.");
        }

        XDocument doc;
        try
        {
            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null
            };
            using var reader = XmlReader.Create(new StringReader(request.FetchXml), settings);
            doc = XDocument.Load(reader);
        }
        catch (XmlException ex)
        {
            return Invalid($"Invalid FetchXML: {ex.Message}");
        }

        var fetchEl = doc.Root;
        if (fetchEl?.Name.LocalName != "fetch")
            return Invalid("Root element must be <fetch>");

        if (fetchEl.Element("entity") is null)
            return Invalid("<fetch> must contain an <entity> element");

        if (request.PreserveFetchXml)
            return new FetchXmlPreparationResult(request.FetchXml, valueMode, null);

        var pageSize = Math.Clamp(request.PageSize, 1, MaxPageSize);
        var finalXml = FetchXmlPaging.Apply(
            doc,
            request.Page,
            pageSize,
            request.PagingCookie,
            request.ReturnTotalRecordCount);
        return new FetchXmlPreparationResult(finalXml, valueMode, null);
    }

    private static FetchXmlPreparationResult Invalid(string error) =>
        new(string.Empty, FetchValueModes.Builder, error);
}
