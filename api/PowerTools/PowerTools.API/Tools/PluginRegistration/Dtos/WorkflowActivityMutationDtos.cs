namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record WorkflowActivityDraftDto(
    Guid WorkflowActivityId,
    string Name,
    string? FriendlyName,
    string? WorkflowActivityGroupName,
    string? Description,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);

public sealed record WorkflowActivityMutationPreflightDto(
    WorkflowActivityDraftDto Draft,
    MutationPlanDto Plan,
    PluginHandlerDto Before,
    PluginHandlerDto After);

public sealed record WorkflowActivityMutationExecutionDto(
    string Outcome,
    bool SucceededAndVerified,
    PluginHandlerDto? WorkflowActivity,
    PluginRegistrationProblemDto? Problem = null);

public sealed record WorkflowActivityMutationCommand(
    Guid WorkflowActivityId,
    string Name,
    string? FriendlyName,
    string? WorkflowActivityGroupName,
    string? Description,
    long ExpectedVersion);

public sealed record WorkflowActivityExecuteRequestDto(
    WorkflowActivityDraftDto Draft,
    string PlanToken);
