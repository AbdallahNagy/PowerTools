namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record MutationPlanBinding(
    string Environment,
    string Operation,
    Guid? TargetId,
    string RequestDigest,
    IReadOnlyDictionary<Guid, long> ServerVersions,
    string? AssemblySha256,
    IReadOnlyDictionary<string, bool> Capabilities,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt);

public sealed record MutationPlanDto(
    string Token,
    string Environment,
    string Operation,
    Guid? TargetId,
    DateTimeOffset ExpiresAt,
    IReadOnlyList<MutationChangeDto> Changes,
    MutationImpactDto Impact,
    IReadOnlyList<MutationWarningDto> Warnings,
    IReadOnlyList<MutationBlockerDto> Blockers,
    ConfirmationRequirementDto Confirmation);

public sealed record MutationChangeDto(string Field, string? Before, string? After);

public sealed record MutationImpactDto(
    IReadOnlyList<string> AffectedComponents,
    IReadOnlyList<string> Dependencies,
    IReadOnlyList<string> OwnedDescendants);

public sealed record MutationWarningDto(string Code, string Message);

public sealed record MutationBlockerDto(string Code, string Message);

public sealed record ConfirmationRequirementDto(
    string Level,
    string Message,
    string? RequiredText = null,
    bool RequiresAcknowledgement = false);

public sealed record MutationExecutionResultDto(
    string Outcome,
    Guid? TargetId,
    PluginRegistrationProblemDto? Problem = null);

public sealed record PluginRegistrationProblemDto(
    string Category,
    string Code,
    string Message,
    string Environment,
    string? Component,
    string? CorrelationId,
    string SuggestedAction);

public sealed record MutationPreflightRequest(
    string Environment,
    string Operation,
    Guid? TargetId,
    object NormalizedRequest,
    IReadOnlyDictionary<Guid, long> ServerVersions,
    string? AssemblySha256,
    IReadOnlyDictionary<string, bool> Capabilities);
