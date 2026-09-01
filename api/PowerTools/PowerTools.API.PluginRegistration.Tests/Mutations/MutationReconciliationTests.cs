using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Mutations;

public sealed class MutationReconciliationTests
{
    [Theory]
    [InlineData("assembly register")]
    [InlineData("assembly update")]
    [InlineData("step state/update")]
    [InlineData("image update/delete")]
    [InlineData("workflow metadata update")]
    [InlineData("cascade absence")]
    public async Task Operation_specific_contradictory_readback_returns_safe_uncertain_guidance(string operation)
    {
        var executor = new VerifiedMutationExecutor(TimeSpan.FromSeconds(1));

        var result = await executor.ExecuteAsync(
            _ => throw new HttpRequestException($"lost response for {operation}"),
            _ => Task.FromResult(MutationReconciliationResult.Contradictory()),
            _ => Task.FromResult(false), default);

        Assert.Equal("outcomeUncertain", result.Outcome);
        Assert.Equal("verification", result.Problem?.Category);
        Assert.Equal("outcome-uncertain", result.Problem?.Code);
        Assert.Equal("Refresh and inspect before trying again.", result.Problem?.SuggestedAction);
        Assert.DoesNotContain(operation, result.Problem?.Message ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }
}
