using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Dyno.Api.Tools.Agent.Components.Processes;

/// <summary>Everything the customizations.xml entry of one process says, as a solution export writes it.</summary>
public sealed record ProcessDefinition
{
    public required Guid Id { get; init; }

    public required string Name { get; init; }

    public required ProcessKind Kind { get; init; }

    /// <summary>The primary table's schema name, as an export writes it.</summary>
    public required string PrimaryEntity { get; init; }

    public required string Xaml { get; init; }

    public ProcessMode Mode { get; init; }

    public bool OnDemand { get; init; }

    public bool AsChild { get; init; }

    public bool OnCreate { get; init; }

    public IReadOnlyList<string> OnUpdate { get; init; } = [];

    /// <summary>Kept from an existing workflow: process_apply cannot set a delete trigger, but it does not drop one.</summary>
    public bool OnDelete { get; init; }

    /// <summary>Kept from an existing workflow: 1 user, 2 business unit, 3 parent-child business units, 4 organization.</summary>
    public int Scope { get; init; } = 4;

    public ProcessRunAs RunAs { get; init; }

    public bool Activated { get; init; }

    public string? Description { get; init; }

    /// <summary>Actions: the unique name without the publisher prefix.</summary>
    public string? UniqueName { get; init; }

    /// <summary>Actions: the message an existing action already has.</summary>
    public Guid? SdkMessageId { get; init; }

    public int LanguageCode { get; init; } = 1033;
}

/// <summary>
/// Builds the unmanaged solution file process_apply imports: one process, in a solution of its own made with the
/// target solution's publisher. A solution import is how the classic designer's own exports move between
/// environments, and it runs the same way online and on-premises.
/// </summary>
public static class ProcessPackage
{
    public static byte[] Build(string solutionName, PublisherInfo publisher, string organizationVersion, ProcessDefinition process)
    {
        var fileName = $"/Workflows/{SafeName(process.Name)}-{process.Id.ToString("D").ToUpperInvariant()}.xaml";
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(zip, "[Content_Types].xml", ContentTypes().ToString(SaveOptions.DisableFormatting));
            Add(zip, "solution.xml", Solution(solutionName, publisher, organizationVersion, process).ToString(SaveOptions.DisableFormatting));
            Add(zip, "customizations.xml", Customizations(process, fileName).ToString(SaveOptions.DisableFormatting));
            Add(zip, fileName.TrimStart('/'), process.Xaml);
        }

