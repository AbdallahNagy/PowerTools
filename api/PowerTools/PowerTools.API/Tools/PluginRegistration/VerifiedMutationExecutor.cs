using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public interface IVerifiedMutationExecutor
{
    Task<MutationExecutionResultDto> ExecuteAsync(
        Func<CancellationToken, Task> mutateOnce,
        Func<CancellationToken, Task<MutationReconciliationResult>> reconcile,
        Func<CancellationToken, Task<bool>> verify,
        CancellationToken cancellationToken);
}

public enum MutationReconciliationEvidence
{
    Succeeded,
    Rejected,
    Contradictory,
    Insufficient
}

public sealed record MutationReconciliationResult(MutationReconciliationEvidence Evidence)
{
    public static MutationReconciliationResult Succeeded() => new(MutationReconciliationEvidence.Succeeded);
    public static MutationReconciliationResult Rejected() => new(MutationReconciliationEvidence.Rejected);
    public static MutationReconciliationResult Contradictory() => new(MutationReconciliationEvidence.Contradictory);
    public static MutationReconciliationResult Insufficient() => new(MutationReconciliationEvidence.Insufficient);
}

public sealed class VerifiedMutationExecutor(TimeSpan? reconciliationTimeout = null) : IVerifiedMutationExecutor
{
    private readonly TimeSpan reconciliationTimeout = reconciliationTimeout ?? TimeSpan.FromSeconds(10);

    public async Task<MutationExecutionResultDto> ExecuteAsync(
        Func<CancellationToken, Task> mutateOnce,
        Func<CancellationToken, Task<MutationReconciliationResult>> reconcile,
        Func<CancellationToken, Task<bool>> verify,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mutateOnce);
        ArgumentNullException.ThrowIfNull(reconcile);
        ArgumentNullException.ThrowIfNull(verify);

        if (cancellationToken.IsCancellationRequested)
            return Result("rejectedBeforeCompletion");

        try
        {
            await mutateOnce(cancellationToken);
        }
        catch (Exception exception) when (IsCommunicationFailure(exception))
        {
            return await ReconcileAsync(reconcile, verify);
        }
        catch (Exception exception)
        {
            var mapped = PluginRegistrationProblem.FromException(exception, "Dataverse environment");
            return Result("rejectedBeforeCompletion", mapped.Problem);
        }

        try
        {
            return await verify(cancellationToken)
                ? Result("succeededAndVerified")
                : Result("outcomeUncertain");
        }
        catch
        {
            return Result("outcomeUncertain");
        }
    }

    private async Task<MutationExecutionResultDto> ReconcileAsync(
        Func<CancellationToken, Task<MutationReconciliationResult>> reconcile,
        Func<CancellationToken, Task<bool>> verify)
    {
        using var timeout = new CancellationTokenSource(reconciliationTimeout);
        try
        {
            var evidence = await reconcile(timeout.Token);
            if (evidence.Evidence == MutationReconciliationEvidence.Rejected)
                return Result("rejectedBeforeCompletion");
            if (evidence.Evidence != MutationReconciliationEvidence.Succeeded)
                return Result("outcomeUncertain");
            return await verify(timeout.Token)
                ? Result("reconciledAfterCommunicationFailure")
                : Result("outcomeUncertain");
        }
        catch
        {
            return Result("outcomeUncertain");
        }
    }

    private static bool IsCommunicationFailure(Exception exception) => exception switch
    {
        HttpRequestException { StatusCode: System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden } => false,
        HttpRequestException or TimeoutException or TaskCanceledException => true,
        _ => false
    };

    private static MutationExecutionResultDto Result(string outcome, PluginRegistrationProblemDto? problem = null) => outcome switch
    {
        "outcomeUncertain" => new(outcome, null, new PluginRegistrationProblemDto(
            "verification", "outcome-uncertain",
            "The mutation response could not be reconciled with the current Dataverse state.",
            "Dataverse environment", null, null,
            "Refresh and inspect before trying again.")),
        "rejectedBeforeCompletion" when problem is not null => new(outcome, null, problem),
        "rejectedBeforeCompletion" => new(outcome, null, new PluginRegistrationProblemDto(
            "validation", "rejected-before-completion",
            "The mutation was rejected before completion.",
            "Dataverse environment", null, null,
            "Refresh the registration and create a new preview.")),
        _ => new(outcome, null)
    };
}
