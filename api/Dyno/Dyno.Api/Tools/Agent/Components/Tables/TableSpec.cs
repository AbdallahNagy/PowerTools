using System.ComponentModel;
using System.Text.Json.Serialization;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Tables;

/// <summary>
/// The desired state of one table for table_apply. A property left out means "leave it as it is"; nothing the spec
/// leaves out is ever removed. Labels are in the organization's base language.
/// </summary>
[Description("The desired state of a table. Leave a property out to keep it as it is. Nothing left out is removed.")]
public sealed class TableApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the changes go into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    public required TableDefinition Table { get; init; }

    [Description("Columns to create or update, in order. Columns not listed are kept.")]
    public List<ColumnDefinition>? Columns { get; init; }

    [Description("Many-to-many relationships between this table and another.")]
    public List<ManyToManyDefinition>? ManyToMany { get; init; }

    [Description("Alternate keys. Apply waits until the key's index is active.")]
    public List<KeyDefinition>? Keys { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<TableOwnership>))]
public enum TableOwnership
{
    [JsonStringEnumMemberName("user")] User,
    [JsonStringEnumMemberName("organization")] Organization,
}

[Description("The table. schemaName finds it; a new table needs displayName and pluralName.")]
public sealed class TableDefinition
{
    [Description("Schema name, for example con_Project. A new table needs the publisher prefix.")]
    public required string SchemaName { get; init; }

    public string? DisplayName { get; init; }

    public string? PluralName { get; init; }

    public string? Description { get; init; }

    [Description("Fixed when the table is created. Default user.")]
    public TableOwnership? Ownership { get; init; }

    [Description("The primary name column. Fixed when the table is created, apart from its label and length.")]
    public PrimaryNameDefinition? PrimaryName { get; init; }

    public bool? AuditEnabled { get; init; }

    public bool? ChangeTracking { get; init; }

    [Description("Notes and attachments. Cannot be turned off once on.")]
    public bool? Notes { get; init; }

    [Description("Activities can be regarding this table. Cannot be turned off once on.")]
    public bool? Activities { get; init; }
}

public sealed class PrimaryNameDefinition
{
    [Description("Default <prefix>_Name.")]
    public string? SchemaName { get; init; }

    [Description("Default Name.")]
    public string? DisplayName { get; init; }

    [Description("1 to 4000. Default 100.")]
    public int? MaxLength { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<ColumnType>))]
public enum ColumnType
{
    [JsonStringEnumMemberName("text")] Text,
    [JsonStringEnumMemberName("memo")] Memo,
    [JsonStringEnumMemberName("integer")] Integer,
    [JsonStringEnumMemberName("decimal")] Decimal,
    [JsonStringEnumMemberName("float")] Float,
    [JsonStringEnumMemberName("money")] Money,
    [JsonStringEnumMemberName("boolean")] Boolean,
    [JsonStringEnumMemberName("datetime")] DateTime,
    [JsonStringEnumMemberName("dateonly")] DateOnly,
    [JsonStringEnumMemberName("choice")] Choice,
    [JsonStringEnumMemberName("multichoice")] MultiChoice,
    [JsonStringEnumMemberName("lookup")] Lookup,
    [JsonStringEnumMemberName("file")] File,
    [JsonStringEnumMemberName("image")] Image,
}

[JsonConverter(typeof(JsonStringEnumConverter<RequiredLevel>))]
public enum RequiredLevel
{
    [JsonStringEnumMemberName("none")] None,
    [JsonStringEnumMemberName("recommended")] Recommended,
    [JsonStringEnumMemberName("required")] Required,
}

[JsonConverter(typeof(JsonStringEnumConverter<TextFormat>))]
public enum TextFormat
{
    [JsonStringEnumMemberName("text")] Text,
    [JsonStringEnumMemberName("email")] Email,
    [JsonStringEnumMemberName("url")] Url,
    [JsonStringEnumMemberName("phone")] Phone,
    [JsonStringEnumMemberName("textarea")] TextArea,
}

[JsonConverter(typeof(JsonStringEnumConverter<DateBehavior>))]
public enum DateBehavior
{
    [JsonStringEnumMemberName("userLocal")] UserLocal,
    [JsonStringEnumMemberName("dateOnly")] DateOnly,
    [JsonStringEnumMemberName("timeZoneIndependent")] TimeZoneIndependent,
}

[Description("A column. schemaName finds it; its type cannot change once created.")]
public sealed class ColumnDefinition
{
    [Description("Schema name, for example con_Budget. A new column needs the publisher prefix.")]
    public required string SchemaName { get; init; }

    public required ColumnType Type { get; init; }

    [Description("Required for a new column.")]
    public string? DisplayName { get; init; }

    public string? Description { get; init; }

    public RequiredLevel? RequiredLevel { get; init; }

    public bool? AuditEnabled { get; init; }

    [Description("text: 1 to 4000 (default 100). memo: 1 to 1048576 (default 2000).")]
    public int? MaxLength { get; init; }

    [Description("text only. Default text.")]
    public TextFormat? Format { get; init; }

    [Description("integer, decimal, float, money.")]
    public double? MinValue { get; init; }

    [Description("integer, decimal, float, money.")]
    public double? MaxValue { get; init; }

    [Description("Decimal places. decimal 0 to 10, float 0 to 5, money 0 to 4 (default: the currency's).")]
    public int? Precision { get; init; }

    [Description("datetime and dateonly. New columns default to userLocal for datetime and dateOnly for dateonly. Can change only from userLocal, once; left out, an existing column keeps its behavior.")]
    public DateBehavior? Behavior { get; init; }

    [Description("choice and multichoice: the column's own options. Existing options not listed are kept.")]
    public List<OptionDefinition>? Options { get; init; }

    [Description("choice and multichoice: the name of an existing global choice, instead of options.")]
    public string? GlobalChoice { get; init; }

    [Description("boolean only. Default Yes.")]
    public string? TrueLabel { get; init; }

    [Description("boolean only. Default No.")]
    public string? FalseLabel { get; init; }

    [Description("lookup only: the logical name of the table it points to. Fixed once created.")]
    public string? Target { get; init; }

    [Description("lookup only: the relationship's schema name. Default <prefix>_<target>_<table>_<column>.")]
    public string? RelationshipName { get; init; }

    [Description("file only: maximum size in KB, 1 to 10485760 (default 32768). Fixed once created.")]
    public int? MaxSizeInKb { get; init; }
}

[Description("An option. value finds it; without value the label does, and a new option gets the next value from the publisher's option prefix.")]
public sealed class OptionDefinition
{
    public required string Label { get; init; }

    public int? Value { get; init; }
}

[Description("A many-to-many relationship. schemaName finds it.")]
public sealed class ManyToManyDefinition
{
    [Description("Schema name with the publisher prefix. It also names the intersect table.")]
    public required string SchemaName { get; init; }

    [Description("Logical name of the other table. Fixed once created.")]
    public required string Table { get; init; }
}

[Description("An alternate key. schemaName finds it; its columns are fixed once created.")]
public sealed class KeyDefinition
{
    [Description("Schema name with the publisher prefix.")]
    public required string SchemaName { get; init; }

    [Description("Default: the schema name.")]
    public string? DisplayName { get; init; }

    [Description("Logical names of the key's columns.")]
    public required List<string> Columns { get; init; }
}
