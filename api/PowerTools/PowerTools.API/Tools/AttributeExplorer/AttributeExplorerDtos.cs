namespace PowerTools.API.Tools.AttributeExplorer;

public sealed record TableDto(
    string LogicalName,
    string SchemaName,
    string? DisplayName,
    string? EntitySetName,
    int? ObjectTypeCode,
    string? PrimaryIdAttribute,
    string? PrimaryNameAttribute,
    bool IsCustom,
    bool IsManaged,
    bool IsIntersect,
    bool IsActivity,
    string? OwnershipType);

public sealed record TablesResponse(IReadOnlyList<TableDto> Tables);

public sealed record OptionDto(int Value, string Label);

public sealed record OptionSetDto(string? Name, bool IsGlobal, IReadOnlyList<OptionDto> Options);

public sealed record BooleanOptionsDto(string? TrueLabel, string? FalseLabel);

public sealed record RelationshipDto(string SchemaName, string ReferencedEntity);

public sealed record AttributeDto(
    string LogicalName,
    string SchemaName,
    string? DisplayName,
    string? Description,
    string AttributeType,
    string? AttributeTypeName,
    string RequiredLevel,
    bool IsCustom,
    bool IsManaged,
    bool IsPrimaryId,
    bool IsPrimaryName,
    int? SourceType,
    string? IntroducedVersion,
    string? MetadataId,
    int? ColumnNumber,
    bool? IsValidForCreate,
    bool? IsValidForUpdate,
    bool? IsValidForRead,
    bool? IsValidForAdvancedFind,
    bool? IsAuditEnabled,
    bool? IsSecured,
    bool? IsFilterable,
    bool? IsRetrievable,
    int? MaxLength,
    string? Format,
    string? DateTimeBehavior,
    string? MinValue,
    string? MaxValue,
    int? Precision,
    IReadOnlyList<string>? Targets,
    IReadOnlyList<RelationshipDto>? Relationships,
    OptionSetDto? OptionSet,
    BooleanOptionsDto? BooleanOptions,
    string? DefaultValue);

public sealed record TableAttributesResponse(TableDto Table, IReadOnlyList<AttributeDto> Attributes);
