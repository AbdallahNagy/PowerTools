namespace PowerTools.API.Tools.PolymorphicLookup;

public sealed record PolymorphicLookupProblem(int Status, string Code, string Message);

public static class PolymorphicLookupFaults
{
    public const int DuplicateAttributeSchemaName = unchecked((int)0x80047013);
    public const int LastPolymorphicRelationshipCannotBeDeleted = unchecked((int)0x80090420);
    public const int RelationshipsMissingFromCreatePolymorphicLookupAttribute = unchecked((int)0x80090421);
    public const int RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity = unchecked((int)0x80090422);
    public const int CannotCreateSelfReferentialPolymorphicLookup = unchecked((int)0x80090423);
    public const int EntityCanOnlyBeReferencedOnceInPolymorphicLookup = unchecked((int)0x80090424);
    public const int CreatePolymorphicLookupAttributeApiIsNotActive = unchecked((int)0x80090425);
    public const int CascadeBehaviorNotSupportedInPolymorphicLookup = unchecked((int)0x80090426);
    public const int PolymorphicLookupStyleCannotBeUpdated = unchecked((int)0x80090427);
    public const int PolymorphicLookupNotSupportedInSolutionAwareEntity = unchecked((int)0x80090428);

    public static PolymorphicLookupProblem Local(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    public static PolymorphicLookupProblem? Describe(int errorCode)
    {
        var known = errorCode switch
        {
            DuplicateAttributeSchemaName => (
                "DuplicateAttributeSchemaName",
                "DuplicateAttributeSchemaName: a column with this schema name already exists."),
            RelationshipsMissingFromCreatePolymorphicLookupAttribute => (
                "RelationshipsMissingFromCreatePolymorphicLookupAttribute",
                "CreatePolymorphicLookupAttribute requires at least one relationship."),
            CascadeBehaviorNotSupportedInPolymorphicLookup => (
                "CascadeBehaviorNotSupportedInPolymorphicLookup",
                "Polymorphic lookups only support Assign, Merge, Reparent, Share, Unshare, and RollupView as NoCascade, and Delete as RemoveLink."),
            LastPolymorphicRelationshipCannotBeDeleted => (
                "LastPolymorphicRelationshipCannotBeDeleted",
                "The last relationship on a polymorphic lookup cannot be deleted."),
            PolymorphicLookupStyleCannotBeUpdated => (
                "PolymorphicLookupStyleCannotBeUpdated",
                "This lookup's style cannot be changed to a polymorphic lookup."),
            CannotCreateSelfReferentialPolymorphicLookup => (
                "CannotCreateSelfReferentialPolymorphicLookup",
                "The same table cannot be both the referencing table and a referenced table."),
            EntityCanOnlyBeReferencedOnceInPolymorphicLookup => (
                "EntityCanOnlyBeReferencedOnceInPolymorphicLookup",
                "Each referenced table can appear only once on a polymorphic lookup."),
            PolymorphicLookupNotSupportedInSolutionAwareEntity => (
                "PolymorphicLookupNotSupportedInSolutionAwareEntity",
                "Polymorphic lookups are not supported on a solution-aware table."),
            CreatePolymorphicLookupAttributeApiIsNotActive => (
                "CreatePolymorphicLookupAttributeApiIsNotActive",
                "CreatePolymorphicLookupAttribute API is not enabled."),
            RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity => (
                "RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity",
                "The relationship schema name matches a column on the referenced table."),
            _ => ((string Code, string Message)?)null,
        };

        return known is null
            ? null
            : new PolymorphicLookupProblem(StatusCodes.Status400BadRequest, known.Value.Code, known.Value.Message);
    }
}
