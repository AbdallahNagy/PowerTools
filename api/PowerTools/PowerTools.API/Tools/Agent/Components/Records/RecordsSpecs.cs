using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Records;

[JsonConverter(typeof(JsonStringEnumConverter<RecordOp>))]
public enum RecordOp
{
    [JsonStringEnumMemberName("create")] Create,
    [JsonStringEnumMemberName("update")] Update,
    [JsonStringEnumMemberName("upsert")] Upsert,
    [JsonStringEnumMemberName("associate")] Associate,
}

[Description("Writes up to 100 records. Each operation is one step; the result gives the ids of created records.")]
public sealed class RecordsWriteSpec : IApplySpec
{
    [Description("The operations, run in order.")]
    public required List<RecordOperation> Operations { get; init; }

    [Description("Run every operation in one transaction: all are applied or none. Default false: stop at the first failure.")]
    public bool? AllOrNothing { get; init; }

    string? IApplySpec.Solution => null;
}

public sealed class RecordOperation
{
    public required RecordOp Op { get; init; }

    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("The record's id. update and associate need id or key; upsert may give either.")]
    public string? Id { get; init; }

    [Description("Alternate key values by column, instead of id.")]
    public Dictionary<string, JsonElement>? Key { get; init; }

    [Description("Column logical names mapped to values. Plain strings, numbers, booleans and null are plain; other types are {\"$type\":\"EntityReference\",\"logicalName\":\"account\",\"id\":\"<guid>\"}, {\"$type\":\"OptionSetValue\",\"value\":1}, Money, DateTime, Decimal, Double, Guid.")]
    public Dictionary<string, JsonElement>? Values { get; init; }

    [Description("associate: schema name of the relationship.")]
    public string? Relationship { get; init; }

    [Description("associate: the records to relate.")]
    public List<RecordReference>? Related { get; init; }
}

public sealed class RecordReference
{
    [Description("Table logical name.")]
    public required string Table { get; init; }

    public string? Id { get; init; }

    [Description("Alternate key values by column, instead of id.")]
    public Dictionary<string, JsonElement>? Key { get; init; }
}

[Description("Deletes records by id or key, or by a FetchXML query, and removes many-to-many links. Always destructive.")]
public sealed class RecordsDeleteSpec : IApplySpec
{
    [Description("Records to delete. One already gone is skipped.")]
    public List<RecordReference>? Records { get; init; }

    [Description("Delete what a FetchXML query matches. The plan refuses when it matches more than maxCount.")]
    public RecordsDeleteQuery? Query { get; init; }

    [Description("Links to remove (disassociate). The records stay.")]
    public List<RecordLinks>? Disassociate { get; init; }

    string? IApplySpec.Solution => null;
}

public sealed class RecordsDeleteQuery
{
    [Description("FetchXML of the table to delete from. Only the main entity's rows are deleted.")]
    public required string FetchXml { get; init; }

    [Description("The most records this may delete, 1 to 1000.")]
    public required int MaxCount { get; init; }
}

public sealed class RecordLinks
{
    [Description("Table logical name of the record the links start from.")]
    public required string Table { get; init; }

    public required string Id { get; init; }

    [Description("Schema name of the relationship.")]
    public required string Relationship { get; init; }

    public required List<RecordReference> Related { get; init; }
}
