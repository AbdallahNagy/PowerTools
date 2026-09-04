namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record AssemblyMutationDraftDto(
    string FileName,
    string Operation,
    Guid? AssemblyId,
    int RequestedIsolationMode,
    int RequestedSourceType,
    long? ExpectedAssemblyVersionNumber,
    IReadOnlyDictionary<Guid, long> ExpectedHandlerVersionNumbers,
    AssemblyInspectionDto Inspection);

public sealed record AssemblyMutationPreflightDto(
    AssemblyMutationDraftDto Draft,
    MutationPlanDto Plan,
    AssemblyMutationImpactDto Impact);

public sealed record AssemblyMutationExecutionDto(
    string Outcome,
    bool SucceededAndVerified,
    PluginAssemblyDto? Assembly,
    PluginRegistrationProblemDto? Problem = null);

public sealed record AssemblyMutationImpactDto(
    AssemblyIdentityInspectionDto? PreviousIdentity,
    AssemblyIdentityInspectionDto CurrentIdentity,
    string? PreviousSha256,
    string CurrentSha256,
    long? PreviousSize,
    long CurrentSize,
    int? PreviousIsolationMode,
    int CurrentIsolationMode,
    int? PreviousSourceType,
    int CurrentSourceType,
    IReadOnlyList<string> AddedPlugins,
    IReadOnlyList<string> UnchangedPlugins,
    IReadOnlyList<string> ChangedPlugins,
    IReadOnlyList<string> RemovedPlugins,
    IReadOnlyList<string> AddedWorkflowActivities,
    IReadOnlyList<string> ChangedWorkflowActivities,
    IReadOnlyList<string> RemovedWorkflowActivities,
    IReadOnlyList<string> OwnedStepsAndImages,
    IReadOnlyList<string> Dependencies,
    IReadOnlyList<WorkflowContractDifferenceDto> WorkflowContractDifferences,
    IReadOnlyList<MutationWarningDto> Warnings,
    IReadOnlyList<MutationBlockerDto> Blockers);

public sealed record WorkflowContractDifferenceDto(
    string TypeName,
    string ArgumentName,
    string Change,
    bool IsBreaking,
    bool IsReferenced);

public sealed record PluginAssemblyMutationCommand(
    Guid? AssemblyId,
    AssemblyInspectionDto Inspection,
    byte[] Content,
    int IsolationMode,
    int SourceType,
    long? ExpectedVersion);
