using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent;

/// <summary>
/// Serializes read-modify-write edits of one form or view. Each edit reads the whole XML and writes it back, so two
/// edits of the same record at once would lose one of them. Shares its lock with the kernel's <see cref="Locks"/>.
/// </summary>
public static class EditLock
{
    public static Task<IDisposable> HoldAsync(Guid id, CancellationToken ct) => Locks.HoldAsync(Locks.RecordKey(id), ct);
}
