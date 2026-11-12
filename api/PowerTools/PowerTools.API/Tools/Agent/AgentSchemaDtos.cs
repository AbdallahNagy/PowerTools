namespace PowerTools.API.Tools.Agent;

// ── Requests (camelCase JSON) ────────────────────────────────────────────────

public sealed class ChoiceOptionBody
{
    public string? Label { get; set; }
    public int? Value { get; set; }
}

public sealed class CreateTableBody
{
    public string? SchemaName { get; set; }
    public string? DisplayName { get; set; }
    public string? PluralName { get; set; }
    public string? Description { get; set; }
    /// <summary>"user" or "organization".</summary>
    public string? Ownership { get; set; }
    public string? PrimaryNameSchemaName { get; set; }
    public string? PrimaryNameDisplayName { get; set; }
    public int? PrimaryNameMaxLength { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class CreateColumnBody
{
    public string? Table { get; set; }
    public string? SchemaName { get; set; }
    public string? DisplayName { get; set; }
    public string? Description { get; set; }
    public string? Type { get; set; }
    public string? RequiredLevel { get; set; }
    public int? MaxLength { get; set; }
    public double? MinValue { get; set; }
    public double? MaxValue { get; set; }
    public int? Precision { get; set; }
    public string? Format { get; set; }
    public string? GlobalChoice { get; set; }
    public List<ChoiceOptionBody>? Options { get; set; }
    public string? TrueLabel { get; set; }
    public string? FalseLabel { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class CreateLookupBody
{
    public string? Table { get; set; }
    public string? SchemaName { get; set; }
    public string? DisplayName { get; set; }
    public List<string>? Targets { get; set; }
    public string? RequiredLevel { get; set; }
    public string? RelationshipSchemaName { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class CreateManyToManyBody
{
    public string? Table1 { get; set; }
    public string? Table2 { get; set; }
    public string? SchemaName { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class CreateChoiceBody
{
    public string? SchemaName { get; set; }
    public string? DisplayName { get; set; }
    public List<ChoiceOptionBody>? Options { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class AddChoiceOptionBody
{
    public string? Choice { get; set; }
    public string? Table { get; set; }
    public string? Column { get; set; }
    public string? Label { get; set; }
    public int? Value { get; set; }
    public string? Solution { get; set; }
}

// ── Responses ────────────────────────────────────────────────────────────────

public sealed record TableCreatedDto(string LogicalName, Guid MetadataId);

public sealed record ColumnCreatedDto(string LogicalName, Guid MetadataId);

public sealed record LookupCreatedDto(string SchemaName, IReadOnlyList<string> Relationships, Guid? MetadataId);

public sealed record RelationshipCreatedDto(string SchemaName, Guid MetadataId);

public sealed record ChoiceCreatedDto(string Name, Guid MetadataId);

public sealed record ChoiceOptionAddedDto(int Value);

public sealed record ChoiceValueDto(int Value, string Label);
