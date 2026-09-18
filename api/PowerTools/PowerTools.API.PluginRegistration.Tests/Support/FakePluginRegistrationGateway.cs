using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Gateway;

namespace PowerTools.API.PluginRegistration.Tests.Support;

public sealed class FakePluginRegistrationGateway : IPluginRegistrationGateway
{
    public List<Entity> Created { get; } = [];
    public List<Entity> Updated { get; } = [];
    public List<(string EntityName, Guid Id)> Deleted { get; } = [];
    public List<OrganizationRequest> Executed { get; } = [];

    public Dictionary<string, List<Entity>> RetrieveAllByEntity { get; } =
        new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<(string LogicalName, Guid Id), Entity> Records { get; } = [];

    public Func<QueryExpression, IReadOnlyList<Entity>>? RetrieveAllHandler { get; set; }
    public Func<OrganizationRequest, OrganizationResponse>? ExecuteHandler { get; set; }
    public Exception? NextCreateException { get; set; }

    public Task<IReadOnlyList<Entity>> RetrieveAllAsync(
        QueryExpression query,
        CancellationToken ct)
    {
        if (RetrieveAllHandler is not null)
            return Task.FromResult(RetrieveAllHandler(query));

        if (RetrieveAllByEntity.TryGetValue(query.EntityName, out var list))
            return Task.FromResult<IReadOnlyList<Entity>>(list);

        return Task.FromResult<IReadOnlyList<Entity>>([]);
    }

    public Task<Entity?> RetrieveAsync(
        string entityName,
        Guid id,
        ColumnSet columns,
        CancellationToken ct)
    {
        Records.TryGetValue((entityName, id), out var entity);
        return Task.FromResult(entity);
    }

    public Func<Entity, Exception?>? CreateError { get; set; }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken ct)
    {
        if (CreateError?.Invoke(entity) is Exception error)
            throw error;
        if (NextCreateException is not null)
        {
            var exception = NextCreateException;
            NextCreateException = null;
            throw exception;
        }

        var id = entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id;
        entity.Id = id;
        Created.Add(Clone(entity));
        Store(entity);
        return Task.FromResult(id);
    }

    public Task UpdateAsync(Entity entity, CancellationToken ct)
    {
        Updated.Add(Clone(entity));
        if (Records.TryGetValue((entity.LogicalName, entity.Id), out var existing))
        {
            foreach (var attribute in entity.Attributes)
                existing[attribute.Key] = attribute.Value;
            Store(existing);
        }
        else
        {
            Store(entity);
        }
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string entityName, Guid id, CancellationToken ct)
    {
        Deleted.Add((entityName, id));
        Records.Remove((entityName, id));
        if (RetrieveAllByEntity.TryGetValue(entityName, out var list))
            list.RemoveAll(item => item.Id == id);
        return Task.CompletedTask;
    }

    public Task<OrganizationResponse> ExecuteAsync(
        OrganizationRequest request,
        CancellationToken ct)
    {
        Executed.Add(request);
        if (ExecuteHandler is not null)
            return Task.FromResult(ExecuteHandler(request));
        return Task.FromResult(new OrganizationResponse());
    }

    public void Seed(Entity entity)
    {
        if (entity.Id == Guid.Empty)
            entity.Id = Guid.NewGuid();
        Store(entity);
    }

    private static Entity Clone(Entity entity)
    {
        var clone = new Entity(entity.LogicalName, entity.Id);
        foreach (var attribute in entity.Attributes)
            clone[attribute.Key] = attribute.Value;
        return clone;
    }

    private void Store(Entity entity)
    {
        Records[(entity.LogicalName, entity.Id)] = entity;
        if (!RetrieveAllByEntity.TryGetValue(entity.LogicalName, out var list))
        {
            list = [];
            RetrieveAllByEntity[entity.LogicalName] = list;
        }

        var index = list.FindIndex(item => item.Id == entity.Id);
        if (index >= 0)
            list[index] = entity;
        else
            list.Add(entity);
    }
}
