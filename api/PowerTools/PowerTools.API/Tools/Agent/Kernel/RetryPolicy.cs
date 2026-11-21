using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.CommunityToolApi;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// The one retry policy for every write the kernel sends, online and on-premises alike. It retries only faults
/// where Dataverse did not run the request: service protection limits (online 429s, with Retry-After) and the
/// customization lock (another publish, import or solution operation is running). A timeout is not retried,
/// because the request may have run; the call reports where it stopped and the next plan shows what is left.
/// </summary>
public sealed class RetryPolicy(Func<TimeSpan, CancellationToken, Task>? delay = null, int maxAttempts = 5, TimeSpan? maxWait = null)
{
    private readonly Func<TimeSpan, CancellationToken, Task> delay = delay ?? Task.Delay;
    private readonly TimeSpan maxWait = maxWait ?? TimeSpan.FromMinutes(2);

    /// <summary>0x8004F061..0x8004F067 CustomizationLockEx_*, 0x80071151 SolutionConcurrencyFailure.</summary>
    public static readonly IReadOnlySet<int> CustomizationLockCodes = new HashSet<int>
    {
        unchecked((int)0x8004F061), unchecked((int)0x8004F062), unchecked((int)0x8004F063),
        unchecked((int)0x8004F064), unchecked((int)0x8004F067), unchecked((int)0x80071151),
    };

    public static readonly IReadOnlySet<int> ServiceProtectionCodes = new HashSet<int>
    {
        CommunityToolFaults.NumberOfRequestsLimitExceeded,
        CommunityToolFaults.TimeLimitExceeded,
        CommunityToolFaults.ConcurrencyLimitExceeded,
    };

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct)
    {
        var waited = TimeSpan.Zero;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await work(ct);
            }
            catch (Exception ex) when (attempt < maxAttempts && RetryDelay(ex, attempt) is { } wait && waited + wait <= maxWait)
            {
                waited += wait;
                await delay(wait, ct);
            }
        }
    }

    public Task RunAsync(Func<CancellationToken, Task> work, CancellationToken ct) =>
        RunAsync(async token =>
        {
            await work(token);
            return true;
        }, ct);

    /// <summary>How long to wait before trying again, or null when the failure is not worth retrying.</summary>
    public static TimeSpan? RetryDelay(Exception exception, int attempt)
    {
        var fault = FindFault(exception);
        if (fault is null) return null;
        var code = fault.ErrorCode;
        if (ServiceProtectionCodes.Contains(code))
        {
            if (fault.ErrorDetails is { } details
                && details.TryGetValue("Retry-After", out var value)
                && value is not null)
            {
                // Seconds first: TimeSpan.TryParse reads a bare "30" as 30 days.
                if (value is TimeSpan span) return span;
                var text = value.ToString();
                if (double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var seconds))
                    return TimeSpan.FromSeconds(seconds);
                if (TimeSpan.TryParse(text, System.Globalization.CultureInfo.InvariantCulture, out var parsed)) return parsed;
            }

            return Backoff(attempt);
        }

        return CustomizationLockCodes.Contains(code) ? Backoff(attempt) * 2 : null;
    }

    private static TimeSpan Backoff(int attempt) => TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, attempt)));

    public static OrganizationServiceFault? FindFault(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault) return fault.Detail;
        }

        return null;
    }
}
