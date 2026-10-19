using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>Reads the published ribbon returned by RetrieveEntityRibbon or RetrieveApplicationRibbon.</summary>
public static class RibbonDefinition
{
    public const string RibbonEntry = "RibbonXml.xml";

    /// <summary>Unzips the compressed ribbon and returns RibbonXml.xml.</summary>
    public static XDocument Unzip(byte[] compressed)
    {
        try
        {
            using var archive = new ZipArchive(new MemoryStream(compressed, writable: false), ZipArchiveMode.Read);
            var entry = archive.Entries.FirstOrDefault(item =>
                string.Equals(item.FullName, RibbonEntry, StringComparison.OrdinalIgnoreCase))
                ?? throw new RibbonPackageException("Could not find RibbonXml.xml in the ribbon returned by Dataverse.");
            using var stream = entry.Open();
            return XDocument.Load(stream);
        }
        catch (InvalidDataException ex)
        {
            throw new RibbonPackageException($"The ribbon returned by Dataverse is not a valid zip file. {ex.Message}");
        }
        catch (XmlException ex)
        {
            throw new RibbonPackageException($"RibbonXml.xml returned by Dataverse is not valid XML. {ex.Message}");
        }
    }

    public static BaseRibbonDto Parse(XDocument document, string? entity)
    {
        var root = document.Root ?? throw new RibbonPackageException("RibbonXml.xml returned by Dataverse is empty.");
        var definition = root.Name.LocalName == "RibbonDefinition"
            ? root
            : root.Descendants().FirstOrDefault(element => element.Name.LocalName == "RibbonDefinition") ?? root;

        var ribbon = Child(Child(definition, "UI"), "Ribbon");
        var tabs = ribbon is null
            ? []
            : ribbon.Descendants().Where(element => element.Name.LocalName == "Tab").Select(RibbonXml.ToNode).ToList();

        var commands = Child(definition, "CommandDefinitions")?.Elements()
            .Where(element => element.Name.LocalName == "CommandDefinition")
            .Select(RibbonXml.ToNode)
            .ToList() ?? [];

        var rules = Child(definition, "RuleDefinitions");
        var enableRules = Child(rules, "EnableRules")?.Elements()
            .Where(element => element.Name.LocalName == "EnableRule")
            .Select(RibbonXml.ToNode)
            .ToList() ?? [];
        var displayRules = Child(rules, "DisplayRules")?.Elements()
            .Where(element => element.Name.LocalName == "DisplayRule")
            .Select(RibbonXml.ToNode)
            .ToList() ?? [];

        var templates = Child(definition, "Templates")?.Descendants()
            .Where(element => element.Name.LocalName == "GroupTemplate")
            .Select(template => new RibbonTemplateDto(
                (string?)template.Attribute("Id") ?? "",
                template.Elements()
                    .Where(layout => layout.Name.LocalName == "Layout")
                    .Select(layout => (string?)layout.Attribute("Title") ?? "")
                    .Where(title => title.Length > 0)
                    .Distinct(StringComparer.Ordinal)
                    .ToList()))
            .Where(template => template.Id.Length > 0)
            .ToList() ?? [];

        return new BaseRibbonDto
        {
            Entity = entity,
            Tabs = tabs,
            Commands = commands,
            EnableRules = enableRules,
            DisplayRules = displayRules,
            Templates = templates,
        };
    }

    private static XElement? Child(XElement? parent, string name) =>
        parent?.Elements().FirstOrDefault(element => element.Name.LocalName == name);
}
