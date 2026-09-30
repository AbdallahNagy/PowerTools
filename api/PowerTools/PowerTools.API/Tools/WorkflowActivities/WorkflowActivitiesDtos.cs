namespace PowerTools.API.Tools.WorkflowActivities;

public sealed record ArgumentNameDto(string Name);

public sealed record ActivityDto(
    string PluginTypeId,
    string Name,
    string TypeName,
    string Version,
    string? CreatedOn,
    string CreatedBy,
    string? ModifiedOn,
    string ModifiedBy,
    IReadOnlyList<ArgumentNameDto> Inputs,
    IReadOnlyList<ArgumentNameDto> Outputs);

public sealed record AssemblyGroupDto(
    string AssemblyId,
    string Name,
    IReadOnlyList<ActivityDto> Activities);

public sealed record WorkflowActivitiesResponse(IReadOnlyList<AssemblyGroupDto> Assemblies);

public sealed record ProcessDto(
    string WorkflowId,
    string Name,
    int? Category,
    string CategoryLabel,
    string PrimaryEntity,
    string? CreatedOn,
    string? ModifiedOn,
    bool OnDemand,
    bool TriggerOnCreate,
    bool TriggerOnDelete,
    IReadOnlyList<string> TriggerOnUpdateAttributes);

public sealed record ActivityProcessesResponse(
    string ActivityName,
    bool Truncated,
    IReadOnlyList<ProcessDto> Processes);
