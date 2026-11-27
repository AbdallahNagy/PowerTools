using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tests.Tools.Agent.Kernel;
using Dyno.Api.Tools.Agent.Components.Tables;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

/// <summary>
/// An in-memory Dataverse schema behind the fake client. Metadata messages read and change it the way Dataverse does,
/// so a plan can be applied and planned again: after an apply the plan must be empty.
/// </summary>
internal sealed class SchemaWorld
{
    public const int English = 1033;
    public const int German = 1031;

    public Dictionary<string, EntityMetadata> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<string, OptionSetMetadata> GlobalChoices { get; } = new(StringComparer.OrdinalIgnoreCase);

    public FakeAgentClient Client { get; }

    /// <summary>The status a key reports when it is read after being created or reactivated.</summary>
    public EntityKeyIndexStatus KeyBuildsTo { get; set; } = EntityKeyIndexStatus.Active;

    public bool FileStorage { get; set; } = true;

    /// <summary>Throw from this to make a write fail.</summary>
    public Func<OrganizationRequest, Exception?>? Fail { get; set; }

    public SchemaWorld()
    {
        Client = Data.Client();
        Client.OnExecute = Handle;
    }

    /// <summary>The requests that change metadata, in the order they were sent.</summary>
    public List<OrganizationRequest> Writes =>
        Client.Executed.Where(r => !r.RequestName.StartsWith("Retrieve", StringComparison.Ordinal)).ToList();

    public Capabilities Capabilities() =>
        new("9.2", FileStorage ? new HashSet<string> { TablePlanner.FileStorageTable } : new HashSet<string>(), ExportSolutionAsync: false);

    public PlanContext Context() => new(Client, Capabilities(), "https://world.crm.dynamics.com");

    public ApplyKernel Kernel(TablePlanner? planner = null) => new(
        new ApplyFamily<TableApplySpec>(TablePlanner.Family, planner ?? Planner()),
        Context,
        new KernelOptions(TimeSpan.FromSeconds(5), KernelFakes.NoWaitRetry()));

    public static TablePlanner Planner() => new((_, _) => Task.CompletedTask, TimeSpan.FromSeconds(1));

    public Task<Plan> PlanAsync(TableApplySpec spec, TablePlanner? planner = null) =>
        (planner ?? Planner()).PlanAsync(spec, Context(), CancellationToken.None);

    public async Task<ApplyResult> ApplyAsync(TableApplySpec spec)
    {
        var kernel = Kernel();
        var preview = await kernel.PlanAsync(spec, CancellationToken.None);
        return await kernel.ApplyAsync(spec, preview.Hash, CancellationToken.None);
    }

    // ── Building a starting state ────────────────────────────────────────────

