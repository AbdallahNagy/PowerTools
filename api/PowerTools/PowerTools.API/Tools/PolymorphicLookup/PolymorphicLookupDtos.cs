namespace PowerTools.API.Tools.PolymorphicLookup;

public sealed class CascadeBody
{
    public string? Assign { get; set; }
    public string? Delete { get; set; }
    public string? Merge { get; set; }
    public string? Reparent { get; set; }
    public string? Share { get; set; }
    public string? Unshare { get; set; }
    public string? RollupView { get; set; }
}

public sealed class RelationshipBody
{
    public string? ReferencedEntityLogicalName { get; set; }
    public string? SchemaName { get; set; }
    public bool? IsValidForAdvancedFind { get; set; }
    public CascadeBody? Cascade { get; set; }
    public string? AssociatedMenuBehavior { get; set; }
    public string? AssociatedMenuGroup { get; set; }
    public int? AssociatedMenuOrder { get; set; }
    public string? AssociatedMenuLabel { get; set; }
}

public sealed class CreatePolymorphicLookupBody
{
    public string? SolutionUniqueName { get; set; }
    public string? ReferencingEntityLogicalName { get; set; }
    public string? DisplayName { get; set; }
    public string? SchemaName { get; set; }
    public List<RelationshipBody>? Relationships { get; set; }
}

public sealed class AddRelationshipBody
{
    public string? SolutionUniqueName { get; set; }
    public string? ReferencingEntityLogicalName { get; set; }
    public string? ReferencingAttributeLogicalName { get; set; }
    public RelationshipBody? Relationship { get; set; }
}

public sealed class UpdateRelationshipBody
{
    public string? ReferencingEntityLogicalName { get; set; }
    public bool? IsValidForAdvancedFind { get; set; }
    public CascadeBody? Cascade { get; set; }
    public string? AssociatedMenuBehavior { get; set; }
    public string? AssociatedMenuGroup { get; set; }
    public int? AssociatedMenuOrder { get; set; }
    public string? AssociatedMenuLabel { get; set; }
}

public sealed record CascadeDto(
    string Assign,
    string Delete,
    string Merge,
    string Reparent,
    string Share,
    string Unshare,
    string RollupView);

public sealed record ManyToOneDto(
    string SchemaName,
    string ReferencingAttribute,
    string ReferencedEntity,
    string ReferencedAttribute,
    bool IsValidForAdvancedFind,
    CascadeDto Cascade,
    string AssociatedMenuBehavior,
    string AssociatedMenuGroup,
    int? AssociatedMenuOrder,
    string? AssociatedMenuLabel);

public sealed record LookupColumnDto(
    string LogicalName,
    string SchemaName,
    string DisplayName,
    IReadOnlyList<string> Targets,
    bool? IsManaged,
    bool? IsCustomizable);

public sealed record PolymorphicEntityDto(
    string LogicalName,
    string SchemaName,
    string DisplayName,
    string PrimaryIdAttribute,
    bool CanBePrimaryEntityInRelationship,
    bool CanBeRelatedEntityInRelationship,
    string? TableType,
    bool IsSolutionAware,
    IReadOnlyList<LookupColumnDto> Lookups,
    IReadOnlyList<ManyToOneDto> ManyToOne);

public sealed record PolymorphicMetadataDto(int LanguageCode, IReadOnlyList<PolymorphicEntityDto> Entities);

public sealed record UnmanagedSolutionDto(
    string UniqueName,
    string FriendlyName,
    string Version,
    string PublisherName,
    string CustomizationPrefix);

public sealed record AttributeIdDto(Guid AttributeId);

public sealed record SchemaNameDto(string SchemaName);
