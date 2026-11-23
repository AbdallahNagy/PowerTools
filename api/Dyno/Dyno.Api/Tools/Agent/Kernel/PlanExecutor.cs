using Microsoft.Xrm.Sdk;

namespace Dyno.Api.Tools.Agent.Kernel;

/// <summary>What the executor did with a plan, before verification.</summary>
public sealed record Execution(
    IReadOnlyList<StepResult> Steps,
    IReadOnlyList<string> Published,
    IReadOnlyList<string> Warnings,
    string? StopCode,
    string? StopMessage)
{
    public int Done => Steps.Count(step => step.Status == StepStatus.Done);

    public bool Stopped => StopCode is not null;
}

/// <summary>
/// Runs a plan's steps in order. Each request gets SolutionUniqueName and goes through the retry policy. It stops at
/// the first step that fails or cannot run and never rolls back, then publishes exactly what the done steps touched.
/// </summary>
public sealed class PlanExecutor(IAgentClient client, RetryPolicy retry, string connectionKey)
{
    public async Task<Execution> RunAsync(Plan plan, string? solution, CancellationToken ct)
    {
        var results = new List<StepResult>(plan.Steps.Count);
        var touched = new List<PublishTarget>();
        string? stopCode = null;
        string? stopMessage = null;

        foreach (var step in plan.Steps)
        {
            if (stopCode is not null)
            {
                results.Add(new StepResult(step.Op, step.Target, StepStatus.NotRun));
                continue;
            }

            if (step.Kind != PlanStepKind.Run)
            {
                var reason = step.Reason ?? "This step cannot run on this environment.";
                stopMessage = step.Route is null ? reason : $"{reason} Instead: {step.Route}";
                stopCode = step.Kind == PlanStepKind.Unsupported ? ApplyResult.NotSupportedCode : AgentFaults.InvalidRequestCode;
                results.Add(new StepResult(step.Op, step.Target, StepStatus.Unsupported, stopMessage));
                continue;
            }

            try
            {
                var ids = await RunStepAsync(step, solution, ct);
                results.Add(new StepResult(step.Op, step.Target, StepStatus.Done, Ids: ids.Count > 0 ? ids : null));
                touched.AddRange(step.Publishes);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                var problem = AgentFaults.From(ex);
                stopCode = problem.Code;
                stopMessage = problem.Message;
                results.Add(new StepResult(step.Op, step.Target, StepStatus.Failed, problem.Message, problem.DataverseCode));
            }
        }

        var warnings = new List<string>();
        var published = new List<string>();
        if (Publisher.Build(touched) is { } publish)
        {
            try
            {
                // Dataverse refuses a second publish or import on one environment; queue ours behind each other.
                using (await Locks.HoldAsync(Locks.PublishKey(connectionKey), ct))
                    await retry.RunAsync(token => client.ExecuteAsync(publish, token), ct);
                published.AddRange(Publisher.Names(touched));
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                warnings.Add($"The changes were made but not published: {AgentFaults.From(ex).Message}");
            }
        }

        return new Execution(results, published, warnings, stopCode, stopMessage);
    }

    /// <summary>Runs one step and answers the ids it created.</summary>
    private async Task<IReadOnlyList<string>> RunStepAsync(PlanStep step, string? solution, CancellationToken ct)
    {
        if (step.Action is not null)
        {
            var context = new StepContext(client, step.SolutionAware ? solution : null);
            await retry.RunAsync(token => step.Action(context, token), ct);
            return context.Ids;
        }

        if (step.Request is null)
            throw new InvalidOperationException($"Step {step.Op} {step.Target} has nothing to run.");

        var request = step.Request;
        if (step.SolutionAware && !string.IsNullOrWhiteSpace(solution))
            request.Parameters["SolutionUniqueName"] = solution;
        var response = await retry.RunAsync(token => client.ExecuteAsync(request, token), ct);
        return CreatedIds(response);
    }

    /// <summary>The ids a create, an upsert or a transaction of them made.</summary>
    internal static IReadOnlyList<string> CreatedIds(OrganizationResponse? response) => response switch
    {
        Microsoft.Xrm.Sdk.Messages.CreateResponse created => [created.id.ToString("D")],
        Microsoft.Xrm.Sdk.Messages.UpsertResponse upserted when upserted.Target is not null => [upserted.Target.Id.ToString("D")],
        Microsoft.Xrm.Sdk.Messages.ExecuteTransactionResponse batch => batch.Responses.SelectMany(CreatedIds).ToList(),
        _ => [],
    };
}
