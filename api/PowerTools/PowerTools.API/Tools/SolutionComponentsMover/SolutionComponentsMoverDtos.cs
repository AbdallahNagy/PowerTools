namespace PowerTools.API.Tools.SolutionComponentsMover;

public sealed class SolutionRowDto
{
    public required string Id { get; init; }
    public string FriendlyName { get; init; } = "";
    public string UniqueName { get; init; } = "";
    public string? PublisherName { get; init; }
    public string? InstalledOn { get; init; }
    public string Version { get; init; } = "";
    public bool IsManaged { get; init; }
}

public sealed class SolutionsResponse
{
    public List<SolutionRowDto> Solutions { get; init; } = [];
}

public sealed class ComponentTypeDto
{
    public int ComponentType { get; init; }
    public string Label { get; init; } = "";
}

public sealed class ComponentTypesResponse
{
    public List<ComponentTypeDto> ComponentTypes { get; init; } = [];
}

public sealed class StartCopyBody
{
    public List<string>? SourceSolutionIds { get; init; }
    public List<string>? TargetSolutionIds { get; init; }
    public List<int>? ComponentTypes { get; init; }
    public bool AllComponents { get; init; }
    public bool? CheckBestPractice { get; init; }
}

public sealed class CopyEntryDto
{
    public string ComponentId { get; init; } = "";
    public int ComponentType { get; init; }
    public string Label { get; init; } = "";
    public string SolutionUniqueName { get; init; } = "";
    public bool Succeeded { get; init; }
    public string Message { get; init; } = "";
}

public sealed class CopyJobDto
{
    public string Status { get; init; } = "";
    public int Processed { get; init; }
    public int Total { get; init; }
    public int Succeeded { get; init; }
    public int Failed { get; init; }
    public List<CopyEntryDto> Entries { get; init; } = [];
}

public sealed class CopyComponent
{
    public required Guid ObjectId { get; init; }
    public required int ComponentType { get; init; }
    public int? RootBehavior { get; init; }
    public bool UnmanagedSource { get; init; }
    public string Label { get; init; } = "";
}

public sealed class PreparedCopy
{
    public string? RefusalMessage { get; init; }
    public string RefusalLabel { get; init; } = "";
    public int OrganizationMajor { get; init; }
    public List<CopyComponent> Components { get; init; } = [];
    public List<string> TargetUniqueNames { get; init; } = [];
}
