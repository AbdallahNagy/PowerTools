namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record ImageDraftDto(Guid StepId, int ImageType, string Alias, string MessagePropertyName,
    IReadOnlyList<string> Attributes, IReadOnlyDictionary<Guid, long> ExpectedVersions);
public sealed record ImagePublicValuesDto(string Name, int ImageType, string Alias, string MessagePropertyName,
    IReadOnlyList<string> Attributes);
public sealed record ImageMutationPreflightDto(ImageDraftDto Draft, MutationPlanDto Plan,
    ImagePublicValuesDto? Before, ImagePublicValuesDto After);
public sealed record ImageMutationExecutionDto(string Outcome, bool SucceededAndVerified, PluginImageDto? Image);
public sealed record ImageMutationExecuteRequestDto(ImageDraftDto Draft, string PlanToken, string? TypedName);
public sealed record PluginImageValidationState(Guid? TargetImageId, string? ImageName, string Message, int Stage,
    string PrimaryTable, string SupportedMessagePropertyName, IReadOnlyList<string> AvailableAttributes,
    bool DuplicateAlias, bool IsManaged, bool IsCustomizable, long StepVersion, long? CurrentImageVersion, Guid StepId);
public sealed record PluginImageValidationResult(ImageDraftDto Draft, ImagePublicValuesDto PublicAfter,
    IReadOnlyList<MutationWarningDto> Warnings, IReadOnlyList<MutationBlockerDto> Blockers);
public sealed record PluginImagePreflightState(Guid? TargetImageId, string? ImageName, string Message, int Stage,
    string PrimaryTable, string SupportedMessagePropertyName, IReadOnlyList<string> AvailableAttributes,
    bool DuplicateAlias, bool IsManaged, bool IsCustomizable, long StepVersion, long? CurrentImageVersion, Guid StepId);
public sealed record PluginImageMutationCommand(string Operation, Guid? TargetImageId, ImageDraftDto Draft,
    long ExpectedStepVersion, long? ExpectedImageVersion);
