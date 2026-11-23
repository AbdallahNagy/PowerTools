using System.Text.Json.Serialization;

namespace Dyno.Api.Tools.Agent.Kernel;

[JsonConverter(typeof(JsonStringEnumConverter<ApplyOutcome>))]
public enum ApplyOutcome
{
    /// <summary>Every step done, and verification found nothing left.</summary>
    [JsonStringEnumMemberName("applied")] Applied,

    /// <summary>The plan was empty.</summary>
    [JsonStringEnumMemberName("unchanged")] Unchanged,

    /// <summary>Some steps done, then one failed or could not run, or verification found a difference.</summary>
    [JsonStringEnumMemberName("partlyApplied")] PartlyApplied,

    /// <summary>The first step failed or could not run; nothing changed.</summary>
    [JsonStringEnumMemberName("failed")] Failed,

    /// <summary>The environment changed since approval, or a lock could not be taken. Nothing changed.</summary>
    [JsonStringEnumMemberName("refused")] Refused,

    /// <summary>A dry run: nothing ran, and remaining holds the plan. Built by the desktop, never by apply.</summary>
    [JsonStringEnumMemberName("planned")] Planned,
}

[JsonConverter(typeof(JsonStringEnumConverter<StepStatus>))]
public enum StepStatus
{
    [JsonStringEnumMemberName("done")] Done,
    [JsonStringEnumMemberName("skipped")] Skipped,
    [JsonStringEnumMemberName("failed")] Failed,
    [JsonStringEnumMemberName("notRun")] NotRun,
    [JsonStringEnumMemberName("unsupported")] Unsupported,
}

public sealed record StepResult(
    string Op,
    string Target,
    StepStatus Status,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? DataverseCode = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [property: System.ComponentModel.Description("Ids of the records or components a done step created, such as a new record's id.")]
    IReadOnlyList<string>? Ids = null);

public sealed record RemainingPlan(IReadOnlyList<PlanStepDto> Steps);

/// <summary>
/// The one result every apply tool returns. The executor never rolls back: it stops at the first failed step and
/// says exactly where. <see cref="Remaining"/> is a fresh plan, so the agent fixes the cause and sends the same spec.
/// </summary>
public sealed record ApplyResult(
    ApplyOutcome Outcome,
    IReadOnlyList<StepResult> Steps,
    IReadOnlyList<string> Published,
    RemainingPlan Remaining,
    IReadOnlyList<string> Warnings,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Code = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Message = null)
{
    /// <summary>Error code for a refused call: the plan changed between approval and apply.</summary>
    public const string PlanChangedCode = "PlanChanged";

    /// <summary>Error code for a refused call: another edit held a component too long.</summary>
    public const string LockTimeoutCode = "LockTimeout";

    /// <summary>Error code when a step needs a feature this environment does not have.</summary>
    public const string NotSupportedCode = "NotSupported";

    public static ApplyResult Unchanged(IReadOnlyList<string> warnings) =>
        new(ApplyOutcome.Unchanged, [], [], new RemainingPlan([]), warnings);

    public static ApplyResult Refused(string code, string message, Plan? current = null) =>
        new(
            ApplyOutcome.Refused,
            [],
            [],
            new RemainingPlan(current?.Steps.Select(PlanStepDto.From).ToList() ?? []),
            current?.Warnings ?? [],
            code,
            message);
}
