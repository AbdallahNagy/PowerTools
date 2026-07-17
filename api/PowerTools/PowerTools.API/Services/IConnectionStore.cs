using System.Collections.Concurrent;

namespace PowerTools.API.Services;

public interface IConnectionStore
{
    DataverseConnectionContext? Get(string name);
    void Upsert(string name, DataverseConnectionContext context);
    void Delete(string name);
}

public sealed class InMemoryConnectionStore : IConnectionStore
{
    private readonly ConcurrentDictionary<string, DataverseConnectionContext> connections = new();

    public DataverseConnectionContext? Get(string name) =>
        connections.TryGetValue(name, out var context) ? context : null;

    public void Upsert(string name, DataverseConnectionContext context) =>
        connections[name] = context;

    public void Delete(string name) =>
        connections.TryRemove(name, out _);
}
