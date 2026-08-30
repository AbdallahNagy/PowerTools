namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record StepDraftDto(Guid PluginTypeId, Guid SdkMessageId, Guid SdkMessageFilterId,
    string PrimaryTable, string? SecondaryTable, int Stage, int Mode, int Rank,
    IReadOnlyList<string> FilteringAttributes, Guid? ImpersonatingUserId,
    string? UnsecureConfiguration, string? ReplacementSecureConfiguration,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);

public sealed record StepPublicValuesDto(string Message, string PrimaryTable, string? SecondaryTable,
    int Stage, int Mode, int Rank, IReadOnlyList<string> FilteringAttributes,
    Guid? ImpersonatingUserId, string? UnsecureConfiguration, bool SecureConfigExists);

public sealed record PluginStepValidationState(string Message, string PrimaryTable, string PrimaryIdAttribute,
    bool MessageIsSupported, bool FilterIsSupported, bool IsImpersonatingUserEnabled,
    bool DuplicateExists, bool IsManaged, bool IsCustomizable, bool SecureConfigExists, long? CurrentVersion,
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
    string? CurrentUnsecureConfiguration = null);

public sealed record StepMutationPreflightDto(StepDraftDto Draft, MutationPlanDto Plan, StepPublicValuesDto After);
public sealed record StepMutationExecutionDto(string Outcome, bool SucceededAndVerified, PluginStepDto? Step,
    PluginRegistrationProblemDto? Problem = null);
public sealed record StepMutationExecuteRequestDto(StepDraftDto Draft, string PlanToken, string? TypedName);
public sealed record StepOptionDto(Guid Id, string Name);
public sealed record StepMessageFilterOptionDto(Guid Id, Guid MessageId, string PrimaryTable,
    string? SecondaryTable, string PrimaryIdAttribute);
public sealed record StepOptionsDto(IReadOnlyList<StepOptionDto> Messages,
    IReadOnlyList<StepMessageFilterOptionDto> Filters, IReadOnlyList<StepOptionDto> EnabledUsers);
