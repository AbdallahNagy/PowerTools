namespace PowerTools.API.Tools.EarlyBound;

public sealed record EarlyBoundTableSummary(
    string LogicalName,
    string SchemaName,
    string DisplayName,
    bool IsCustom);

public sealed record EarlyBoundTablesResponse(IReadOnlyList<EarlyBoundTableSummary> Tables);

public sealed record EarlyBoundGenerateRequest(string? Namespace, IReadOnlyList<string>? Tables);

public sealed record EarlyBoundGenerateResponse(string FileName, string Code, int TableCount);

public sealed record EarlyBoundTable(
    string LogicalName,
    string SchemaName,
    string DisplayName,
    IReadOnlyList<EarlyBoundColumn> Columns);

public sealed record EarlyBoundColumn(
    string LogicalName,
    string SchemaName,
    string DisplayName,
    EarlyBoundColumnKind Kind,
    bool IsPrimaryId = false,
    bool IsReadOnly = false,
    IReadOnlyList<EarlyBoundOption>? Options = null);

public sealed record EarlyBoundOption(int Value, string Label);

public enum EarlyBoundColumnKind
{
    String,
    Integer,
    BigInt,
    Decimal,
    Double,
    Money,
    Boolean,
    DateTime,
    Guid,
    Lookup,
    Choice,
    Choices,
    PartyList,
    Image,
}