        return stream.ToArray();
    }

    /// <summary>The file name part an export uses: the process name with only letters and digits kept.</summary>
    public static string SafeName(string name)
    {
        var safe = new string(name.Where(char.IsAsciiLetterOrDigit).ToArray());
        return safe.Length == 0 ? "Process" : safe;
    }

    private static readonly XNamespace Xsi = "http://www.w3.org/2001/XMLSchema-instance";

    private static XElement ContentTypes()
    {
        XNamespace ns = "http://schemas.openxmlformats.org/package/2006/content-types";
        return new XElement(ns + "Types",
            new XElement(ns + "Default", new XAttribute("Extension", "xml"), new XAttribute("ContentType", "application/octet-stream")),
            new XElement(ns + "Default", new XAttribute("Extension", "xaml"), new XAttribute("ContentType", "application/octet-stream")));
    }

    private static XElement Solution(string solutionName, PublisherInfo publisher, string organizationVersion, ProcessDefinition process)
    {
        var version = Version(organizationVersion);
        return new XElement("ImportExportXml",
            new XAttribute("version", version),
            new XAttribute("SolutionPackageVersion", version.Major + "." + version.Minor),
            new XAttribute("languagecode", process.LanguageCode),
            new XAttribute("generatedBy", "CrmLive"),
            new XAttribute(XNamespace.Xmlns + "xsi", Xsi.NamespaceName),
            new XElement("SolutionManifest",
                new XElement("UniqueName", solutionName),
                Names(solutionName, process.LanguageCode),
                new XElement("Descriptions"),
                new XElement("Version", "1.0.0.0"),
                new XElement("Managed", "0"),
                new XElement("Publisher",
                    new XElement("UniqueName", publisher.UniqueName),
                    Names(string.IsNullOrWhiteSpace(publisher.FriendlyName) ? publisher.UniqueName : publisher.FriendlyName, process.LanguageCode),
                    new XElement("Descriptions"),
                    new XElement("EMailAddress", new XAttribute(Xsi + "nil", "true")),
                    new XElement("SupportingWebsiteUrl", new XAttribute(Xsi + "nil", "true")),
                    new XElement("CustomizationPrefix", publisher.Prefix),
                    new XElement("CustomizationOptionValuePrefix", publisher.OptionValuePrefix.ToString(CultureInfo.InvariantCulture)),
                    new XElement("Addresses")),
                new XElement("RootComponents",
                    new XElement("RootComponent", new XAttribute("type", "29"), new XAttribute("id", $"{{{process.Id:D}}}"), new XAttribute("behavior", "0"))),
                new XElement("MissingDependencies")));
    }

    /// <summary>The organization's version as the file's version, so an import never sees a newer file than itself.</summary>
    private static Version Version(string organizationVersion)
    {
        var parts = organizationVersion.Split('.').Select(p => int.TryParse(p, NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : 0).ToList();
        while (parts.Count < 4) parts.Add(0);
        return new Version(Math.Max(parts[0], 8), parts[1], parts[2], parts[3]);
    }

    private static XElement Names(string name, int languageCode) =>
        new("LocalizedNames", new XElement("LocalizedName", new XAttribute("description", name), new XAttribute("languagecode", languageCode)));

    private static XElement Customizations(ProcessDefinition process, string fileName)
    {
        var action = process.Kind == ProcessKind.Action;
        var realtime = !action && process.Mode == ProcessMode.Realtime;
        var workflow = new XElement("Workflow",
            new XAttribute("WorkflowId", $"{{{process.Id:D}}}"),
            new XAttribute("Name", process.Name),
            new XElement("XamlFileName", fileName),
            new XElement("Type", "1"),
            new XElement("Subprocess", Bit(!action && process.AsChild)),
            new XElement("Category", action ? "3" : "0"),
            new XElement("Mode", realtime ? "1" : "0"),
            new XElement("Scope", process.Scope.ToString(CultureInfo.InvariantCulture)),
            new XElement("OnDemand", Bit(!action && process.OnDemand)));
        if (!action && process.OnUpdate.Count > 0) workflow.Add(new XElement("TriggerOnUpdateAttributeList", string.Join(",", process.OnUpdate)));
        workflow.Add(
            new XElement("TriggerOnCreate", Bit(!action && process.OnCreate)),
            new XElement("TriggerOnDelete", Bit(!action && process.OnDelete)),
            new XElement("AsyncAutodelete", "0"),
            new XElement("SyncWorkflowLogOnFailure", Bit(realtime || action)),
            new XElement("StateCode", process.Activated ? "1" : "0"),
            new XElement("StatusCode", process.Activated ? "2" : "1"),
            new XElement("CreateStage", "40"));
        if (!action && process.OnUpdate.Count > 0) workflow.Add(new XElement("UpdateStage", "40"));
        workflow.Add(new XElement("RunAs", action || process.RunAs == ProcessRunAs.User ? "1" : "0"));
        if (action)
        {
            if (process.SdkMessageId is { } message) workflow.Add(new XElement("SdkMessageId", $"{{{message:D}}}"));
            workflow.Add(new XElement("UniqueName", process.UniqueName));
        }

        workflow.Add(
            new XElement("IsTransacted", "1"),
            new XElement("IntroducedVersion", "1.0.0.0"),
            new XElement("IsCustomizable", "1"),
            new XElement("BusinessProcessType", "0"),
            new XElement("IsCustomProcessingStepAllowedForOtherPublishers", "1"),
            new XElement("ModernFlowType", "0"),
            new XElement("PrimaryEntity", process.PrimaryEntity),
            Names(process.Name, process.LanguageCode));
        if (!string.IsNullOrEmpty(process.Description))
            workflow.Add(new XElement("Descriptions", new XElement("Description", new XAttribute("description", process.Description), new XAttribute("languagecode", process.LanguageCode))));

        return new XElement("ImportExportXml",
            new XAttribute(XNamespace.Xmlns + "xsi", Xsi.NamespaceName),
            new XElement("Entities"),
            new XElement("Roles"),
            new XElement("Workflows", workflow),
            new XElement("FieldSecurityProfiles"),
            new XElement("Templates"),
            new XElement("EntityMaps"),
            new XElement("EntityRelationships"),
            new XElement("OrganizationSettings"),
            new XElement("optionsets"),
            new XElement("CustomControls"),
            new XElement("EntityDataProviders"),
            new XElement("Languages", new XElement("Language", process.LanguageCode)));
    }

    private static string Bit(bool value) => value ? "1" : "0";

    /// <summary>
    /// Writes one entry as UTF-8 without a byte order mark, as the classic designer's exports do. The import reads the
    /// workflow's .xaml file as text, and a leading byte order mark fails it with "Data at the root level is invalid.
    /// Line 1, position 1".
    /// </summary>
    private static void Add(ZipArchive zip, string name, string text)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        writer.Write(text);
    }
}
