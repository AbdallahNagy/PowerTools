using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>A table found in an exported solution's customizations.xml.</summary>
public sealed record ExportedEntity(string LogicalName, bool RibbonNotSupported, XElement? Diff);

/// <summary>Reads the ribbon parts of an unmanaged solution export and writes edited diffs back into it.</summary>
public sealed class RibbonSolutionPackage
{
    public const string CustomizationsEntry = "customizations.xml";
    public const string ManifestEntry = "solution.xml";

    public const int EntityComponentType = 1;
    public const int RibbonCustomizationComponentType = 50;

    private RibbonSolutionPackage(
        IReadOnlyList<ExportedEntity> entities,
        XElement? applicationDiff,
        IReadOnlyList<int> rootComponentTypes)
    {
        Entities = entities;
        ApplicationDiff = applicationDiff;
        RootComponentTypes = rootComponentTypes;
    }

    public IReadOnlyList<ExportedEntity> Entities { get; }
    /// <summary>The root RibbonDiffXml, or null when the export has none.</summary>
    public XElement? ApplicationDiff { get; }
    /// <summary>The type of every root component in solution.xml.</summary>
    public IReadOnlyList<int> RootComponentTypes { get; }

    public bool IncludesApplicationRibbon => RootComponentTypes.Contains(RibbonCustomizationComponentType);

    public static RibbonSolutionPackage Read(byte[] zip)
    {
        using var archive = OpenArchive(zip, ZipArchiveMode.Read);
        var customizations = LoadXml(archive, CustomizationsEntry)
            ?? throw new RibbonPackageException("Could not find customizations.xml in the exported solution.");
        var manifest = LoadXml(archive, ManifestEntry);

        var root = customizations.Root
            ?? throw new RibbonPackageException("customizations.xml in the exported solution is empty.");
        var entities = root.Element("Entities")?.Elements("Entity")
            .Select(ReadEntity)
            .Where(entity => entity.LogicalName.Length > 0)
            .ToList() ?? [];

        var rootTypes = manifest?.Root?
            .Element("SolutionManifest")?
            .Element("RootComponents")?
            .Elements("RootComponent")
            .Select(component => int.TryParse((string?)component.Attribute("type"), out var type) ? type : -1)
            .Where(type => type >= 0)
            .ToList() ?? [];

        return new RibbonSolutionPackage(entities, root.Element("RibbonDiffXml"), rootTypes);
    }

    /// <summary>
    /// Replaces the RibbonDiffXml of each key in a copy of the export. Table names match without regard to case.
    /// Every other entry and every other part of customizations.xml is copied unchanged.
    /// </summary>
    public static byte[] Splice(byte[] zip, IReadOnlyDictionary<string, XElement> diffs)
    {
        using var source = OpenArchive(zip, ZipArchiveMode.Read);
        var customizations = LoadXml(source, CustomizationsEntry)
            ?? throw new RibbonPackageException("Could not find customizations.xml in the exported solution.");
        var root = customizations.Root
            ?? throw new RibbonPackageException("customizations.xml in the exported solution is empty.");

        foreach (var (key, diff) in diffs)
        {
            if (RibbonKeys.IsApplication(key))
            {
                var current = root.Element("RibbonDiffXml")
                    ?? throw new RibbonPackageException(
                        "The solution has no application ribbon. Add Application Ribbons to the solution, then reload.");
                current.ReplaceWith(Rename(diff));
                continue;
            }

            var entity = root.Element("Entities")?.Elements("Entity")
                .FirstOrDefault(candidate => string.Equals(EntityName(candidate), key, StringComparison.OrdinalIgnoreCase))
                ?? throw new RibbonPackageException(
                    $"Cannot find table {key} in the solution. It may have been removed after the solution was loaded.");
            var existing = entity.Element("RibbonDiffXml")
                ?? throw new RibbonPackageException(
                    $"Table {key} has no command bar definition in the solution. Add the table with its metadata, then reload.");
            existing.ReplaceWith(Rename(diff));
        }

        using var output = new MemoryStream();
        using (var target = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in source.Entries)
            {
                var copy = target.CreateEntry(entry.FullName, CompressionLevel.Optimal);
                copy.LastWriteTime = entry.LastWriteTime;
                using var writer = copy.Open();
                if (string.Equals(entry.FullName, CustomizationsEntry, StringComparison.OrdinalIgnoreCase))
                {
                    WriteXml(customizations, writer);
                }
                else
                {
                    using var reader = entry.Open();
                    reader.CopyTo(writer);
                }
            }
        }

