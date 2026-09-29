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

    public static CascadeConfiguration ToCascadeConfiguration(CascadeBody? cascade)
    {
        var configuration = PolymorphicCascade();
        if (cascade is null) return configuration;

        configuration.Assign = ParseCascade(cascade.Assign) ?? configuration.Assign;
        configuration.Delete = ParseCascade(cascade.Delete) ?? configuration.Delete;
        configuration.Merge = ParseCascade(cascade.Merge) ?? configuration.Merge;
        configuration.Reparent = ParseCascade(cascade.Reparent) ?? configuration.Reparent;
        configuration.Share = ParseCascade(cascade.Share) ?? configuration.Share;
        configuration.Unshare = ParseCascade(cascade.Unshare) ?? configuration.Unshare;
        configuration.RollupView = ParseCascade(cascade.RollupView) ?? configuration.RollupView;
        return configuration;
    }

    public static PolymorphicLookupProblem? ValidateCascade(CascadeBody? cascade)
    {
        if (cascade is null) return null;

        return UnknownCascade(cascade.Assign, LinkCascadeActions, "Assign")
            ?? UnknownCascade(cascade.Delete, DeleteCascadeActions, "Delete")
            ?? UnknownCascade(cascade.Merge, LinkCascadeActions, "Merge")
            ?? UnknownCascade(cascade.Reparent, LinkCascadeActions, "Reparent")
            ?? UnknownCascade(cascade.Share, LinkCascadeActions, "Share")
            ?? UnknownCascade(cascade.Unshare, LinkCascadeActions, "Unshare")
            ?? UnknownCascade(cascade.RollupView, RollupCascadeActions, "Rollup view");
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
            CascadeConfiguration = ToCascadeConfiguration(body.Cascade),
            AssociatedMenuConfiguration = menu,
        };
    }

    private static readonly string[] LinkCascadeActions = ["Cascade", "Active", "UserOwned", "NoCascade"];
    private static readonly string[] DeleteCascadeActions = ["Cascade", "RemoveLink", "Restrict", "NoCascade"];
    private static readonly string[] RollupCascadeActions = ["Cascade", "NoCascade"];

    private static PolymorphicLookupProblem? UnknownCascade(string? value, string[] allowed, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (allowed.Any(item => string.Equals(item, value, StringComparison.OrdinalIgnoreCase))) return null;
        return PolymorphicLookupFaults.Local(
            "UnknownCascadeBehavior",
            $"{field} cascade '{value}' is not a cascade behavior.");
    }

    private static CascadeType? ParseCascade(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim().ToLowerInvariant() switch
        {
            "cascade" => CascadeType.Cascade,
            "active" => CascadeType.Active,
            "userowned" => CascadeType.UserOwned,
            "nocascade" => CascadeType.NoCascade,
            "removelink" => CascadeType.RemoveLink,
            "restrict" => CascadeType.Restrict,
            _ => null,
        };
    }
}

public sealed class PolymorphicLookupValidationException(PolymorphicLookupProblem problem) : Exception(problem.Message)
{
    public PolymorphicLookupProblem Problem { get; } = problem;
}
