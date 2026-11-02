using System.Text.Json;
using System.Text.RegularExpressions;

namespace PowerTools.API.Tools.EnvironmentVariables;

/// <summary>
/// Value and definition rules. Dataverse does not validate environment variable values,
/// so these checks are the only guard before a value is written.
/// </summary>
public static partial class EnvironmentVariablesRules
{
    public const int SchemaNameMaxLength = 100;
    public const int DisplayNameMaxLength = 100;
    public const int DescriptionMaxLength = 2000;
    public const int ValueMaxLength = 2000;

    private static readonly string[] ReservedDisplayNames = ["$authentication", "$connection"];

    [GeneratedRegex(@"^-?\d+(\.\d+)?$")]
    private static partial Regex NumberPattern();

    [GeneratedRegex(
        @"^/subscriptions/[^/\s]+/resourceGroups/[^/\s]+/providers/Microsoft\.KeyVault/vaults/[^/\s]+/secrets/[^/\s]+$",
        RegexOptions.IgnoreCase)]
    private static partial Regex SecretPathPattern();

    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$")]
    private static partial Regex SchemaNamePattern();

    public static string TypeLabel(int type) => type switch
    {
        (int)EnvironmentVariableType.String => "Text",
        (int)EnvironmentVariableType.Number => "Number",
        (int)EnvironmentVariableType.Boolean => "Boolean",
        (int)EnvironmentVariableType.Json => "JSON",
        (int)EnvironmentVariableType.DataSource => "Data Source",
        (int)EnvironmentVariableType.Secret => "Secret",
        _ => $"Unknown ({type})",
    };

    /// <summary>Types offered on create. Data Source needs connector settings and is left out; Secret is online only.</summary>
    public static bool CanCreate(int type, bool onPremises) => type switch
    {
        (int)EnvironmentVariableType.String
            or (int)EnvironmentVariableType.Number
            or (int)EnvironmentVariableType.Boolean
            or (int)EnvironmentVariableType.Json => true,
        (int)EnvironmentVariableType.Secret => !onPremises,
        _ => false,
    };

    /// <summary>Returns null when <paramref name="value"/> is valid for the type, otherwise the reason.</summary>
    public static string? ValidateValue(int type, string? value, bool required)
    {
        if (string.IsNullOrEmpty(value))
            return required ? "Enter a value, or delete the value to use the default." : null;
        if (value.Length > ValueMaxLength)
            return $"The value is longer than {ValueMaxLength} characters.";

        return type switch
        {
            (int)EnvironmentVariableType.Number when !NumberPattern().IsMatch(value) => "Enter a decimal number.",
            (int)EnvironmentVariableType.Boolean when value is not ("yes" or "no") => "Enter yes or no.",
            (int)EnvironmentVariableType.Json when !IsJson(value) => "Enter valid JSON.",
            (int)EnvironmentVariableType.Secret when !SecretPathPattern().IsMatch(value) =>
                "Enter an Azure Key Vault secret path: /subscriptions/{id}/resourceGroups/{group}/providers/Microsoft.KeyVault/vaults/{vault}/secrets/{secret}.",
            _ => null,
        };
    }

    public static string? ValidateDisplayName(string? displayName)
    {
        if (string.IsNullOrWhiteSpace(displayName))
            return "Enter a display name.";
        if (displayName.Length > DisplayNameMaxLength)
            return $"The display name is longer than {DisplayNameMaxLength} characters.";
        if (ReservedDisplayNames.Any(name => string.Equals(name, displayName.Trim(), StringComparison.OrdinalIgnoreCase)))
            return $"{displayName.Trim()} is reserved. Choose another display name.";
        return null;
    }

    public static string? ValidateDescription(string? description) =>
        description is { Length: > DescriptionMaxLength }
            ? $"The description is longer than {DescriptionMaxLength} characters."
            : null;

    /// <summary>
    /// Schema names are a publisher prefix, an underscore, then letters, digits, or underscores.
    /// When a solution is chosen, the prefix must be its publisher's.
    /// </summary>
    public static string? ValidateSchemaName(string? schemaName, string? requiredPrefix)
    {
        if (string.IsNullOrWhiteSpace(schemaName))
            return "Enter a schema name.";
        if (schemaName.Length > SchemaNameMaxLength)
            return $"The schema name is longer than {SchemaNameMaxLength} characters.";
        if (!SchemaNamePattern().IsMatch(schemaName))
            return "Use a prefix, an underscore, then letters, digits, or underscores, such as contoso_ApiUrl.";
        if (!string.IsNullOrEmpty(requiredPrefix)
            && !schemaName.StartsWith(requiredPrefix + "_", StringComparison.OrdinalIgnoreCase))
            return $"The schema name must start with {requiredPrefix}_, the solution publisher's prefix.";
        return null;
    }

    private static bool IsJson(string value)
    {
        try
        {
            using var _ = JsonDocument.Parse(value);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
