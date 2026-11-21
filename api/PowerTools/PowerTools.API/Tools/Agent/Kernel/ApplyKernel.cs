using System.Text.Json;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>The part of every apply spec the kernel reads: the solution changes go into.</summary>
public interface IApplySpec
{
    string? Solution { get; }
}

/// <summary>A component family's planner. It only reads; the kernel runs and verifies what it plans.</summary>
public interface IComponentPlanner<in TSpec>
{
    Task<Plan> PlanAsync(TSpec spec, PlanContext context, CancellationToken ct);
}

/// <summary>What a planner reads with. Made fresh for each plan, so a re-check or verification never sees stale metadata.</summary>
public sealed class PlanContext(IAgentClient client, Capabilities capabilities, string connectionKey)
{
    private Task<int>? baseLanguage;
    private readonly Dictionary<string, Task<SolutionContext>> solutions = new(StringComparer.OrdinalIgnoreCase);

    public IAgentClient Client { get; } = client;

    public Capabilities Capabilities { get; } = capabilities;

    public string ConnectionKey { get; } = connectionKey;

    public MetadataCache Metadata { get; } = new(client);

    public Task<int> BaseLanguageAsync(CancellationToken ct) => baseLanguage ??= Labels.BaseLanguageAsync(Client, ct);

    public Task<SolutionContext> SolutionAsync(string solution, CancellationToken ct)
    {
        if (!solutions.TryGetValue(solution, out var found))
            solutions[solution] = found = SolutionContext.ResolveAsync(Client, solution, ct);
        return found;
    }
}

/// <summary>A family as the routes see it: a name, and plans made from a JSON spec.</summary>
public interface IApplyFamily
{
    string Name { get; }

    /// <summary>Reads the spec, or throws an <see cref="AgentProblemException"/> that says what is wrong with it.</summary>
    IApplySpec ReadSpec(JsonElement spec);

    Task<Plan> PlanAsync(IApplySpec spec, PlanContext context, CancellationToken ct);
}

public sealed class ApplyFamily<TSpec>(string name, IComponentPlanner<TSpec> planner) : IApplyFamily
    where TSpec : class, IApplySpec
{
    public string Name => name;

    public IApplySpec ReadSpec(JsonElement spec)
    {
        try
        {
            return spec.Deserialize<TSpec>(JsonSerializerOptions.Web)
                ?? throw new AgentProblemException(AgentFaults.InvalidRequest("The spec must be a JSON object."));
        }
        catch (JsonException ex)
        {
            throw new AgentProblemException(AgentFaults.InvalidRequest($"The spec is not valid for {name}: {ex.Message}"));
        }
    }

    public Task<Plan> PlanAsync(IApplySpec spec, PlanContext context, CancellationToken ct) =>
        planner.PlanAsync((TSpec)spec, context, ct);
}

public sealed record KernelOptions(TimeSpan LockTimeout, RetryPolicy Retry)
{
    public static KernelOptions Default { get; } = new(TimeSpan.FromSeconds(60), new RetryPolicy());
}

/// <summary>
/// Plan, check, run, publish, verify. The approved plan's hash must match a fresh plan made under the components'
/// locks, so what runs is what the user approved.
/// </summary>
public sealed class ApplyKernel(IApplyFamily family, Func<PlanContext> newContext, KernelOptions? options = null)
{
    private readonly KernelOptions options = options ?? KernelOptions.Default;

    public async Task<PlanPreview> PlanAsync(IApplySpec spec, CancellationToken ct) =>
        (await family.PlanAsync(spec, newContext(), ct)).ToPreview();

    public async Task<ApplyResult> ApplyAsync(IApplySpec spec, string approvedHash, CancellationToken ct)
    {
        var first = await family.PlanAsync(spec, newContext(), ct);
        using var held = await Locks.TryHoldAllAsync(first.LockKeys, options.LockTimeout, ct);
        if (held is null)
        {
            return ApplyResult.Refused(
                ApplyResult.LockTimeoutCode,
                "Another change to the same components did not finish in time. Nothing was changed; run the call again.");
        }

        var context = newContext();
        var plan = await family.PlanAsync(spec, context, ct);
        if (!string.Equals(plan.Hash, approvedHash, StringComparison.Ordinal))
        {
            return ApplyResult.Refused(
                ApplyResult.PlanChangedCode,
                "The environment changed after the plan was approved. Nothing was changed; run the call again to see the new plan.",
                plan);
        }

        if (plan.IsEmpty) return ApplyResult.Unchanged(plan.Warnings);

        var execution = await new PlanExecutor(context.Client, options.Retry, context.ConnectionKey).RunAsync(plan, spec.Solution, ct);
        var verification = await family.PlanAsync(spec, newContext(), ct);
        return Combine(plan, execution, verification);
    }

    public static ApplyResult Combine(Plan plan, Execution execution, Plan verification)
    {
        var warnings = plan.Warnings.Concat(execution.Warnings).ToList();
        var remaining = new RemainingPlan(verification.Steps.Select(PlanStepDto.From).ToList());

        ApplyOutcome outcome;
        string? code = execution.StopCode;
        string? message = execution.StopMessage;
        if (execution.Done == 0 && execution.Stopped)
        {
            outcome = ApplyOutcome.Failed;
        }
        else if (execution.Stopped || !verification.IsEmpty || execution.Warnings.Count > 0)
        {
            outcome = ApplyOutcome.PartlyApplied;
            if (code is null && !verification.IsEmpty)
            {
                code = "VerificationFailed";
                message = "Every step ran, but the environment still differs from the spec. See remaining.";
            }
        }
        else
        {
            outcome = ApplyOutcome.Applied;
        }

        return new ApplyResult(outcome, execution.Steps, execution.Published, remaining, warnings, code, message);
    }
}
