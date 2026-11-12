using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// Inserts text into an XML document without re-serializing it. Form and view XML is customer content, so
/// everything outside the inserted text must stay byte-for-byte as it was; a LINQ to XML round trip would
/// change quoting, whitespace and empty-element style.
/// </summary>
internal static class AgentXmlSplice
{
    public static XDocument Parse(string xml)
    {
        try
        {
            return XDocument.Parse(xml, LoadOptions.SetLineInfo | LoadOptions.PreserveWhitespace);
        }
        catch (XmlException ex)
        {
            throw new AgentProblemException(AgentFaults.InvalidRequest($"The stored XML could not be read: {ex.Message}"));
        }
    }

    /// <summary>The index of the '<c>&lt;</c>' that opens <paramref name="element"/> in <paramref name="xml"/>.</summary>
    public static int StartOf(string xml, XElement element)
    {
        var info = (IXmlLineInfo)element;
        var line = 1;
        var index = 0;
        while (line < info.LineNumber && index < xml.Length)
        {
            var c = xml[index++];
            if (c == '\n') line++;
            else if (c == '\r')
            {
                if (index < xml.Length && xml[index] == '\n') index++;
                line++;
            }
        }

        // LinePosition points at the first character of the name, one past the '<'.
        var start = index + info.LinePosition - 2;
        if (start >= 0 && start < xml.Length && xml[start] == '<') return start;
        throw new AgentProblemException(AgentFaults.InvalidRequest("The stored XML could not be edited safely."));
    }

    /// <summary>Appends <paramref name="content"/> as the last child of the element, expanding an empty one.</summary>
    public static string AppendChild(string xml, XElement element, string content)
    {
        var start = StartOf(xml, element);
        var name = element.Name.LocalName;
        var tags = new Regex($@"<{Regex.Escape(name)}(?=[\s/>])[^>]*?(?<self>/?)>|</{Regex.Escape(name)}\s*>");
        var depth = 0;
        foreach (Match match in tags.Matches(xml, start))
        {
            if (match.Value.StartsWith("</", StringComparison.Ordinal))
            {
                if (--depth == 0) return xml.Insert(match.Index, content);
                continue;
            }

            if (match.Groups["self"].Value == "/")
            {
                if (depth == 0)
                {
                    // <name attr="x" />  becomes  <name attr="x">content</name>
                    var open = match.Value[..^2].TrimEnd();
                    return xml[..match.Index] + open + ">" + content + $"</{name}>" + xml[(match.Index + match.Length)..];
                }

                continue;
            }

            depth++;
        }

        throw new AgentProblemException(AgentFaults.InvalidRequest($"The stored XML has an unclosed <{name}> element."));
    }

    /// <summary>The index just after the element's last character, whether it is self-closing or has content.</summary>
    public static int EndOf(string xml, XElement element)
    {
        var start = StartOf(xml, element);
        var name = element.Name.LocalName;
        var tags = new Regex($@"<{Regex.Escape(name)}(?=[\s/>])[^>]*?(?<self>/?)>|</{Regex.Escape(name)}\s*>");
        var depth = 0;
        foreach (Match match in tags.Matches(xml, start))
        {
            if (match.Value.StartsWith("</", StringComparison.Ordinal))
            {
                if (--depth == 0) return match.Index + match.Length;
                continue;
            }

            if (match.Groups["self"].Value == "/")
            {
                if (depth == 0) return match.Index + match.Length;
                continue;
            }

            depth++;
        }

        throw new AgentProblemException(AgentFaults.InvalidRequest($"The stored XML has an unclosed <{name}> element."));
    }

    /// <summary>The index just after the opening tag of a non-empty element.</summary>
    public static int AfterOpenTag(string xml, XElement element)
    {
        var start = StartOf(xml, element);
        var close = xml.IndexOf('>', start);
        if (close < 0) throw new AgentProblemException(AgentFaults.InvalidRequest("The stored XML could not be edited safely."));
        return close + 1;
    }
}
