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

    /// <summary>
    /// The spec verification plans with after the steps ran. Normally the same spec; a family whose spec asks to run
    /// a step even when nothing differs (a forced re-import) answers the spec without that request.
    /// </summary>
    IApplySpec ForVerification(IApplySpec spec) => spec;

    /// <summary>
    /// False for a family whose steps are not safe to run twice (record creates and updates). Its plan cannot be made
    /// again to find what is left, so after a partial run the remaining steps are the ones that did not run.
    /// </summary>
    bool Idempotent => true;
}

public sealed class ApplyFamily<TSpec>(
    string name, IComponentPlanner<TSpec> planner, Func<TSpec, TSpec>? forVerification = null, bool idempotent = true) : IApplyFamily
    where TSpec : class, IApplySpec
{
    public string Name => name;

    public bool Idempotent => idempotent;

    public IApplySpec ForVerification(IApplySpec spec) => forVerification is null ? spec : forVerification((TSpec)spec);

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
        if (!family.Idempotent) return CombineNotIdempotent(plan, execution);
        var verification = await family.PlanAsync(family.ForVerification(spec), newContext(), ct);
        return Combine(plan, execution, verification);
    }

    /// <summary>
    /// For a family whose steps must not run twice: what remains is exactly the steps that did not finish, so sending
    /// the whole spec again would repeat the done ones. The result says so.
    /// </summary>
    public static ApplyResult CombineNotIdempotent(Plan plan, Execution execution)
    {
        var left = plan.Steps.Where((_, i) => i >= execution.Steps.Count || execution.Steps[i].Status != StepStatus.Done).ToList();
        var result = Combine(plan, execution, new Plan(left));
        if (result.Outcome != ApplyOutcome.PartlyApplied) return result;
        return result with
        {
            Warnings = [.. result.Warnings,
                "The done steps already ran and are not safe to run again. Send only the operations listed in remaining, not the whole spec."],
        };
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
