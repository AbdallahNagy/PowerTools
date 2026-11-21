using System.Text.Json.Serialization;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Tables;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Inspect;

public sealed class InspectSchemaBody
{
    /// <summary>table, column, relationship, key, choice or role.</summary>
    public string? Kind { get; set; }

    /// <summary>Describe the one with this name. Without it, list.</summary>
    public string? Name { get; set; }

    /// <summary>The table, for column, relationship and key.</summary>
    public string? Table { get; set; }

    /// <summary>When listing: only names or display names that contain this text.</summary>
    public string? Filter { get; set; }

    public int? Top { get; set; }
}

public sealed record InspectListDto(string Kind, int Total, IReadOnlyList<object> Items, bool Truncated);

public sealed record TableListItem(string LogicalName, string SchemaName, string? DisplayName, bool Custom, bool Managed);

public sealed record ColumnListItem(string LogicalName, string Type, string? DisplayName, bool Custom);

public sealed record RelationshipItem(
    string SchemaName,
    string Type,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ReferencedTable = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ReferencingTable = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Lookup = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Table1 = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Table2 = null,
    bool Managed = false);

public sealed record KeyItem(string SchemaName, string? DisplayName, IReadOnlyList<string> Columns, string Status);

public sealed record ChoiceItem(string Name, string? DisplayName, bool Managed, IReadOnlyList<OptionDefinition>? Options = null);

public sealed record RoleItem(string Name, Guid Id, bool Managed, IReadOnlyList<RolePrivilegeItem>? Privileges = null);

public sealed record RolePrivilegeItem(string Name, string Depth);

/// <summary>A table described in the shape table_apply takes, plus what the spec cannot hold.</summary>
public sealed record TableDescription(
    string LogicalName,
    bool Managed,
    bool Customizable,
    TableDefinition Table,
    IReadOnlyList<ColumnDefinition> Columns,
    IReadOnlyList<ManyToManyDefinition> ManyToMany,
    IReadOnlyList<KeyDefinition> Keys,
    IReadOnlyList<string> OtherColumns);

/// <summary>
/// inspect_schema: reads tables, columns, relationships, keys, global choices and roles. A table or column is
/// described in the shape table_apply takes, so an agent can read one, change it and apply it. Only SDK messages,
/// so it works the same online and on-premises.
/// </summary>
public sealed class SchemaInspector(IAgentClient client)
{
    public const int DefaultTop = 100;
    public const int MaxTop = 500;

    public static readonly string[] Kinds = ["table", "column", "relationship", "key", "choice", "role"];

    public async Task<AgentResult<object>> InspectAsync(InspectSchemaBody body, CancellationToken ct)
    {
        try
        {
            var kind = body.Kind?.Trim().ToLowerInvariant();
            if (kind is null || !Kinds.Contains(kind)) throw Invalid($"kind must be one of: {string.Join(", ", Kinds)}.");
            var top = Math.Clamp(body.Top ?? DefaultTop, 1, MaxTop);
            var name = string.IsNullOrWhiteSpace(body.Name) ? null : body.Name.Trim();
            var language = await Labels.BaseLanguageAsync(client, ct);
            object result = kind switch
            {
                "table" => name is null ? await ListTablesAsync(body.Filter, top, language, ct) : await DescribeTableAsync(name, language, ct),
                "column" => await ColumnsAsync(RequireTable(body), name, body.Filter, top, language, ct),
                "relationship" => await RelationshipsAsync(RequireTable(body), name, body.Filter, top, ct),
                "key" => await KeysAsync(RequireTable(body), name, body.Filter, top, language, ct),
                "choice" => name is null ? await ListChoicesAsync(body.Filter, top, language, ct) : await DescribeChoiceAsync(name, language, ct),
                _ => name is null ? await ListRolesAsync(body.Filter, top, ct) : await DescribeRoleAsync(name, ct),
            };
            return AgentResult<object>.Ok(result);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return AgentResult<object>.Fail(AgentFaults.From(ex));
        }
    }

