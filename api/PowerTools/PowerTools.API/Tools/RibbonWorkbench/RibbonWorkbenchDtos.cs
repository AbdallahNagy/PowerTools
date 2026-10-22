namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>
/// One XML element of a RibbonDiffXml or RibbonXml document. The renderer edits these nodes and the
/// sidecar turns them back into XML, so elements and attributes the editor does not know survive a save.
/// A comment is a node named <c>#comment</c> with <see cref="Text"/> set.
/// </summary>
public sealed class RibbonNodeDto
{
    public string Name { get; set; } = "";
    public Dictionary<string, string> Attributes { get; set; } = [];
    public List<RibbonNodeDto> Children { get; set; } = [];
    public string? Text { get; set; }
}

public static class RibbonKeys
{
    /// <summary>The diff key for the root RibbonDiffXml in customizations.xml.</summary>
    public const string ApplicationRibbon = "applicationribbon";

    public static bool IsApplication(string key) =>
        string.Equals(key, ApplicationRibbon, StringComparison.OrdinalIgnoreCase);
}

public sealed record RibbonSolutionDto(
    Guid Id,
    string UniqueName,
    string FriendlyName,
    string? PublisherPrefix,
    string? Version);

public sealed record RibbonSolutionsResponse(IReadOnlyList<RibbonSolutionDto> Solutions);

public sealed class LoadBody
{
    public string? SolutionUniqueName { get; set; }
}

public sealed class RibbonEntityDto
{
    public string LogicalName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool RibbonNotSupported { get; set; }
    /// <summary>Set when the table's command bar can be read but not edited in this solution, with the reason.</summary>
    public string? ReadOnlyReason { get; set; }
    public RibbonNodeDto? Diff { get; set; }
    /// <summary>Hash of the diff as exported. Publish compares it with a fresh export to detect concurrent edits.</summary>
    public string? DiffHash { get; set; }
}

public sealed class ApplicationRibbonDto
{
    /// <summary>True when the solution contains the Application Ribbons component (type 50).</summary>
    public bool Included { get; set; }
    public string? ReadOnlyReason { get; set; }
    public RibbonNodeDto? Diff { get; set; }
    public string? DiffHash { get; set; }
}

public sealed record ComponentCountDto(int Type, string Name, int Count);

public sealed class LoadResponse
{
    public RibbonSolutionDto Solution { get; set; } = new(Guid.Empty, "", "", null, null);
    public List<RibbonEntityDto> Entities { get; set; } = [];
    public ApplicationRibbonDto ApplicationRibbon { get; set; } = new();
    /// <summary>Root components other than tables and application ribbons. A publish imports them again too.</summary>
    public List<ComponentCountDto> OtherComponents { get; set; } = [];
    public bool CanPublish { get; set; } = true;
    public string? ReadOnlyReason { get; set; }
    public List<RuleTypeDto> RuleTypes { get; set; } = [];
}

public sealed record RuleAttributeDto(string Name, string Kind, bool Required, IReadOnlyList<string>? Values);

/// <summary>A rule element from the ribbon schema. <see cref="Usage"/> holds "enable", "display", or both.</summary>
public sealed record RuleTypeDto(string Name, IReadOnlyList<string> Usage, IReadOnlyList<RuleAttributeDto> Attributes);

public sealed record RibbonTemplateDto(string Id, IReadOnlyList<string> Layouts);

/// <summary>The published, merged ribbon of one table or of the application.</summary>
public sealed class BaseRibbonDto
{
    public string? Entity { get; set; }
    public List<RibbonNodeDto> Tabs { get; set; } = [];
    public List<RibbonNodeDto> Commands { get; set; } = [];
    public List<RibbonNodeDto> EnableRules { get; set; } = [];
    public List<RibbonNodeDto> DisplayRules { get; set; } = [];
    public List<RibbonTemplateDto> Templates { get; set; } = [];
}

public sealed class DiffsBody
{
    public string? SolutionUniqueName { get; set; }
    /// <summary>Changed diffs by table logical name, or <c>applicationribbon</c>.</summary>
    public Dictionary<string, RibbonNodeDto>? Diffs { get; set; }
}

public sealed class PublishBody
{
    public string? SolutionUniqueName { get; set; }
    public Dictionary<string, RibbonNodeDto>? Diffs { get; set; }
    /// <summary>The <c>DiffHash</c> values from load, by the same keys.</summary>
    public Dictionary<string, string>? BaseHashes { get; set; }
}

public static class ProblemSeverities
{
    public const string Error = "error";
    public const string Warning = "warning";
}

public sealed record ProblemDto(string Severity, string Table, string? Item, string Problem);

public sealed record ValidateResponse(IReadOnlyList<ProblemDto> Problems);

public sealed record PublishStartedResponse(Guid JobId);

public static class PublishJobStatuses
{
    public const string Queued = "queued";
    public const string Running = "running";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
    /// <summary>The import succeeded but publishing failed. Publish again without importing.</summary>
    public const string PublishFailed = "publishFailed";
    /// <summary>The job stopped waiting. The import may still be running in Dataverse.</summary>
    public const string TimedOut = "timedOut";
    /// <summary>A diff changed in Dataverse after it was loaded. Nothing was imported.</summary>
    public const string Conflict = "conflict";
}

public static class PublishJobPhases
{
    public const string Exporting = "exporting";
    public const string Importing = "importing";
    public const string Publishing = "publishing";
    public const string Done = "done";
}

public sealed class PublishTargetsDto
{
    public List<string> Entities { get; set; } = [];
    public bool ApplicationRibbon { get; set; }
}

public sealed class PublishJobDto
{
    public string Status { get; set; } = PublishJobStatuses.Queued;
    public string Phase { get; set; } = PublishJobPhases.Exporting;
    /// <summary>Import progress from 0 to 100.</summary>
    public double Progress { get; set; }
    public string? Message { get; set; }
    public List<string> Errors { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
    public PublishTargetsDto Targets { get; set; } = new();
}

public sealed record PublishAgainResponse(string Status);
