namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record CatalogDto(
    IReadOnlyList<AssemblyDto> Assemblies,
    IReadOnlyList<PluginTypeDto> Types,
    IReadOnlyList<StepDto> Steps,
    IReadOnlyList<ImageDto> Images);

public sealed record AssemblyDto(
    Guid Id,
    string Name,
    string? Version,
    string? PublicKeyToken,
    string? Culture,
    int IsolationMode,
    int SourceType,
    bool IsManaged,
    bool IsSystem,
    DateTime? ModifiedOn,
    string? Description);

public sealed record PluginTypeDto(
    Guid Id,
    Guid AssemblyId,
    string TypeName,
    string? Name,
    string? FriendlyName,
    bool IsWorkflowActivity,
    string? WorkflowActivityGroupName,
    string? Description,
    bool IsManaged,
    bool IsSystem);

public sealed record StepDto(
    Guid Id,
    string Name,
    Guid PluginTypeId,
    Guid MessageId,
    string MessageName,
    Guid? FilterId,
    string? PrimaryEntity,
    string? SecondaryEntity,
    int Stage,
    int Mode,
    int Rank,
    bool IsEnabled,
    IReadOnlyList<string> FilteringAttributes,
    Guid? ImpersonatingUserId,
    string? ImpersonatingUserName,
    string? Description,
    string? Configuration,
    bool HasSecureConfiguration,
    int SupportedDeployment,
    bool AsyncAutoDelete,
    bool IsManaged,
    bool IsSystem,
    DateTime? ModifiedOn);

public sealed record ImageDto(
    Guid Id,
    Guid StepId,
    string Name,
    string EntityAlias,
    int ImageType,
    IReadOnlyList<string> Attributes,
    string? MessagePropertyName,
    bool IsManaged,
    bool IsSystem);
