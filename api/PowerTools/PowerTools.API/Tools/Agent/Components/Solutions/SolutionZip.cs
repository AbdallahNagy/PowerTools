using System.IO.Compression;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Agent.Components.Solutions;

/// <summary>What a solution .zip says about itself, read from its solution.xml and customizations.xml.</summary>
public sealed record SolutionZipInfo(
    string UniqueName,
    string Version,
    bool Managed,
    IReadOnlySet<string> EnvironmentVariables,
    IReadOnlyDictionary<string, string?> ConnectionReferences);

public static class SolutionZip
{
    /// <summary>Reads the solution's name, version and kind, or throws an InvalidRequest that says what is wrong.</summary>
    public static SolutionZipInfo Read(byte[] file)
    {
        try
        {
            using var zip = new ZipArchive(new MemoryStream(file), ZipArchiveMode.Read);
            var solution = Load(zip, "solution.xml")
                ?? throw Invalid("The file is not a solution: it has no solution.xml.");
            var manifest = solution.Descendants("SolutionManifest").FirstOrDefault()
                ?? throw Invalid("The file's solution.xml has no SolutionManifest.");
            var name = manifest.Element("UniqueName")?.Value;
            var version = manifest.Element("Version")?.Value;
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(version))
                throw Invalid("The file's solution.xml has no UniqueName or Version.");
            var managed = manifest.Element("Managed")?.Value is "1" or "true";

            var variables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in zip.Entries)
            {
                // environmentvariabledefinitions/<schemaname>/environmentvariabledefinition.xml
                var parts = entry.FullName.Replace('\\', '/').Split('/');
                if (parts.Length >= 2 && string.Equals(parts[0], "environmentvariabledefinitions", StringComparison.OrdinalIgnoreCase) && parts[1].Length > 0)
                    variables.Add(parts[1]);
            }

            var references = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var customizations = Load(zip, "customizations.xml");
            foreach (var reference in customizations?.Descendants("connectionreference") ?? [])
            {
                var logical = (string?)reference.Attribute("connectionreferencelogicalname");
                if (!string.IsNullOrWhiteSpace(logical)) references[logical] = reference.Element("connectorid")?.Value;
            }

            return new SolutionZipInfo(name.Trim(), version.Trim(), managed, variables, references);
        }
        catch (InvalidDataException)
        {
            throw Invalid("The file is not a valid .zip.");
        }
        catch (System.Xml.XmlException ex)
        {
            throw Invalid($"The file's XML is not valid: {ex.Message}");
        }
    }

    private static XDocument? Load(ZipArchive zip, string name)
    {
        var entry = zip.Entries.FirstOrDefault(e => string.Equals(e.FullName, name, StringComparison.OrdinalIgnoreCase));
        if (entry is null) return null;
        using var stream = entry.Open();
        return XDocument.Load(stream);
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
