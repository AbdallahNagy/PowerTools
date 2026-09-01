namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public enum CascadeTargetKind { Assembly, Plugin, WorkflowActivity }

public sealed record CascadeUnregisterDraftDto(
    CascadeTargetKind TargetKind,
    Guid TargetId,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);

public sealed record CascadeDeleteRequestDto(Guid Id, string LogicalName, long VersionNumber);

public sealed record CascadeImpactDto(
    PluginAssemblyDto? Assembly,
    IReadOnlyList<PluginHandlerDto> Handlers,
    IReadOnlyList<PluginStepDto> Steps,
    IReadOnlyList<PluginImageDto> Images,
    IReadOnlyList<ComponentDependencyDto> ExternalDependencies,
    int EnabledStepCount);

public sealed record CascadeUnregisterPreflightDto(
    CascadeUnregisterDraftDto Draft,
    MutationPlanDto Plan,
    CascadeImpactDto Impact,
    IReadOnlyList<CascadeDeleteRequestDto> DeletePlan);

public sealed record CascadeUnregisterExecuteRequestDto(
    CascadeUnregisterDraftDto Draft,
    string PlanToken,
    string? TypedName = null,
    bool Acknowledged = false);

public sealed record CascadeUnregisterExecutionDto(
    string Outcome,
    bool SucceededAndVerified,
    CascadeImpactDto? RemainingImpact = null,
    PluginRegistrationProblemDto? Problem = null);

public sealed record PluginRegistrationCapabilitiesDto(
    TransactionalCascadeUnregisterCapabilityDto TransactionalCascadeUnregister);

public sealed record TransactionalCascadeUnregisterCapabilityDto(bool Supported, string Reason);