    private static string RequireTable(InspectSchemaBody body) =>
        string.IsNullOrWhiteSpace(body.Table)
            ? throw Invalid($"kind {body.Kind} needs table (a table logical name).")
            : body.Table.Trim().ToLowerInvariant();

    // ── Tables ───────────────────────────────────────────────────────────────

    private async Task<InspectListDto> ListTablesAsync(string? filter, int top, int language, CancellationToken ct)
    {
        var response = (RetrieveAllEntitiesResponse)await client.ExecuteAsync(
            new RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity, RetrieveAsIfPublished = true }, ct);
        var rows = (response.EntityMetadata ?? [])
            .Select(e => new TableListItem(e.LogicalName, e.SchemaName, Text(e.DisplayName, language), e.IsCustomEntity == true, e.IsManaged == true))
            .Where(t => Matches(filter, t.LogicalName, t.DisplayName))
            .OrderBy(t => t.LogicalName, StringComparer.Ordinal)
            .ToList();
        return List("table", rows, top);
    }

    public async Task<TableDescription> DescribeTableAsync(string name, int language, CancellationToken ct)
    {
        var table = await TableAsync(name, ct);
        var primary = table.Attributes?.FirstOrDefault(a => a.LogicalName == table.PrimaryNameAttribute) as StringAttributeMetadata;
        var definition = new TableDefinition
        {
            SchemaName = table.SchemaName,
            DisplayName = Text(table.DisplayName, language),
            PluralName = Text(table.DisplayCollectionName, language),
            Description = Text(table.Description, language),
            Ownership = table.OwnershipType == OwnershipTypes.OrganizationOwned ? TableOwnership.Organization : TableOwnership.User,
            PrimaryName = primary is null
                ? null
                : new PrimaryNameDefinition { SchemaName = primary.SchemaName, DisplayName = Text(primary.DisplayName, language), MaxLength = primary.MaxLength },
            AuditEnabled = table.IsAuditEnabled?.Value,
            ChangeTracking = table.ChangeTrackingEnabled,
            Notes = table.HasNotes,
            Activities = table.HasActivities,
        };

        var columns = new List<ColumnDefinition>();
        var others = new List<string>();
        foreach (var attribute in (table.Attributes ?? []).OrderBy(a => a.LogicalName, StringComparer.Ordinal))
        {
            if (attribute.AttributeOf is not null || attribute.IsPrimaryId == true || attribute.LogicalName == table.PrimaryNameAttribute) continue;
            if (Describe(attribute, language) is { } column) columns.Add(column);
            else others.Add(attribute.LogicalName);
        }

        var manyToMany = (table.ManyToManyRelationships ?? [])
            .Select(r => new ManyToManyDefinition
            {
                SchemaName = r.SchemaName,
                Table = string.Equals(r.Entity1LogicalName, table.LogicalName, StringComparison.OrdinalIgnoreCase) ? r.Entity2LogicalName : r.Entity1LogicalName,
            })
            .OrderBy(r => r.SchemaName, StringComparer.Ordinal)
            .ToList();
        var keys = (table.Keys ?? [])
            .Select(k => new KeyDefinition { SchemaName = k.SchemaName, DisplayName = Text(k.DisplayName, language), Columns = [.. k.KeyAttributes ?? []] })
            .OrderBy(k => k.SchemaName, StringComparer.Ordinal)
            .ToList();

        return new TableDescription(table.LogicalName, table.IsManaged == true, table.IsCustomizable?.Value != false, definition, columns, manyToMany, keys, others);
    }

    /// <summary>A column in table_apply's shape, or null for a type table_apply does not manage.</summary>
    public static ColumnDefinition? Describe(AttributeMetadata attribute, int language)
    {
        if (TableColumns.TypeOf(attribute) is not { } type) return null;
        var level = TableColumns.LevelName(attribute.RequiredLevel?.Value) switch
        {
            "required" => RequiredLevel.Required,
            "recommended" => RequiredLevel.Recommended,
            _ => RequiredLevel.None,
        };
        int? maxLength = null;
        TextFormat? format = null;
        double? min = null, max = null;
        int? precision = null;
        DateBehavior? behavior = null;
        List<OptionDefinition>? options = null;
        string? globalChoice = null, trueLabel = null, falseLabel = null, target = null;
        int? maxSize = null;

        switch (attribute)
        {
            case MemoAttributeMetadata memo:
                maxLength = memo.MaxLength;
                break;
            case StringAttributeMetadata text:
                maxLength = text.MaxLength;
                format = TableColumns.FormatName(text.FormatName) switch
                {
                    "email" => TextFormat.Email,
                    "url" => TextFormat.Url,
                    "phone" => TextFormat.Phone,
                    "textarea" => TextFormat.TextArea,
                    _ => TextFormat.Text,
                };
                break;
            case IntegerAttributeMetadata integer:
                (min, max) = (integer.MinValue, integer.MaxValue);
                break;
            case DecimalAttributeMetadata number:
                (min, max, precision) = ((double?)number.MinValue, (double?)number.MaxValue, number.Precision);
                break;
            case DoubleAttributeMetadata number:
                (min, max, precision) = (number.MinValue, number.MaxValue, number.Precision);
                break;
            case MoneyAttributeMetadata money:
                (min, max) = (money.MinValue, money.MaxValue);
                precision = money.PrecisionSource == 0 ? money.Precision : null;
                break;
            case DateTimeAttributeMetadata date:
                behavior = TableColumns.BehaviorName(date.DateTimeBehavior) switch
                {
                    "dateOnly" => DateBehavior.DateOnly,
                    "timeZoneIndependent" => DateBehavior.TimeZoneIndependent,
                    _ => DateBehavior.UserLocal,
                };
                break;
            case BooleanAttributeMetadata boolean:
                trueLabel = Text(boolean.OptionSet?.TrueOption?.Label, language);
                falseLabel = Text(boolean.OptionSet?.FalseOption?.Label, language);
                break;
            case EnumAttributeMetadata choice:
                if (choice.OptionSet?.IsGlobal == true) globalChoice = choice.OptionSet.Name;
                else options = Options(choice.OptionSet, language);
                break;
            case LookupAttributeMetadata lookup:
                target = lookup.Targets?.FirstOrDefault();
                break;
            case FileAttributeMetadata file:
                maxSize = file.MaxSizeInKB;
                break;
        }

        return new ColumnDefinition
        {
            SchemaName = attribute.SchemaName ?? attribute.LogicalName,
            Type = type,
            DisplayName = Text(attribute.DisplayName, language),
            Description = Text(attribute.Description, language),
            RequiredLevel = level,
            AuditEnabled = attribute.IsAuditEnabled?.Value,
            MaxLength = maxLength,
            Format = format,
            MinValue = min,
            MaxValue = max,
            Precision = precision,
            Behavior = behavior,
            Options = options,
            GlobalChoice = globalChoice,
            TrueLabel = trueLabel,
            FalseLabel = falseLabel,
            Target = target,
            MaxSizeInKb = maxSize,
        };
    }

    private async Task<object> ColumnsAsync(string table, string? name, string? filter, int top, int language, CancellationToken ct)
    {
        var metadata = await TableAsync(table, ct);
        if (name is not null)
        {
            var attribute = metadata.Attributes?.FirstOrDefault(a => string.Equals(a.LogicalName, name, StringComparison.OrdinalIgnoreCase))
                ?? throw new AgentProblemException(AgentFaults.NotFound($"Column '{name}' was not found on '{table}'."));
            return Describe(attribute, language) as object
                ?? new ColumnListItem(attribute.LogicalName, TypeText(attribute), Text(attribute.DisplayName, language), attribute.IsCustomAttribute == true);
        }

        var rows = (metadata.Attributes ?? [])
            .Where(a => a.AttributeOf is null)
            .Select(a => new ColumnListItem(a.LogicalName, TypeText(a), Text(a.DisplayName, language), a.IsCustomAttribute == true))
            .Where(c => Matches(filter, c.LogicalName, c.DisplayName))
            .OrderBy(c => c.LogicalName, StringComparer.Ordinal)
            .ToList();
        return List("column", rows, top);
    }

    private static string TypeText(AttributeMetadata attribute) =>
        TableColumns.TypeOf(attribute) is { } type
            ? TableColumns.TypeName(type)
            : (attribute.AttributeTypeName?.Value ?? attribute.AttributeType?.ToString() ?? "unknown").Replace("Type", "").ToLowerInvariant();

    // ── Relationships and keys ───────────────────────────────────────────────

    private async Task<object> RelationshipsAsync(string table, string? name, string? filter, int top, CancellationToken ct)
    {
        var metadata = await TableAsync(table, ct);
        var all = (metadata.OneToManyRelationships ?? []).Select(r => One(r, "oneToMany"))
            .Concat((metadata.ManyToOneRelationships ?? []).Select(r => One(r, "manyToOne")))
            .Concat((metadata.ManyToManyRelationships ?? []).Select(r =>
                new RelationshipItem(r.SchemaName, "manyToMany", Table1: r.Entity1LogicalName, Table2: r.Entity2LogicalName, Managed: r.IsManaged == true)))
            .OrderBy(r => r.SchemaName, StringComparer.Ordinal)
            .ToList();
        if (name is not null)
        {
            return all.FirstOrDefault(r => string.Equals(r.SchemaName, name, StringComparison.OrdinalIgnoreCase))
                ?? throw new AgentProblemException(AgentFaults.NotFound($"Relationship '{name}' was not found on '{table}'."));
        }

        return List("relationship", all.Where(r => Matches(filter, r.SchemaName, null)).ToList(), top);
    }

    private static RelationshipItem One(OneToManyRelationshipMetadata r, string type) =>
        new(r.SchemaName, type, r.ReferencedEntity, r.ReferencingEntity, r.ReferencingAttribute, Managed: r.IsManaged == true);

    private async Task<object> KeysAsync(string table, string? name, string? filter, int top, int language, CancellationToken ct)
    {
        var metadata = await TableAsync(table, ct);
        var all = (metadata.Keys ?? [])
            .Select(k => new KeyItem(
                k.SchemaName,
                Text(k.DisplayName, language),
                [.. k.KeyAttributes ?? []],
                (k.EntityKeyIndexStatus.ToString() ?? "unknown").ToLowerInvariant()))
            .OrderBy(k => k.SchemaName, StringComparer.Ordinal)
            .ToList();
        if (name is not null)
        {
            return all.FirstOrDefault(k => string.Equals(k.SchemaName, name, StringComparison.OrdinalIgnoreCase))
                ?? throw new AgentProblemException(AgentFaults.NotFound($"Key '{name}' was not found on '{table}'."));
        }

        return List("key", all.Where(k => Matches(filter, k.SchemaName, k.DisplayName)).ToList(), top);
    }

    // ── Global choices ───────────────────────────────────────────────────────

    private async Task<InspectListDto> ListChoicesAsync(string? filter, int top, int language, CancellationToken ct)
    {
        var response = (RetrieveAllOptionSetsResponse)await client.ExecuteAsync(new RetrieveAllOptionSetsRequest { RetrieveAsIfPublished = true }, ct);
        var rows = (response.OptionSetMetadata ?? [])
            .OfType<OptionSetMetadata>()
            .Select(s => new ChoiceItem(s.Name, Text(s.DisplayName, language), s.IsManaged == true))
            .Where(c => Matches(filter, c.Name, c.DisplayName))
            .OrderBy(c => c.Name, StringComparer.Ordinal)
            .ToList();
        return List("choice", rows, top);
    }

    private async Task<ChoiceItem> DescribeChoiceAsync(string name, int language, CancellationToken ct)
    {
        OptionSetMetadata? set;
        try
        {
            var response = (RetrieveOptionSetResponse)await client.ExecuteAsync(new RetrieveOptionSetRequest { Name = name, RetrieveAsIfPublished = true }, ct);
            set = response.OptionSetMetadata as OptionSetMetadata;
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            set = null;
        }

        if (set is null) throw new AgentProblemException(AgentFaults.NotFound($"Global choice '{name}' was not found."));
        return new ChoiceItem(set.Name, Text(set.DisplayName, language), set.IsManaged == true, Options(set, language));
    }

    private static List<OptionDefinition> Options(OptionSetMetadata? set, int language) =>
        (set?.Options ?? [])
            .Where(o => o.Value is not null)
            .Select(o => new OptionDefinition { Value = o.Value, Label = Text(o.Label, language) ?? "" })
            .ToList();

    // ── Roles ────────────────────────────────────────────────────────────────

    private static QueryExpression RootRoles()
    {
        // Every business unit has a copy of each role; the root business unit's copy has no parent role.
        var query = new QueryExpression("role") { NoLock = true, ColumnSet = new ColumnSet("name", "ismanaged") };
        query.Criteria.AddCondition("parentroleid", ConditionOperator.Null);
        query.AddOrder("name", OrderType.Ascending);
        return query;
    }

    private async Task<InspectListDto> ListRolesAsync(string? filter, int top, CancellationToken ct)
    {
        var rows = (await client.RetrieveMultipleAsync(RootRoles(), ct)).Entities
            .Select(r => new RoleItem(r.GetAttributeValue<string>("name") ?? "", r.Id, r.GetAttributeValue<bool?>("ismanaged") == true))
            .Where(r => Matches(filter, r.Name, null))
            .ToList();
        return List("role", rows, top);
    }

    private async Task<RoleItem> DescribeRoleAsync(string name, CancellationToken ct)
    {
        var query = RootRoles();
        query.Criteria.AddCondition("name", ConditionOperator.Equal, name);
        var role = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault()
            ?? throw new AgentProblemException(AgentFaults.NotFound($"Role '{name}' was not found."));

        var response = (RetrieveRolePrivilegesRoleResponse)await client.ExecuteAsync(new RetrieveRolePrivilegesRoleRequest { RoleId = role.Id }, ct);
        var granted = response.RolePrivileges ?? [];
        var names = new Dictionary<Guid, string>();
        if (granted.Length > 0)
        {
            var privileges = new QueryExpression("privilege") { NoLock = true, ColumnSet = new ColumnSet("name") };
            privileges.Criteria.AddCondition("privilegeid", ConditionOperator.In, granted.Select(p => (object)p.PrivilegeId).Distinct().ToArray());
            foreach (var row in (await client.RetrieveMultipleAsync(privileges, ct)).Entities)
                names[row.Id] = row.GetAttributeValue<string>("name") ?? row.Id.ToString();
        }

        var items = granted
            .Select(p => new RolePrivilegeItem(names.GetValueOrDefault(p.PrivilegeId, p.PrivilegeId.ToString()), p.Depth.ToString().ToLowerInvariant()))
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .ToList();
        return new RoleItem(role.GetAttributeValue<string>("name") ?? name, role.Id, role.GetAttributeValue<bool?>("ismanaged") == true, items);
    }

    // ── Shared ───────────────────────────────────────────────────────────────

    private async Task<EntityMetadata> TableAsync(string name, CancellationToken ct) =>
        await new MetadataCache(client).TableAsync(name.ToLowerInvariant(), ct)
            ?? throw new AgentProblemException(AgentFaults.NotFound($"Table '{name}' was not found."));

    private static InspectListDto List<T>(string kind, IReadOnlyList<T> rows, int top) where T : notnull =>
        new(kind, rows.Count, rows.Take(top).Cast<object>().ToList(), rows.Count > top);

    private static bool Matches(string? filter, string name, string? display) =>
        string.IsNullOrWhiteSpace(filter)
        || name.Contains(filter.Trim(), StringComparison.OrdinalIgnoreCase)
        || display?.Contains(filter.Trim(), StringComparison.OrdinalIgnoreCase) == true;

    private static string? Text(Microsoft.Xrm.Sdk.Label? label, int language) =>
        Labels.Text(label, language) ?? label?.UserLocalizedLabel?.Label;

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
