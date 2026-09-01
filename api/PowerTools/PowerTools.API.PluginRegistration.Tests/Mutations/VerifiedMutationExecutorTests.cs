using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Mutations;

public sealed class VerifiedMutationExecutorTests
{
    [Fact]
    public async Task Validation_failure_is_rejected_without_reconciliation()
    {
        var reconciliations = 0;
        var result = await Executor().ExecuteAsync(
            _ => throw new ArgumentException("invalid"),
            _ => { reconciliations++; return Task.FromResult(MutationReconciliationResult.Insufficient()); },
            _ => Task.FromResult(true), default);

        Assert.Equal("rejectedBeforeCompletion", result.Outcome);
        Assert.Equal(0, reconciliations);
    }

    [Fact]
    public async Task Ordinary_success_requires_readback_verification()
    {
        var mutations = 0;
        var verifications = 0;
        var result = await Executor().ExecuteAsync(
            _ => { mutations++; return Task.CompletedTask; },
            _ => Task.FromResult(MutationReconciliationResult.Insufficient()),
            _ => { verifications++; return Task.FromResult(true); }, default);

        Assert.Equal("succeededAndVerified", result.Outcome);
        Assert.Equal(1, mutations);
        Assert.Equal(1, verifications);
    }

    [Fact]
    public async Task Cancellation_before_send_does_not_invoke_mutation()
    {
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var mutations = 0;

        var result = await Executor().ExecuteAsync(
            _ => { mutations++; return Task.CompletedTask; },
            _ => Task.FromResult(MutationReconciliationResult.Insufficient()),
            _ => Task.FromResult(true), cancelled.Token);

        Assert.Equal("rejectedBeforeCompletion", result.Outcome);
        Assert.Equal(0, mutations);
    }

    [Fact]
    public async Task Timeout_after_send_reconciles_without_request_aborted_token()
    {
        using var cancelled = new CancellationTokenSource();
        CancellationToken reconciliationToken = cancelled.Token;

        var result = await Executor().ExecuteAsync(
            _ => { cancelled.Cancel(); throw new TimeoutException("response lost"); },
            token => { reconciliationToken = token; return Task.FromResult(MutationReconciliationResult.Succeeded()); },
            _ => Task.FromResult(true), cancelled.Token);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
        Assert.False(reconciliationToken.IsCancellationRequested);
    }

    [Fact]
    public async Task Communication_failure_reconciles_proven_success()
    {
        var result = await Executor().ExecuteAsync(
            _ => throw new HttpRequestException("response lost"),
            _ => Task.FromResult(MutationReconciliationResult.Succeeded()),
            _ => Task.FromResult(true), default);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
    }

    [Fact]
    public async Task Communication_failure_reconciles_proven_rejection()
    {
        var result = await Executor().ExecuteAsync(
            _ => throw new HttpRequestException("request rejected before execution"),
            _ => Task.FromResult(MutationReconciliationResult.Rejected()),
            _ => Task.FromResult(false), default);

        Assert.Equal("rejectedBeforeCompletion", result.Outcome);
    }

    [Fact]
    public async Task Contradictory_readback_is_uncertain()
    {
        var result = await Executor().ExecuteAsync(
            _ => throw new HttpRequestException("response lost"),
            _ => Task.FromResult(MutationReconciliationResult.Contradictory()),
            _ => Task.FromResult(true), default);

        Assert.Equal("outcomeUncertain", result.Outcome);
    }

    [Fact]
    public async Task Mutation_delegate_is_never_called_a_second_time()
    {
        var mutations = 0;
        var result = await Executor().ExecuteAsync(
            _ => { mutations++; throw new HttpRequestException("response lost"); },
            _ => Task.FromResult(MutationReconciliationResult.Insufficient()),
            _ => Task.FromResult(false), default);

        Assert.Equal("outcomeUncertain", result.Outcome);
        Assert.Equal(1, mutations);
    }

    private static VerifiedMutationExecutor Executor() => new(TimeSpan.FromSeconds(1));
}
