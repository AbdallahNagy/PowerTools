using System.ServiceModel;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.CommunityToolApi;

namespace PowerTools.API.CommunityToolApi.Tests;

public sealed class FakeCommunityToolClient : ICommunityToolClient
{
    public List<string> Calls { get; } = [];
    public Exception? Throw { get; set; }

    public Entity? RetrieveResult { get; set; }
    public (string Table, Guid Id, ColumnSet Columns)? LastRetrieve { get; private set; }

    public EntityCollection FetchResult { get; set; } = new();
    public string? LastFetchXml { get; private set; }

    public Guid CreatedId { get; set; } = Guid.NewGuid();
    public Entity? LastCreate { get; private set; }
    public Entity? LastUpdate { get; private set; }
    public (string Table, Guid Id)? LastDelete { get; private set; }
    public (string Table, Guid Id, Relationship Relationship, EntityReferenceCollection Related)? LastRelate { get; private set; }

    public Func<OrganizationRequest, OrganizationResponse> OnExecute { get; set; } = _ => new OrganizationResponse();
    public OrganizationRequest? LastExecute { get; private set; }

    public List<EntityMetadata> Tables { get; } = [];
    public Dictionary<string, EntityMetadata> ByName { get; } = new(StringComparer.OrdinalIgnoreCase);
    public EntityFilters? LastFilters { get; private set; }
    public Dictionary<string, AttributeMetadata> Columns { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken)
    {
        Record(nameof(RetrieveAsync));
        LastRetrieve = (table, id, columns);
        return Task.FromResult(RetrieveResult ?? throw Fault(CommunityToolFaults.ObjectDoesNotExist, "Not found."));
    }

    public Task<EntityCollection> RetrieveMultipleAsync(string fetchXml, CancellationToken cancellationToken)
    {
        Record(nameof(RetrieveMultipleAsync));
        LastFetchXml = fetchXml;
        return Task.FromResult(FetchResult);
    }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken)
    {
        Record(nameof(CreateAsync));
        LastCreate = entity;
        return Task.FromResult(CreatedId);
    }

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken)
    {
        Record(nameof(UpdateAsync));
        LastUpdate = entity;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken)
    {
        Record(nameof(DeleteAsync));
        LastDelete = (table, id);
        return Task.CompletedTask;
    }

    public Task AssociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken)
    {
        Record(nameof(AssociateAsync));
        LastRelate = (table, id, relationship, related);
        return Task.CompletedTask;
    }

    public Task DisassociateAsync(string table, Guid id, Relationship relationship, EntityReferenceCollection related, CancellationToken cancellationToken)
    {
        Record(nameof(DisassociateAsync));
        LastRelate = (table, id, relationship, related);
        return Task.CompletedTask;
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Record(nameof(ExecuteAsync));
        LastExecute = request;
        return Task.FromResult(OnExecute(request));
    }

    public Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken)
    {
        Record(nameof(RetrieveAllTablesAsync));
        return Task.FromResult<IReadOnlyList<EntityMetadata>>(Tables);
    }

    public Task<EntityMetadata> RetrieveTableAsync(string logicalName, EntityFilters filters, CancellationToken cancellationToken)
    {
        Record(nameof(RetrieveTableAsync));
        LastFilters = filters;
        return ByName.TryGetValue(logicalName, out var table)
            ? Task.FromResult(table)
            : throw Fault(CommunityToolFaults.ObjectDoesNotExist, $"Could not find entity '{logicalName}'.");
    }

    public Task<AttributeMetadata> RetrieveColumnAsync(string table, string column, CancellationToken cancellationToken)
    {
        Record(nameof(RetrieveColumnAsync));
        return Columns.TryGetValue($"{table}.{column}", out var attribute)
            ? Task.FromResult(attribute)
            : throw Fault(CommunityToolFaults.ObjectDoesNotExist, $"Could not find attribute '{column}'.");
    }

    private void Record(string call)
    {
        Calls.Add(call);
        if (Throw is not null)
            throw Throw;
    }

    public static FaultException<OrganizationServiceFault> Fault(int code, string message) =>
        new(new OrganizationServiceFault { ErrorCode = code, Message = message }, message);
}

internal static class Json
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    public static T Body<T>(string json) => JsonSerializer.Deserialize<T>(json, Web)!;

    public static JsonElement Element(string json) => JsonDocument.Parse(json).RootElement.Clone();

    public static string Serialize(object? value) => JsonSerializer.Serialize(value, Web);

    /// <summary>Compact form of a JSON literal, for comparing serialized output.</summary>
    public static string Compact(string json) => JsonSerializer.Serialize(Element(json));
}

internal static class Builders
{
    public static Label Text(string text) => new(new LocalizedLabel(text, 1033), new[] { new LocalizedLabel(text, 1033) });

    public static EntityMetadata Table(string logicalName, string? display = null)
    {
        var table = new EntityMetadata { LogicalName = logicalName, SchemaName = logicalName, EntitySetName = logicalName + "s" };
        if (display is not null)
            table.DisplayName = Text(display);
        SetInternal(table, nameof(EntityMetadata.PrimaryIdAttribute), logicalName + "id");
        SetInternal(table, nameof(EntityMetadata.PrimaryNameAttribute), "name");
        SetInternal(table, nameof(EntityMetadata.IsPrivate), false);
        return table;
    }

    public static T Attribute<T>(T attribute, string logicalName, string? display = null) where T : AttributeMetadata
    {
        attribute.LogicalName = logicalName;
        attribute.SchemaName = logicalName;
        if (display is not null)
            attribute.DisplayName = Text(display);
        return attribute;
    }

    public static void SetInternal(object target, string property, object? value)
    {
        for (var type = target.GetType(); type is not null; type = type.BaseType)
        {
            var info = type.GetProperty(
                property,
                System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.DeclaredOnly);
            if (info?.SetMethod is not null)
            {
                info.SetValue(target, value);
                return;
            }
        }

        throw new InvalidOperationException($"No setter for {property}.");
    }
}
