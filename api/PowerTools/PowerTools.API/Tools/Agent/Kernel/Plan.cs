using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>What a plan, or one step of it, does to the environment. A plan with no step is a read.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PlanEffect>))]
public enum PlanEffect
{
    [JsonStringEnumMemberName("read")] Read,
    [JsonStringEnumMemberName("change")] Change,
    [JsonStringEnumMemberName("destructive")] Destructive,
}

/// <summary>
/// A step that runs, a step the environment cannot do (<see cref="Unsupported"/>, for example an online-only
/// feature on-premises), or a step on a managed component that cannot be changed (<see cref="Blocked"/>).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<PlanStepKind>))]
public enum PlanStepKind
{
    [JsonStringEnumMemberName("run")] Run,
    [JsonStringEnumMemberName("unsupported")] Unsupported,
    [JsonStringEnumMemberName("blocked")] Blocked,
}

/// <summary>Something a step changed that has to be published afterwards, such as a table or a global choice.</summary>
public sealed record PublishTarget(PublishKind Kind, string Name);

public enum PublishKind { Entity, OptionSet, WebResource, SiteMap, AppModule, Dashboard }

/// <summary>What a step's action gets when it runs.</summary>
public sealed record StepContext(IAgentClient Client, string? SolutionUniqueName);

/// <summary>
/// One ordered step of a plan. The public part is what the approval dialog and the result show; the
/// <see cref="Request"/> or <see cref="Action"/> is what runs and never leaves the sidecar.
/// </summary>
public sealed class PlanStep
{
    public required string Op { get; init; }

    public required string Target { get; init; }

    public PlanEffect Effect { get; init; } = PlanEffect.Change;

    public string? Detail { get; init; }

    public PlanStepKind Kind { get; init; } = PlanStepKind.Run;

    /// <summary>Why an unsupported or blocked step cannot run.</summary>
    public string? Reason { get; init; }

    /// <summary>For an unsupported step: what works on this environment instead.</summary>
    public string? Route { get; init; }

    /// <summary>A request the executor sends. It gets SolutionUniqueName when <see cref="SolutionAware"/> is set.</summary>
    [JsonIgnore]
    public OrganizationRequest? Request { get; init; }

    /// <summary>For steps that are more than one request. Runs instead of <see cref="Request"/>.</summary>
    [JsonIgnore]
    public Func<StepContext, CancellationToken, Task>? Action { get; init; }

    [JsonIgnore]
    public bool SolutionAware { get; init; } = true;

    [JsonIgnore]
    public IReadOnlyList<PublishTarget> Publishes { get; init; } = [];

    public static PlanStep Unsupported(string op, string target, string reason, string? route = null) =>
        new() { Op = op, Target = target, Kind = PlanStepKind.Unsupported, Reason = reason, Route = route };

    public static PlanStep Blocked(string op, string target, string reason) =>
        new() { Op = op, Target = target, Kind = PlanStepKind.Blocked, Reason = reason };
}

/// <summary>
/// The ordered steps that bring the environment to a spec. Planners only read; the executor runs the steps.
/// </summary>
public sealed class Plan
{
    public Plan(
        IReadOnlyList<PlanStep> steps,
        IReadOnlyList<string>? warnings = null,
        IReadOnlyList<string>? lockKeys = null,
        string? stateToken = null)
    {
        Steps = steps;
        Warnings = warnings ?? [];
        LockKeys = lockKeys ?? [];
        StateToken = stateToken;
        Hash = ComputeHash(steps, stateToken);
    }

    public static Plan Empty { get; } = new([]);

    public IReadOnlyList<PlanStep> Steps { get; }

    public IReadOnlyList<string> Warnings { get; }

    /// <summary>The components the steps touch, locked while the plan is checked, run and verified.</summary>
    public IReadOnlyList<string> LockKeys { get; }

    /// <summary>
    /// Optional fingerprint of the state the plan was made from (for example a form's versionnumber), so a change
    /// outside Power Tools that leaves the steps the same still changes the hash.
    /// </summary>
    public string? StateToken { get; }

    public string Hash { get; }

    public bool IsEmpty => Steps.Count == 0;

    /// <summary>The strongest effect of the steps that would run. Unsupported and blocked steps change nothing.</summary>
    public PlanEffect Effect =>
        Steps.Where(step => step.Kind == PlanStepKind.Run).Select(step => step.Effect).DefaultIfEmpty(PlanEffect.Read).Max();

    public PlanPreview ToPreview() => new(
        Effect,
        Hash,
        Steps.Select(PlanStepDto.From).ToList(),
        Warnings);

    private static string ComputeHash(IReadOnlyList<PlanStep> steps, string? stateToken)
    {
        var canonical = JsonSerializer.Serialize(new
        {
            steps = steps.Select(PlanStepDto.From),
            state = stateToken,
        });
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }
}

public sealed record PlanStepDto(
    string Op,
    string Target,
    PlanEffect Effect,
    PlanStepKind Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Detail = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Reason = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Route = null)
{
    public static PlanStepDto From(PlanStep step) =>
        new(step.Op, step.Target, step.Effect, step.Kind, step.Detail, step.Reason, step.Route);
}

/// <summary>What /plan answers, and what the approval dialog shows.</summary>
public sealed record PlanPreview(
    PlanEffect Effect,
    string Hash,
    IReadOnlyList<PlanStepDto> Steps,
    IReadOnlyList<string> Warnings);
