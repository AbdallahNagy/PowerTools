using System.Text.Json;
using System.Text.Json.Serialization;

namespace PowerTools.API.Tools.CommunityToolApi;

// Shapes match packages/sdk/src/protocol.ts. Values use the tagged encoding of CommunityToolValueCodec.

// ── Requests ─────────────────────────────────────────────────────────────────

public sealed record RetrieveRecordRequest(string? Table, string? Id, IReadOnlyList<string>? Columns);

public sealed record FetchRecordsRequest(string? FetchXml, int? Page, string? PagingCookie, int? PageSize);

public sealed record CreateRecordRequest(string? Table, Dictionary<string, JsonElement>? Values);

public sealed record UpdateRecordRequest(string? Table, string? Id, Dictionary<string, JsonElement>? Values);

public sealed record DeleteRecordRequest(string? Table, string? Id);

public sealed record EntityRefDto(string? LogicalName, string? Id, string? Name);

public sealed record RelateRecordsRequest(string? Table, string? Id, string? Relationship, IReadOnlyList<EntityRefDto>? Related);

public sealed record ExecuteMessageRequest(string? Message, Dictionary<string, JsonElement>? Parameters);

public sealed record BatchOperationDto(string? Op, string? Table, string? Id, Dictionary<string, JsonElement>? Values);

public sealed record BatchRequest(IReadOnlyList<BatchOperationDto>? Operations, bool ContinueOnError);

// ── Responses ────────────────────────────────────────────────────────────────

public sealed record DataRecordDto(
    string LogicalName,
    string Id,
    IReadOnlyDictionary<string, object?> Values,
    IReadOnlyDictionary<string, string> Formatted);

public sealed record FetchPageDto(IReadOnlyList<DataRecordDto> Records, bool MoreRecords, string? PagingCookie, int Page);

public sealed record CreatedRecordDto(string Id);

/// <summary>Serializes as <c>{}</c>.</summary>
public sealed record EmptyResultDto;

public sealed record ExecuteResultDto(IReadOnlyDictionary<string, object?> Results);

public sealed record BatchItemResultDto(
    bool Ok,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Id = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] CommunityToolErrorDto? Error = null);

public sealed record BatchResultDto(IReadOnlyList<BatchItemResultDto> Responses);

public sealed record CommunityToolErrorDto(
    string Code,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? DataverseCode = null);

/// <summary>DisplayName is empty, never null, for a table that has no label.</summary>
public sealed record TableInfoDto(
    string LogicalName,
    string DisplayName,
    string? EntitySetName,
    string? PrimaryIdAttribute,
    string? PrimaryNameAttribute,
    bool IsCustom);

/// <summary>DisplayName is empty, never null, for a column that has no label.</summary>
public sealed record ColumnInfoDto(
    string LogicalName,
    string DisplayName,
    string Type,
    bool IsCustom,
    string RequiredLevel,
    IReadOnlyList<string> Targets);

public sealed record RelationshipInfoDto(
    string SchemaName,
    string Kind,
    string? ReferencedTable,
    string? ReferencingTable,
    string? ReferencingColumn);

public sealed record ChoiceDto(int Value, string Label);