    public EntityMetadata AddTable(string schemaName, string display = "Project", string plural = "Projects", bool user = true, string? primary = null)
    {
        var logical = schemaName.ToLowerInvariant();
        var primaryName = (primary ?? $"{logical.Split('_')[0]}_name").ToLowerInvariant();
        var table = new EntityMetadata
        {
            SchemaName = schemaName,
            LogicalName = logical,
            DisplayName = new Label(display, English),
            DisplayCollectionName = new Label(plural, English),
            Description = new Label("", English),
            OwnershipType = user ? OwnershipTypes.UserOwned : OwnershipTypes.OrganizationOwned,
            IsAuditEnabled = new BooleanManagedProperty(false),
            ChangeTrackingEnabled = false,
            IsCustomizable = new BooleanManagedProperty(true),
            IsRenameable = new BooleanManagedProperty(true),
            CanChangeTrackingBeEnabled = new BooleanManagedProperty(true),
        };
        Set(table, "PrimaryIdAttribute", logical + "id");
        Set(table, "PrimaryNameAttribute", primaryName);
        Set(table, "IsManaged", false);
        Set(table, "IsCustomEntity", true);
        Set(table, "HasNotes", false);
        Set(table, "HasActivities", false);
        Set(table, "Attributes", Array.Empty<AttributeMetadata>());
        Set(table, "Keys", Array.Empty<EntityKeyMetadata>());
        Set(table, "ManyToManyRelationships", Array.Empty<ManyToManyRelationshipMetadata>());
        Set(table, "OneToManyRelationships", Array.Empty<OneToManyRelationshipMetadata>());
        Set(table, "ManyToOneRelationships", Array.Empty<OneToManyRelationshipMetadata>());
        Tables[logical] = table;

        var id = new UniqueIdentifierAttributeMetadata { SchemaName = schemaName + "Id", LogicalName = logical + "id", DisplayName = new Label(display, English) };
        Set(id, "IsPrimaryId", true);
        AddColumn(logical, id);
        AddColumn(logical, new StringAttributeMetadata
        {
            SchemaName = primaryName,
            LogicalName = primaryName,
            DisplayName = new Label("Name", English),
            MaxLength = 100,
            FormatName = StringFormatName.Text,
            RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.ApplicationRequired),
        });
        return table;
    }

    public T AddColumn<T>(string table, T attribute) where T : AttributeMetadata
    {
        attribute.LogicalName ??= attribute.SchemaName!.ToLowerInvariant();
        attribute.DisplayName ??= new Label(attribute.LogicalName, English);
        attribute.Description ??= new Label("", English);
        attribute.RequiredLevel ??= new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None);
        attribute.IsAuditEnabled ??= new BooleanManagedProperty(false);
        attribute.IsCustomizable ??= new BooleanManagedProperty(true);
        attribute.IsRenameable ??= new BooleanManagedProperty(true);
        Set(attribute, "IsManaged", false);
        Set(attribute, "IsCustomAttribute", true);
        var metadata = Tables[table];
        Set(metadata, "Attributes", (metadata.Attributes ?? []).Where(a => a.LogicalName != attribute.LogicalName).Append(attribute).ToArray());
        return attribute;
    }

    public AttributeMetadata Column(string table, string column) =>
        Tables[table].Attributes.Single(a => a.LogicalName == column);

    public EntityKeyMetadata AddKey(string table, string schemaName, EntityKeyIndexStatus status, params string[] columns)
    {
        var key = new EntityKeyMetadata { SchemaName = schemaName, KeyAttributes = columns, DisplayName = new Label(schemaName, English) };
        Set(key, "LogicalName", schemaName.ToLowerInvariant());
        Set(key, "EntityKeyIndexStatus", status);
        var metadata = Tables[table];
        Set(metadata, "Keys", (metadata.Keys ?? []).Append(key).ToArray());
        return key;
    }

    public static OptionSetMetadata Options(params (int Value, string Label)[] options)
    {
        var set = new OptionSetMetadata { IsGlobal = false, OptionSetType = OptionSetType.Picklist };
        foreach (var (value, label) in options) set.Options.Add(new OptionMetadata(new Label(label, English), value));
        return set;
    }

    public static void Set(object target, string property, object? value)
    {
        var info = target.GetType().GetProperty(property);
        var setter = info?.GetSetMethod(nonPublic: true);
        Assert.NotNull(setter);
        setter.Invoke(target, [value]);
    }

    // ── Dataverse ────────────────────────────────────────────────────────────

    private OrganizationResponse Handle(OrganizationRequest request)
    {
        if (!request.RequestName.StartsWith("Retrieve", StringComparison.Ordinal) && Fail?.Invoke(request) is { } error) throw error;
        switch (request)
        {
            case RetrieveVersionRequest:
                return new RetrieveVersionResponse { Results = new ParameterCollection { ["Version"] = "9.2.25010.100" } };
            case RetrieveEntityRequest retrieve:
                return Tables.TryGetValue(retrieve.LogicalName, out var found)
                    ? new RetrieveEntityResponse { Results = new ParameterCollection { ["EntityMetadata"] = found } }
                    : throw NotFound($"Could not find entity {retrieve.LogicalName}");
            case RetrieveAttributeRequest attribute:
                return new RetrieveAttributeResponse
                {
                    Results = new ParameterCollection { ["AttributeMetadata"] = Column(attribute.EntityLogicalName, attribute.LogicalName) },
                };
            case RetrieveOptionSetRequest choice:
                return GlobalChoices.TryGetValue(choice.Name, out var set)
                    ? new RetrieveOptionSetResponse { Results = new ParameterCollection { ["OptionSetMetadata"] = set } }
                    : throw NotFound($"Could not find optionset {choice.Name}");
            case RetrieveEntityKeyRequest key:
                var stored = Tables[key.EntityLogicalName].Keys.Single(k => k.LogicalName == key.LogicalName);
                Set(stored, "EntityKeyIndexStatus", KeyBuildsTo);
                return new RetrieveEntityKeyResponse { Results = new ParameterCollection { ["EntityKeyMetadata"] = stored } };
            case CreateEntityRequest create:
                CreateTable(create);
                break;
            case UpdateEntityRequest update:
                UpdateTable(update);
                break;
            case CreateAttributeRequest create:
                AddColumn(create.EntityName, create.Attribute);
                break;
            case UpdateAttributeRequest update:
                AddColumn(update.EntityName, update.Attribute);
                break;
            case InsertOptionValueRequest insert:
                OptionsOf(insert.EntityLogicalName, insert.AttributeLogicalName).Options.Add(new OptionMetadata(insert.Label, insert.Value));
                break;
            case UpdateOptionValueRequest update:
                UpdateOption(update);
                break;
            case CreateOneToManyRequest lookup:
                lookup.Lookup.Targets = [lookup.OneToManyRelationship.ReferencedEntity];
                AddColumn(lookup.OneToManyRelationship.ReferencingEntity, lookup.Lookup);
                break;
            case CreateManyToManyRequest relationship:
                var metadata = relationship.ManyToManyRelationship;
                foreach (var name in new[] { metadata.Entity1LogicalName, metadata.Entity2LogicalName }.Distinct())
                    Set(Tables[name], "ManyToManyRelationships", Tables[name].ManyToManyRelationships.Append(metadata).ToArray());
                break;
            case CreateEntityKeyRequest key:
                AddKey(key.EntityName, key.EntityKey.SchemaName, EntityKeyIndexStatus.Pending, key.EntityKey.KeyAttributes);
                break;
            case ReactivateEntityKeyRequest reactivate:
                Set(Tables[reactivate.EntityLogicalName].Keys.Single(k => k.LogicalName == reactivate.EntityKeyLogicalName),
                    "EntityKeyIndexStatus", EntityKeyIndexStatus.Pending);
                break;
        }

        return new OrganizationResponse();
    }

    private void CreateTable(CreateEntityRequest create)
    {
        var entity = create.Entity;
        var primary = (StringAttributeMetadata)create.PrimaryAttribute;
        var table = AddTable(
            entity.SchemaName,
            Labels.Text(entity.DisplayName, English) ?? "",
            Labels.Text(entity.DisplayCollectionName, English) ?? "",
            entity.OwnershipType == OwnershipTypes.UserOwned,
            primary.SchemaName);
        if (entity.Description is not null) table.Description = entity.Description;
        if (entity.IsAuditEnabled is not null) table.IsAuditEnabled = entity.IsAuditEnabled;
        if (entity.ChangeTrackingEnabled is not null) table.ChangeTrackingEnabled = entity.ChangeTrackingEnabled;
        Set(table, "HasNotes", create.HasNotes);
        Set(table, "HasActivities", create.HasActivities);
        var name = (StringAttributeMetadata)Column(table.LogicalName, primary.SchemaName.ToLowerInvariant());
        name.MaxLength = primary.MaxLength;
        name.DisplayName = primary.DisplayName;
    }

    private void UpdateTable(UpdateEntityRequest update)
    {
        var table = Tables[update.Entity.LogicalName];
        var entity = update.Entity;
        if (entity.DisplayName is not null) table.DisplayName = entity.DisplayName;
        if (entity.DisplayCollectionName is not null) table.DisplayCollectionName = entity.DisplayCollectionName;
        if (entity.Description is not null) table.Description = entity.Description;
        if (entity.IsAuditEnabled is not null) table.IsAuditEnabled = entity.IsAuditEnabled;
        if (entity.ChangeTrackingEnabled is not null) table.ChangeTrackingEnabled = entity.ChangeTrackingEnabled;
        if (entity.IsBusinessProcessEnabled is not null) table.IsBusinessProcessEnabled = entity.IsBusinessProcessEnabled;
        if (update.Parameters.Contains("HasNotes")) Set(table, "HasNotes", update.HasNotes);
        if (update.Parameters.Contains("HasActivities")) Set(table, "HasActivities", update.HasActivities);
    }

    private OptionSetMetadata OptionsOf(string table, string column) =>
        ((EnumAttributeMetadata)Column(table, column)).OptionSet;

    private void UpdateOption(UpdateOptionValueRequest update)
    {
        var attribute = Column(update.EntityLogicalName, update.AttributeLogicalName);
        var option = attribute is BooleanAttributeMetadata boolean
            ? (update.Value == 1 ? boolean.OptionSet.TrueOption : boolean.OptionSet.FalseOption)
            : OptionsOf(update.EntityLogicalName, update.AttributeLogicalName).Options.Single(o => o.Value == update.Value);
        // MergeLabels: the given language changes, other languages stay.
        foreach (var label in update.Label.LocalizedLabels)
        {
            var existing = option.Label.LocalizedLabels.FirstOrDefault(l => l.LanguageCode == label.LanguageCode);
            if (existing is not null) existing.Label = label.Label;
            else option.Label.LocalizedLabels.Add(label);
        }
    }

    private static Exception NotFound(string message) => FakeAgentClient.Fault(unchecked((int)0x80040217), message);
}
