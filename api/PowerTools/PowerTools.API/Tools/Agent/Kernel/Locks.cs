using System.Collections.Concurrent;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// In-process locks for agent edits. A component lock serializes edits of one component (keys such as
/// "record:{id}" or "entity:account"); the publish lock serializes publishes and imports on one connection,
/// because Dataverse refuses a second one while one runs. The sidecar is one process, so this is enough inside
/// Power Tools; changes from outside are caught by the plan hash check.
/// </summary>
public static class Locks
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Gates = new(StringComparer.Ordinal);

    /// <summary>The key <see cref="EditLock"/> uses for a record, so kernel and older routes share one lock.</summary>
    public static string RecordKey(Guid id) => $"record:{id:D}";

    public static string PublishKey(string connectionKey) => $"publish:{connectionKey}";

    public static async Task<IDisposable> HoldAsync(string key, CancellationToken ct)
    {
        var gate = Gates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        return new Release([gate]);
    }

    /// <summary>
    /// Takes every key, in ordinal order so two calls that share keys cannot deadlock, or none of them.
    /// Answers null when <paramref name="timeout"/> passes first.
    /// </summary>
    public static async Task<IDisposable?> TryHoldAllAsync(IEnumerable<string> keys, TimeSpan timeout, CancellationToken ct)
    {
        var ordered = keys.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
        var taken = new List<SemaphoreSlim>(ordered.Count);
        var deadline = DateTime.UtcNow + timeout;
        try
        {
            foreach (var key in ordered)
            {
                var gate = Gates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
                var left = deadline - DateTime.UtcNow;
                if (left < TimeSpan.Zero || !await gate.WaitAsync(left, ct))
                {
                    new Release(taken).Dispose();
                    return null;
                }

                taken.Add(gate);
            }
        }
        catch
        {
            new Release(taken).Dispose();
            throw;
        }

        return new Release(taken);
    }

    private sealed class Release(IReadOnlyList<SemaphoreSlim> gates) : IDisposable
    {
        private int released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref released, 1) != 0) return;
            for (var i = gates.Count - 1; i >= 0; i--) gates[i].Release();
        }
    }
}
