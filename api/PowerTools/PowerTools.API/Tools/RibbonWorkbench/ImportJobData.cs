using System.Net;
using System.Xml;
using System.Xml.Linq;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>Failures and warnings read from <c>importjob.data</c>.</summary>
public sealed record ImportJobResults(IReadOnlyList<string> Failures, IReadOnlyList<string> Warnings);

/// <summary>
/// Reads the import log XML. Every <c>result</c> element carries <c>result="success|warning|failure"</c> with
/// <c>errorcode</c> and <c>errortext</c>; the parent element names the component.
/// </summary>
public static class ImportJobData
{
    private static readonly string[] NameAttributes = ["LocalizedName", "OriginalName", "name", "Name", "id"];

    public static ImportJobResults Parse(string? data)
    {
        if (string.IsNullOrWhiteSpace(data)) return new ImportJobResults([], []);

        XDocument document;
        try
        {
            document = XDocument.Parse(data);
        }
        catch (XmlException)
        {
            return new ImportJobResults([], []);
        }

        var failures = new List<string>();
        var warnings = new List<string>();
        foreach (var result in document.Descendants().Where(element => element.Name.LocalName == "result"))
        {
            var outcome = ((string?)result.Attribute("result"))?.Trim().ToLowerInvariant();
            if (outcome is not ("failure" or "warning")) continue;

            var text = WebUtility.HtmlDecode((string?)result.Attribute("errortext") ?? "").Trim();
            var code = ((string?)result.Attribute("errorcode"))?.Trim();
            var component = ComponentName(result.Parent);
            var message = text.Length > 0 ? text : outcome == "failure" ? "The component could not be imported." : "Imported with a warning.";
            if (!string.IsNullOrEmpty(code) && code != "0") message = $"{message} ({code})";
            if (component is not null) message = $"{component}: {message}";

            var list = outcome == "failure" ? failures : warnings;
            if (!list.Contains(message, StringComparer.Ordinal)) list.Add(message);
        }

        return new ImportJobResults(failures, warnings);
    }

    private static string? ComponentName(XElement? element)
    {
        if (element is null || element.Parent is null) return null;
        foreach (var name in NameAttributes)
        {
            var value = (string?)element.Attribute(name);
            if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        }

        return null;
    }
}
