using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>Converts ribbon XML to and from <see cref="RibbonNodeDto"/> without losing elements or attributes.</summary>
public static class RibbonXml
{
    public const string CommentName = "#comment";

    public static RibbonNodeDto ToNode(XElement element)
    {
        var node = new RibbonNodeDto { Name = element.Name.LocalName };
        foreach (var attribute in element.Attributes())
        {
            if (attribute.IsNamespaceDeclaration) continue;
            node.Attributes[attribute.Name.LocalName] = attribute.Value;
        }

        foreach (var child in element.Nodes())
        {
            switch (child)
            {
                case XElement childElement:
                    node.Children.Add(ToNode(childElement));
                    break;
                case XComment comment:
                    node.Children.Add(new RibbonNodeDto { Name = CommentName, Text = comment.Value });
                    break;
                case XText text when !string.IsNullOrWhiteSpace(text.Value):
                    node.Text = (node.Text ?? "") + text.Value;
                    break;
            }
        }

        return node;
    }

    public static XElement ToElement(RibbonNodeDto node)
    {
        if (string.IsNullOrWhiteSpace(node.Name) || node.Name == CommentName)
            throw new ArgumentException("A ribbon element needs a name.", nameof(node));

        var element = new XElement(XName.Get(node.Name));
        foreach (var (name, value) in node.Attributes)
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            element.SetAttributeValue(XName.Get(name), value ?? "");
        }

        if (!string.IsNullOrEmpty(node.Text)) element.Add(new XText(node.Text));
        foreach (var child in node.Children)
        {
            if (child.Name == CommentName)
                element.Add(new XComment(child.Text ?? ""));
            else
                element.Add(ToElement(child));
        }

        return element;
    }

    /// <summary>
    /// A stable text form for comparing diffs: comments and whitespace are left out and attributes are sorted,
    /// so a re-export of an unchanged diff gives the same value.
    /// </summary>
    public static string Canonical(RibbonNodeDto node)
    {
        var builder = new StringBuilder();
        Write(node, builder);
        return builder.ToString();
    }

    public static string Hash(RibbonNodeDto node) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(node))));

    public static IEnumerable<RibbonNodeDto> Elements(this RibbonNodeDto node, string name) =>
        node.Children.Where(child => child.Name == name);

    public static RibbonNodeDto? Element(this RibbonNodeDto node, string name) =>
        node.Children.FirstOrDefault(child => child.Name == name);

    public static IEnumerable<RibbonNodeDto> Descendants(this RibbonNodeDto node)
    {
        foreach (var child in node.Children)
        {
            if (child.Name == CommentName) continue;
            yield return child;
            foreach (var descendant in child.Descendants()) yield return descendant;
        }
    }

    public static string? Attr(this RibbonNodeDto node, string name) =>
        node.Attributes.TryGetValue(name, out var value) ? value : null;

    private static void Write(RibbonNodeDto node, StringBuilder builder)
    {
        if (node.Name == CommentName) return;
        builder.Append('<').Append(node.Name);
        foreach (var (name, value) in node.Attributes.OrderBy(pair => pair.Key, StringComparer.Ordinal))
            builder.Append(' ').Append(name).Append("=\"").Append(value).Append('"');
        builder.Append('>');
        if (!string.IsNullOrWhiteSpace(node.Text)) builder.Append(node.Text.Trim());
        foreach (var child in node.Children) Write(child, builder);
        builder.Append("</").Append(node.Name).Append('>');
    }
}
