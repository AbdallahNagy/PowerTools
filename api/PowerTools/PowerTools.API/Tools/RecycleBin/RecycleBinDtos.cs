namespace PowerTools.API.Tools.RecycleBin;

public static class RecycleBinSources
{
    public const string Bin = "bin";
    public const string Audit = "audit";

    public static bool IsKnown(string? source) => source is Bin or Audit;
}

public static class SourceStates
{
    public const string Enabled = "enabled";
    public const string Disabled = "disabled";
    public const string Unavailable = "unavailable";
}

public static class RestoreStatuses
{
    public const string Restored = "restored";
    public const string Failed = "failed";
    public const string Skipped = "skipped";
}

/// <summary>State of one source: enabled, disabled, or unavailable with a reason (privilege, on-premises).</summary>
public sealed record SourceStatusDto(string State, string? Reason, int? RetentionDays);

public sealed record StatusResponse(SourceStatusDto Bin, SourceStatusDto Audit);

public sealed record TableDto(
    string LogicalName,
    string DisplayName,
    string PrimaryIdAttribute,
    string? PrimaryNameAttribute,
    bool BinEnabled,
    bool AuditEnabled,
    bool IsActivity,
    int? RetentionDays);

public sealed record TablesResponse(IReadOnlyList<TableDto> Tables);

public sealed record UserDto(string Id, string FullName, bool IsDisabled);

public sealed record UsersResponse(IReadOnlyList<UserDto> Users, bool Truncated);

public sealed record DeletedBody(
    string? Source,
    string? Table,
    string? FromUtc,
    string? ToUtc,
    string? DeletedByUserId,
    int? PageSize,
    string? PagingCookie,
    int? Page);

public sealed record DeletedRecordDto(
    string Key,
    string RecordId,
    string Table,
    string? Name,
    string? DeletedOn,
    string? DeletedById,
    string? DeletedBy,
    string? CallingUserId,
    string? CallingUser,
    string? AuditId,
    bool HasValues);

public sealed record DeletedResponse(
    IReadOnlyList<DeletedRecordDto> Records,
    string? PagingCookie,
    bool MoreRecords,
    int Page);

/// <summary>
/// One field value. <c>Kind</c> is lookup, choice, multichoice, boolean, datetime, money, number,
/// guid, string or other. <c>Value</c> is the raw value as text; dates are ISO 8601 UTC.
/// </summary>
public sealed record FieldDto(string LogicalName, string Kind, string? Value, string? Formatted, string? LookupTable);

public sealed record RecordResponse(IReadOnlyList<FieldDto> Fields);

public sealed record RestoreItem(string? Table, string? RecordId, string? AuditId);

public sealed record RestoreBody(string? Source, IReadOnlyList<RestoreItem>? Items);

public sealed record RestoreResultDto(
    string Table,
    string RecordId,
    string? AuditId,
    string Status,
    string? Code,
    string? Message,
    string? Warning);

public sealed record RestoreResponse(IReadOnlyList<RestoreResultDto> Results);
