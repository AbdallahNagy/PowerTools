namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record StepDraftDto(Guid PluginTypeId, Guid SdkMessageId, Guid SdkMessageFilterId,
    string PrimaryTable, string? SecondaryTable, int Stage, int Mode, int Rank,
    IReadOnlyList<string> FilteringAttributes, Guid? ImpersonatingUserId,
    string? UnsecureConfiguration, string? ReplacementSecureConfiguration,
    IReadOnlyDictionary<Guid, long> ExpectedVersions)
{
    public string ImpersonatingUserAction { get; init; } = "keep";
    public string UnsecureConfigurationAction { get; init; } = "keep";
}

public sealed record StepPublicValuesDto(string Name, string Message, string PrimaryTable, string? SecondaryTable,
    int Stage, int Mode, int Rank, IReadOnlyList<string> FilteringAttributes,
    Guid? ImpersonatingUserId, string? UnsecureConfiguration, bool SecureConfigExists, bool IsEnabled,
    string SecureConfigurationAction);

public sealed record PluginStepValidationState(string? StepName, string Message, string PrimaryTable, string? SecondaryTable,
    string PrimaryIdAttribute, IReadOnlyList<string> AvailableAttributes,
    bool MessageIsSupported, bool FilterIsSupported, bool IsImpersonatingUserEnabled, bool IsOrdinaryPlugin,
    bool IsParentManaged, bool IsParentCustomizable, bool DuplicateExists, bool IsManaged, bool IsCustomizable,
    bool SecureConfigExists, bool CurrentEnabled, long? CurrentVersion,
    Guid PluginTypeId, Guid? TargetStepId);

public sealed record PluginStepValidationResult(StepDraftDto Draft, StepPublicValuesDto PublicAfter,
    IReadOnlyList<MutationWarningDto> Warnings, IReadOnlyList<MutationBlockerDto> Blockers);

public sealed record PluginStepPreflightState(string Message, string PrimaryTable, string PrimaryIdAttribute,
    bool MessageIsSupported, bool FilterIsSupported, bool IsImpersonatingUserEnabled,
    bool DuplicateExists, bool IsManaged, bool IsCustomizable, bool SecureConfigExists, long? CurrentVersion,
    Guid PluginTypeId, Guid? TargetStepId, string? StepName,
    IReadOnlyList<ComponentDependencyDto> Dependencies,
    Guid? CurrentSdkMessageId = null,
    Guid? CurrentSdkMessageFilterId = null,
    IReadOnlyList<string>? CurrentFilteringAttributes = null,
    Guid? CurrentImpersonatingUserId = null,
    string? CurrentUnsecureConfiguration = null,
    int CurrentStage = 0,
    int CurrentMode = 0,
    int CurrentRank = 0,
    bool CurrentEnabled = false)
{
    public string? SecondaryTable { get; init; }
    public IReadOnlyList<string> AvailableAttributes { get; init; } = [];
    public bool IsOrdinaryPlugin { get; init; }
    public bool IsParentManaged { get; init; }
    public bool IsParentCustomizable { get; init; }
    public Guid? SecureConfigId { get; init; }
    public long? SecureConfigVersion { get; init; }
}

public sealed record StepMutationPreflightDto(StepDraftDto Draft, MutationPlanDto Plan,
    StepPublicValuesDto? Before, StepPublicValuesDto After);
public sealed record StepMutationExecutionDto(string Outcome, bool SucceededAndVerified, PluginStepDto? Step,
    PluginRegistrationProblemDto? Problem = null);
public sealed record StepMutationExecuteRequestDto(StepDraftDto Draft, string PlanToken, string? TypedName);
public sealed record StepOptionDto(Guid Id, string Name);
public sealed record StepMessageFilterOptionDto(Guid Id, Guid MessageId, string PrimaryTable,
    string? SecondaryTable, string PrimaryIdAttribute, IReadOnlyList<string> AvailableAttributes);
public sealed record StepOptionsDto(IReadOnlyList<StepOptionDto> Messages,
    IReadOnlyList<StepMessageFilterOptionDto> Filters, IReadOnlyList<StepOptionDto> EnabledUsers);

public sealed record StepEditDetailsDto(Guid StepId, Guid PluginTypeId, Guid SdkMessageId,
    Guid SdkMessageFilterId, string PrimaryTable, string? SecondaryTable, int Stage, int Mode, int Rank,
    IReadOnlyList<string> FilteringAttributes, Guid? ImpersonatingUserId, string? UnsecureConfiguration,
    bool SecureConfigExists, IReadOnlyDictionary<Guid, long> ExpectedVersions);

public sealed record PluginStepMutationCommand(string Operation, Guid? TargetStepId, StepDraftDto Draft,
    StepPublicValuesDto Before, long ExpectedPluginVersion, long? ExpectedStepVersion,
    Guid? ExpectedSecureConfigId, long? ExpectedSecureConfigVersion);
