namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record PluginRegistrationCatalogDto(
    IReadOnlyList<PluginAssemblyDto> Assemblies);

public sealed record PluginAssemblyDto(
    Guid Id,
    string Name,
    string Version,
    string? Culture,
    string? PublicKeyToken,
    int SourceType,
    int IsolationMode,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    IReadOnlyList<PluginHandlerDto> Handlers,
    string? Description = null,
    string? SolutionDisplayName = null,
    string? SourceHash = null,
    long? ContentSize = null);

public sealed record PluginHandlerDto(
    Guid Id,
    HandlerKind Kind,
    string TypeName,
    string Name,
    string? FriendlyName,
    string? Description,
    string? WorkflowActivityGroupName,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    IReadOnlyList<PluginStepDto> Steps,
    IReadOnlyList<WorkflowArgumentDto> WorkflowArguments,
    IReadOnlyList<ComponentDependencyDto> Dependencies,
    Guid? AssemblyId = null,
    string? SolutionDisplayName = null);

public sealed record PluginStepDto(
    Guid Id,
    Guid PluginHandlerId,
    string Name,
    string? Description,
    string MessageLabel,
    string? PrimaryTableLabel,
    string? SecondaryTableLabel,
    string StageLabel,
    string ModeLabel,
    int Stage,
    int Mode,
    int Rank,
    bool IsEnabled,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    bool SecureConfigExists,
    IReadOnlyList<PluginImageDto> Images,
    string? SolutionDisplayName = null);

public sealed record PluginImageDto(
    Guid Id,
    Guid PluginStepId,
    string Name,
    string? Description,
    string ImageTypeLabel,
    string? EntityAlias,
    IReadOnlyList<string> Attributes,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    string? SolutionDisplayName = null);

public sealed record WorkflowArgumentDto(
    string Name,
    string DisplayName,
    string TypeName,
    WorkflowArgumentDirection Direction,
    bool IsRequired,
    int Position);

public sealed record ComponentDependencyDto(
    Guid ComponentId,
    string Name,
    string ComponentTypeLabel,
    string? SolutionDisplayName,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber);

public enum HandlerKind
{
    Plugin,
    WorkflowActivity
}

public enum WorkflowArgumentDirection
{
    Input,
    Output
}
