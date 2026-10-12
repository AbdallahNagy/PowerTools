using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.EarlyBoundGenerator.Tests;

/// <summary>
/// A deterministic organization service that answers the metadata reads ModelBuilder makes for a table
/// filter: RetrieveMetadataChanges for the named tables and the organization base language.
/// Every request is recorded. Nothing reaches a real environment.
/// </summary>
public sealed class FakeMetadataService : IOrganizationService
{
    public List<string> Requests { get; } = [];
    public List<List<string>> RequestedTables { get; } = [];
    public Func<OrganizationRequest, OrganizationResponse>? OnExecute { get; set; }

    public OrganizationResponse Execute(OrganizationRequest request)
    {
        Requests.Add(request.RequestName);
        if (OnExecute is not null) return OnExecute(request);

        if (request is RetrieveMetadataChangesRequest metadata)
        {
            var names = metadata.Query.Criteria.Conditions.Select(condition => (string)condition.Value).ToList();
            RequestedTables.Add(names);
            var entities = new EntityMetadataCollection();
            foreach (var name in names) entities.Add(Table(name));
            var response = new RetrieveMetadataChangesResponse();
            response.Results["EntityMetadata"] = entities;
            response.Results["ServerVersionStamp"] = "1";
            response.Results["DeletedMetadata"] = null;
            return response;
        }

        throw new NotSupportedException($"The fake does not answer {request.RequestName}.");
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        Requests.Add("RetrieveMultiple");
        var organization = new Entity("organization", Guid.NewGuid()) { ["languagecode"] = 1033 };
        return new EntityCollection(new List<Entity> { organization });
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
    public void Update(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();

    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();

    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
        throw new NotSupportedException();

    /// <summary>A table with an id column and a name column, every flag set so the engine can emit it.</summary>
    public static EntityMetadata Table(string logicalName)
    {
        var schemaName = char.ToUpperInvariant(logicalName[0]) + logicalName[1..];
        var table = new EntityMetadata { LogicalName = logicalName, SchemaName = schemaName, MetadataId = Guid.NewGuid() };
        table.DisplayName = Label(schemaName);
        table.DisplayCollectionName = Label(schemaName + "s");
        table.Description = Label("");
        Set(table, nameof(EntityMetadata.ObjectTypeCode), (int?)10_000);
        Set(table, nameof(EntityMetadata.PrimaryIdAttribute), logicalName + "id");
        Set(table, nameof(EntityMetadata.PrimaryNameAttribute), "name");

        var id = new UniqueIdentifierAttributeMetadata { LogicalName = logicalName + "id", SchemaName = schemaName + "Id" };
        Set(id, nameof(AttributeMetadata.AttributeType), (AttributeTypeCode?)AttributeTypeCode.Uniqueidentifier);
        Set(id, nameof(AttributeMetadata.IsPrimaryId), (bool?)true);
        Set(id, nameof(AttributeMetadata.IsValidForCreate), (bool?)true);
        Set(id, nameof(AttributeMetadata.IsValidForRead), (bool?)true);
        Set(id, nameof(AttributeMetadata.IsValidForUpdate), (bool?)false);
        Set(id, nameof(AttributeMetadata.EntityLogicalName), logicalName);
        id.DisplayName = Label("Id");
        id.Description = Label("");

        var name = new StringAttributeMetadata { LogicalName = "name", SchemaName = "Name", MaxLength = 100 };
        Set(name, nameof(AttributeMetadata.IsValidForCreate), (bool?)true);
        Set(name, nameof(AttributeMetadata.IsValidForRead), (bool?)true);
        Set(name, nameof(AttributeMetadata.IsValidForUpdate), (bool?)true);
        Set(name, nameof(AttributeMetadata.EntityLogicalName), logicalName);
        name.DisplayName = Label("Name");
        name.Description = Label("");

        Set(table, nameof(EntityMetadata.Attributes), new AttributeMetadata[] { id, name });
        Set(table, nameof(EntityMetadata.OneToManyRelationships), Array.Empty<OneToManyRelationshipMetadata>());
        Set(table, nameof(EntityMetadata.ManyToOneRelationships), Array.Empty<OneToManyRelationshipMetadata>());
        Set(table, nameof(EntityMetadata.ManyToManyRelationships), Array.Empty<ManyToManyRelationshipMetadata>());

        FillNullables(table);
        FillNullables(id);
        FillNullables(name);
        return table;
    }

    private static Label Label(string text) => new(text, 1033);

    /// <summary>Gives every unset nullable value-type property its default, as the server would.</summary>
    private static void FillNullables(object target)
    {
        foreach (var property in target.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (property.GetIndexParameters().Length > 0) continue;
            var underlying = Nullable.GetUnderlyingType(property.PropertyType);
            if (underlying is null || property.GetValue(target) is not null) continue;
            var value = underlying == typeof(Guid) ? Guid.NewGuid() : Activator.CreateInstance(underlying);
            if (property.GetSetMethod(true) is not null || BackingField(target.GetType(), property.Name) is not null)
            {
                Set(target, property.Name, value);
            }
        }
    }

    private static void Set(object target, string propertyName, object? value)
    {
        var property = target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!;
        var setter = property.GetSetMethod(true);
        if (setter is not null)
        {
            setter.Invoke(target, [value]);
            return;
        }

        var field = BackingField(target.GetType(), propertyName)
            ?? throw new InvalidOperationException($"Cannot set {propertyName}.");
        field.SetValue(target, value);
    }

    private static FieldInfo? BackingField(Type type, string propertyName)
    {
        for (var current = type; current is not null; current = current.BaseType)
        {
            var field = current.GetField("_" + char.ToLowerInvariant(propertyName[0]) + propertyName[1..], BindingFlags.NonPublic | BindingFlags.Instance)
                ?? current.GetField($"<{propertyName}>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance);
            if (field is not null) return field;
        }

        return null;
    }
}