        return output.ToArray();
    }

    /// <summary>The logical name of an Entity node: EntityInfo/entity/@Name, else the Name element in lower case.</summary>
    public static string EntityName(XElement entity)
    {
        var info = (string?)entity.Element("EntityInfo")?.Element("entity")?.Attribute("Name");
        if (!string.IsNullOrWhiteSpace(info)) return info.Trim().ToLowerInvariant();
        var name = entity.Element("Name")?.Value;
        return string.IsNullOrWhiteSpace(name) ? "" : name.Trim().ToLowerInvariant();
    }

    public static string ComponentTypeName(int type) => type switch
    {
        1 => "Table",
        2 => "Column",
        9 => "Choice",
        10 => "Relationship",
        20 => "Security role",
        26 => "View",
        29 => "Process",
        31 => "Report",
        36 => "Email template",
        50 => "Application ribbon",
        59 => "Chart",
        60 => "Form",
        61 => "Web resource",
        62 => "Site map",
        63 => "Connection role",
        66 => "Custom control",
        70 => "Field security profile",
        80 => "Model-driven app",
        90 => "Plug-in type",
        91 => "Plug-in assembly",
        92 => "Plug-in step",
        93 => "Plug-in step image",
        95 => "Service endpoint",
        300 => "Canvas app",
        371 => "Connector",
        380 => "Environment variable definition",
        381 => "Environment variable value",
        _ => $"Component type {type}",
    };

    private static ExportedEntity ReadEntity(XElement entity)
    {
        var diff = entity.Element("RibbonDiffXml");
        var notSupported = diff?.Element("RibbonNotSupported") is not null;
        return new ExportedEntity(EntityName(entity), notSupported, diff);
    }

    private static XElement Rename(XElement diff) =>
        diff.Name.LocalName == "RibbonDiffXml" ? diff : new XElement("RibbonDiffXml", diff.Attributes(), diff.Nodes());

    private static ZipArchive OpenArchive(byte[] zip, ZipArchiveMode mode)
    {
        try
        {
            return new ZipArchive(new MemoryStream(zip, writable: false), mode);
        }
        catch (InvalidDataException ex)
        {
            throw new RibbonPackageException($"The exported solution is not a valid zip file. {ex.Message}");
        }
    }

    private static XDocument? LoadXml(ZipArchive archive, string name)
    {
        var entry = archive.Entries.FirstOrDefault(item =>
            string.Equals(item.FullName.TrimStart('/'), name, StringComparison.OrdinalIgnoreCase));
        if (entry is null) return null;
        using var stream = entry.Open();
        try
        {
            return XDocument.Load(stream, LoadOptions.PreserveWhitespace);
        }
        catch (XmlException ex)
        {
            throw new RibbonPackageException($"{name} in the exported solution is not valid XML. {ex.Message}");
        }
    }

    private static void WriteXml(XDocument document, Stream stream)
    {
        var settings = new XmlWriterSettings
        {
            Encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true),
            Indent = false,
            OmitXmlDeclaration = document.Declaration is null,
        };
        using var writer = XmlWriter.Create(stream, settings);
        document.Save(writer);
    }
}

/// <summary>The exported solution or ribbon file could not be read or changed.</summary>
public sealed class RibbonPackageException(string message) : Exception(message);
