using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Kernel;

public sealed class RetryAndLockTests
{
    private static FaultException<OrganizationServiceFault> Fault(int code, object? retryAfter = null)
    {
        var detail = new OrganizationServiceFault { ErrorCode = code, Message = "fault" };
        if (retryAfter is not null) detail.ErrorDetails["Retry-After"] = retryAfter;
        return new FaultException<OrganizationServiceFault>(detail, "fault");
    }

    [Fact]
    public async Task Throttling_waits_for_retry_after_and_tries_again()
    {
        var waits = new List<TimeSpan>();
        var policy = new RetryPolicy((wait, _) => { waits.Add(wait); return Task.CompletedTask; });
        var calls = 0;

        var value = await policy.RunAsync(_ =>
        {
            calls++;
            if (calls == 1) throw Fault(-2147015902, TimeSpan.FromSeconds(7));
            return Task.FromResult(42);
        }, CancellationToken.None);

        Assert.Equal(42, value);
        Assert.Equal([TimeSpan.FromSeconds(7)], waits);
    }

    [Theory]
    [InlineData("30", 30)]
    [InlineData("00:00:12", 12)]
    public void Retry_after_text_is_read_as_seconds_or_a_time_span(string retryAfter, int expectedSeconds)
    {
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), RetryPolicy.RetryDelay(Fault(-2147015902, retryAfter), 1));
    }

    [Fact]
    public async Task Customization_lock_is_retried_with_backoff()
    {
        var policy = new RetryPolicy((_, _) => Task.CompletedTask);
        var calls = 0;

        await policy.RunAsync(_ =>
        {
            if (++calls < 3) throw Fault(unchecked((int)0x8004F064));
            return Task.CompletedTask;
        }, CancellationToken.None);

        Assert.Equal(3, calls);
    }

    [Fact]
    public async Task Other_faults_and_timeouts_are_not_retried_because_the_request_may_have_run()
    {
        var policy = new RetryPolicy((_, _) => Task.CompletedTask);
        var calls = 0;

        await Assert.ThrowsAsync<FaultException<OrganizationServiceFault>>(() =>
            policy.RunAsync(_ => { calls++; throw Fault(-2147220891); }, CancellationToken.None));
        await Assert.ThrowsAsync<TimeoutException>(() =>
            policy.RunAsync(_ => { calls++; throw new TimeoutException(); }, CancellationToken.None));

        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Retries_stop_after_the_last_attempt()
    {
        var policy = new RetryPolicy((_, _) => Task.CompletedTask, maxAttempts: 3);
        var calls = 0;

        await Assert.ThrowsAsync<FaultException<OrganizationServiceFault>>(() =>
            policy.RunAsync(_ => { calls++; throw Fault(-2147015902); }, CancellationToken.None));

        Assert.Equal(3, calls);
    }

    [Fact]
    public async Task Locks_are_taken_all_or_none_and_time_out()
    {
        var key = $"test:{Guid.NewGuid()}";
        using (var first = await Locks.TryHoldAllAsync([key, $"{key}:b"], TimeSpan.FromSeconds(1), CancellationToken.None))
        {
            Assert.NotNull(first);
            var second = await Locks.TryHoldAllAsync([$"{key}:a", key], TimeSpan.FromMilliseconds(50), CancellationToken.None);
            Assert.Null(second);
        }

        // The failed attempt released ":a", and the first holder released everything.
        using var again = await Locks.TryHoldAllAsync([$"{key}:a", key], TimeSpan.FromSeconds(1), CancellationToken.None);
        Assert.NotNull(again);
    }

    [Fact]
    public async Task Edit_lock_and_kernel_record_lock_are_the_same_lock()
    {
        var id = Guid.NewGuid();
        using (await PowerTools.API.Tools.Agent.EditLock.HoldAsync(id, CancellationToken.None))
        {
            Assert.Null(await Locks.TryHoldAllAsync([Locks.RecordKey(id)], TimeSpan.FromMilliseconds(30), CancellationToken.None));
        }
    }
}
