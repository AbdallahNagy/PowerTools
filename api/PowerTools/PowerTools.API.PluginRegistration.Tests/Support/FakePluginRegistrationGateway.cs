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

    public Task<Guid> CreateAsync(Entity entity, CancellationToken ct)
    {
        if (NextCreateException is not null)
        {
            var exception = NextCreateException;
            NextCreateException = null;
            throw exception;
        }

        var id = entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id;
        entity.Id = id;
        Created.Add(entity);
        Store(entity);
        return Task.FromResult(id);
    }

    public Task UpdateAsync(Entity entity, CancellationToken ct)
    {
        Updated.Add(entity);
        Store(entity);
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
