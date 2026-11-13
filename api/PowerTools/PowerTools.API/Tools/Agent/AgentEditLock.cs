using System.Collections.Concurrent;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// Serializes read-modify-write edits of one form or view. Each edit reads the whole XML and writes it back, so two
/// edits of the same record at once would lose one of them. Records are keyed by id; the sidecar is one process.
/// </summary>
public static class EditLock
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    public static async Task<IDisposable> HoldAsync(Guid id, CancellationToken ct)
    {
        var gate = Locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        return new Release(gate);
    }

    private sealed class Release(SemaphoreSlim gate) : IDisposable
    {
        private int released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref released, 1) == 0) gate.Release();
        }
    }
}
