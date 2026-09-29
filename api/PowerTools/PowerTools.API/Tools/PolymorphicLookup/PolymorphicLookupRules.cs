using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.PolymorphicLookup;

public static class PolymorphicLookupRules
{
    public const int RelationshipSchemaNameLimit = 100;
    public const int DefaultMenuOrder = 10000;

    public static string TruncateRelationshipSchemaName(string schemaName) =>
        schemaName.Length <= RelationshipSchemaNameLimit
            ? schemaName
            : schemaName[..RelationshipSchemaNameLimit];

    public static CascadeConfiguration PolymorphicCascade() => new()
    {
        Assign = CascadeType.NoCascade,
        Merge = CascadeType.NoCascade,
        Reparent = CascadeType.NoCascade,
        Share = CascadeType.NoCascade,
        Unshare = CascadeType.NoCascade,
        RollupView = CascadeType.NoCascade,
        Delete = CascadeType.RemoveLink,
    };

    public static PolymorphicLookupProblem? ValidateCascade(CascadeBody? cascade)
    {
        if (cascade is null) return null;

        if (!Is(cascade.Assign, "NoCascade")
            || !Is(cascade.Merge, "NoCascade")
            || !Is(cascade.Reparent, "NoCascade")
            || !Is(cascade.Share, "NoCascade")
            || !Is(cascade.Unshare, "NoCascade")
            || !Is(cascade.RollupView, "NoCascade")
            || !Is(cascade.Delete, "RemoveLink"))
        {
            return PolymorphicLookupFaults.Describe(PolymorphicLookupFaults.CascadeBehaviorNotSupportedInPolymorphicLookup);
        }

        return null;
    }

    public static PolymorphicLookupProblem? ValidateSchemaName(string? schemaName, string field)
    {
        if (string.IsNullOrWhiteSpace(schemaName))
        {
            return PolymorphicLookupFaults.Local(
                "SchemaNameRequired",
                $"{field} is required.");
        }

        if (!char.IsLetter(schemaName[0]))
        {
            return PolymorphicLookupFaults.Local(
                "SchemaNameNotStartwithLetter",
                $"{field} must start with a letter.");
        }

        if (schemaName.Any(ch => !char.IsLetterOrDigit(ch) && ch != '_'))
        {
            return PolymorphicLookupFaults.Local(
                "SchemaNameContainsNonAlphaNumericCharacters",
                $"{field} can contain only letters, digits, and underscores.");
        }

        return null;
    }

    public static PolymorphicLookupProblem? ValidatePrefix(string schemaName, string customizationPrefix, string field)
    {
        var prefix = customizationPrefix.EndsWith('_')
            ? customizationPrefix
            : customizationPrefix + "_";
        if (!schemaName.StartsWith(prefix, StringComparison.Ordinal))
        {
            return PolymorphicLookupFaults.Local(
                "InvalidNamePrefix",
                $"{field} must start with the solution publisher prefix '{prefix}'.");
        }

        return null;
    }

    public static AssociatedMenuBehavior ParseMenuBehavior(string? value) =>
        value switch
        {
            null or "" or "UseCollectionName" => AssociatedMenuBehavior.UseCollectionName,
            "UseLabel" => AssociatedMenuBehavior.UseLabel,
            "DoNotDisplay" => AssociatedMenuBehavior.DoNotDisplay,
            _ => throw new PolymorphicLookupValidationException(
                PolymorphicLookupFaults.Local(
                    "AssociatedMenuBehavior",
                    "Associated menu behavior must be Use plural name, Custom label, or Do not display.")),
        };

    public static AssociatedMenuGroup ParseMenuGroup(string? value) =>
        value switch
        {
            null or "" or "Details" => AssociatedMenuGroup.Details,
            "Sales" => AssociatedMenuGroup.Sales,
            "Service" => AssociatedMenuGroup.Service,
            "Marketing" => AssociatedMenuGroup.Marketing,
            _ => throw new PolymorphicLookupValidationException(
                PolymorphicLookupFaults.Local(
                    "AssociatedMenuGroup",
                    "Display zone must be Details, Sales, Service, or Marketing.")),
        };

    public static OneToManyRelationshipMetadata BuildRelationship(
        RelationshipBody body,
        string referencingEntityLogicalName,
        string? referencingAttribute,
        string? referencedAttribute,
        int languageCode)
    {
        var schemaName = TruncateRelationshipSchemaName(body.SchemaName ?? "");
        var menu = new AssociatedMenuConfiguration
        {
            Behavior = ParseMenuBehavior(body.AssociatedMenuBehavior),
            Group = ParseMenuGroup(body.AssociatedMenuGroup),
            Order = body.AssociatedMenuOrder ?? DefaultMenuOrder,
        };
        if (!string.IsNullOrWhiteSpace(body.AssociatedMenuLabel))
        {
            menu.Label = new Label(body.AssociatedMenuLabel, languageCode);
        }

        return new OneToManyRelationshipMetadata
        {
            SchemaName = schemaName,
            ReferencedEntity = body.ReferencedEntityLogicalName,
            ReferencingEntity = referencingEntityLogicalName,
            ReferencingAttribute = referencingAttribute,
            ReferencedAttribute = referencedAttribute,
            IsValidForAdvancedFind = body.IsValidForAdvancedFind ?? true,
            CascadeConfiguration = PolymorphicCascade(),
            AssociatedMenuConfiguration = menu,
        };
    }

    private static bool Is(string? actual, string expected) =>
        actual is null || string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
}

public sealed class PolymorphicLookupValidationException(PolymorphicLookupProblem problem) : Exception(problem.Message)
{
    public PolymorphicLookupProblem Problem { get; } = problem;
}
