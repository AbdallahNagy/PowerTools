using System.Text.RegularExpressions;

namespace Dyno.Api.Tools.Agent.Components.Tables;

/// <summary>
/// Checks a table spec before anything is read, so a bad spec fails with one message that says what to change,
/// instead of a half-built plan. These rules do not depend on the environment.
/// </summary>
public static partial class TableSpecRules
{
    public const int MaxTextLength = 4000;
    public const int MaxMemoLength = 1_048_576;
    public const int MaxFileSizeKb = 10_485_760;
    public const int MaxOptions = 400;
    public const int MaxKeyColumns = 16;

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_]*$")]
    private static partial Regex SchemaNamePattern();

    [GeneratedRegex("^[a-z][a-z0-9_]*$")]
    private static partial Regex LogicalNamePattern();

    public static void Validate(TableApplySpec spec)
    {
        if (string.IsNullOrWhiteSpace(spec.Solution)) throw Invalid("solution is required.");
        if (spec.Table is null) throw Invalid("table is required.");
        SchemaName(spec.Table.SchemaName, "table.schemaName");

        var primary = spec.Table.PrimaryName;
        if (primary?.SchemaName is { } primaryName) SchemaName(primaryName, "table.primaryName.schemaName");
        if (primary?.MaxLength is { } primaryLength) InRange(primaryLength, 1, MaxTextLength, "table.primaryName.maxLength");

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (primary?.SchemaName is { } reserved) names.Add(reserved);
        foreach (var (column, index) in (spec.Columns ?? []).Select((c, i) => (c, i)))
        {
            var at = $"columns[{index}]";
            if (column is null) throw Invalid($"{at} is empty.");
            SchemaName(column.SchemaName, $"{at}.schemaName");
            if (!names.Add(column.SchemaName))
            {
                throw Invalid(primary?.SchemaName is { } p && string.Equals(p, column.SchemaName, StringComparison.OrdinalIgnoreCase)
                    ? $"{at}: {column.SchemaName} is the primary name column; set it under table.primaryName."
                    : $"{at}: column {column.SchemaName} is listed twice.");
            }

            Column(column, at);
        }

        var relationships = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (relationship, index) in (spec.ManyToMany ?? []).Select((r, i) => (r, i)))
        {
            var at = $"manyToMany[{index}]";
            if (relationship is null) throw Invalid($"{at} is empty.");
            SchemaName(relationship.SchemaName, $"{at}.schemaName");
            LogicalName(relationship.Table, $"{at}.table");
            if (!relationships.Add(relationship.SchemaName)) throw Invalid($"{at}: relationship {relationship.SchemaName} is listed twice.");
        }

        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, index) in (spec.Keys ?? []).Select((k, i) => (k, i)))
        {
            var at = $"keys[{index}]";
            if (key is null) throw Invalid($"{at} is empty.");
            SchemaName(key.SchemaName, $"{at}.schemaName");
            if (!keys.Add(key.SchemaName)) throw Invalid($"{at}: key {key.SchemaName} is listed twice.");
            if (key.Columns is not { Count: > 0 } || key.Columns.Count > MaxKeyColumns)
                throw Invalid($"{at}.columns needs from 1 to {MaxKeyColumns} column logical names.");
            foreach (var name in key.Columns) LogicalName(name, $"{at}.columns");
            if (key.Columns.Distinct(StringComparer.OrdinalIgnoreCase).Count() != key.Columns.Count)
                throw Invalid($"{at}.columns lists a column twice.");
        }
    }

    private static void Column(ColumnDefinition column, string at)
    {
        var type = column.Type;
        void Only(bool given, string property, string types, params ColumnType[] allowed)
        {
            if (given && !allowed.Contains(type))
                throw Invalid($"{at}.{property} is only for {types} columns, and {column.SchemaName} is {TableColumns.TypeName(type)}.");
        }

        Only(column.MaxLength is not null, "maxLength", "text and memo", ColumnType.Text, ColumnType.Memo);
        Only(column.Format is not null, "format", "text", ColumnType.Text);
        Only(column.MinValue is not null, "minValue", "integer, decimal, float and money", ColumnType.Integer, ColumnType.Decimal, ColumnType.Float, ColumnType.Money);
        Only(column.MaxValue is not null, "maxValue", "integer, decimal, float and money", ColumnType.Integer, ColumnType.Decimal, ColumnType.Float, ColumnType.Money);
        Only(column.Precision is not null, "precision", "decimal, float and money", ColumnType.Decimal, ColumnType.Float, ColumnType.Money);
        Only(column.Behavior is not null, "behavior", "datetime and dateonly", ColumnType.DateTime, ColumnType.DateOnly);
        Only(column.Options is not null, "options", "choice and multichoice", ColumnType.Choice, ColumnType.MultiChoice);
        Only(column.GlobalChoice is not null, "globalChoice", "choice and multichoice", ColumnType.Choice, ColumnType.MultiChoice);
        Only(column.TrueLabel is not null, "trueLabel", "boolean", ColumnType.Boolean);
        Only(column.FalseLabel is not null, "falseLabel", "boolean", ColumnType.Boolean);
        Only(column.Target is not null, "target", "lookup", ColumnType.Lookup);
        Only(column.RelationshipName is not null, "relationshipName", "lookup", ColumnType.Lookup);
        Only(column.MaxSizeInKb is not null, "maxSizeInKb", "file", ColumnType.File);

        if (column.MaxLength is { } length)
            InRange(length, 1, type == ColumnType.Memo ? MaxMemoLength : MaxTextLength, $"{at}.maxLength");
        if (column.Precision is { } precision)
        {
            var max = type switch { ColumnType.Decimal => 10, ColumnType.Float => 5, _ => 4 };
            InRange(precision, 0, max, $"{at}.precision");
        }

        if (column.MinValue is { } min && column.MaxValue is { } maxValue && min > maxValue)
            throw Invalid($"{at}.minValue is above maxValue.");
        if (type == ColumnType.Integer)
        {
            foreach (var (value, name) in new[] { (column.MinValue, "minValue"), (column.MaxValue, "maxValue") })
            {
                if (value is { } v && (v != Math.Floor(v) || v < int.MinValue || v > int.MaxValue))
                    throw Invalid($"{at}.{name} must be a whole number from {int.MinValue} to {int.MaxValue}.");
            }
        }

        var limit = TableColumns.Limit(type);
        if (limit is { } range)
        {
            foreach (var (value, name) in new[] { (column.MinValue, "minValue"), (column.MaxValue, "maxValue") })
            {
                if (value is { } v && (v < range.Min || v > range.Max))
                    throw Invalid($"{at}.{name} must be from {TableColumns.Number(range.Min)} to {TableColumns.Number(range.Max)}.");
            }
        }

        if (type == ColumnType.DateTime && column.Behavior == DateBehavior.DateOnly)
            throw Invalid($"{at}: behavior dateOnly needs type dateonly.");
        if (column.MaxSizeInKb is { } size) InRange(size, 1, MaxFileSizeKb, $"{at}.maxSizeInKb");
        if (column.TrueLabel is { Length: 0 } || column.FalseLabel is { Length: 0 })
            throw Invalid($"{at}: trueLabel and falseLabel cannot be empty.");

        if (type is ColumnType.Choice or ColumnType.MultiChoice)
        {
            if (column.Options is not null && column.GlobalChoice is not null)
                throw Invalid($"{at}: give options or globalChoice, not both.");
            if (column.Options is { } options) Options(options, $"{at}.options");
        }

        if (type == ColumnType.Lookup)
        {
            if (string.IsNullOrWhiteSpace(column.Target)) throw Invalid($"{at}.target is required for a lookup.");
            LogicalName(column.Target!, $"{at}.target");
            if (column.RelationshipName is { } relationship) SchemaName(relationship, $"{at}.relationshipName");
        }
    }

    private static void Options(List<OptionDefinition> options, string at)
    {
        if (options.Count is < 1 or > MaxOptions) throw Invalid($"{at} needs from 1 to {MaxOptions} options.");
        var values = new HashSet<int>();
        var labels = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (option, index) in options.Select((o, i) => (o, i)))
        {
            if (option is null || string.IsNullOrWhiteSpace(option.Label)) throw Invalid($"{at}[{index}].label is required.");
            if (option.Value is { } value && !values.Add(value)) throw Invalid($"{at}: value {value} is used twice.");
            if (!labels.Add(option.Label)) throw Invalid($"{at}: label '{option.Label}' is used twice.");
        }
    }

    private static void SchemaName(string? value, string at)
    {
        if (string.IsNullOrWhiteSpace(value) || !SchemaNamePattern().IsMatch(value))
            throw Invalid($"{at} must be a schema name: letters, digits and underscores, starting with a letter.");
    }

    private static void LogicalName(string? value, string at)
    {
        if (string.IsNullOrWhiteSpace(value) || !LogicalNamePattern().IsMatch(value))
            throw Invalid($"{at} must be a logical name in lower case, for example account.");
    }

    private static void InRange(int value, int min, int max, string at)
    {
        if (value < min || value > max) throw Invalid($"{at} must be from {min} to {max}.");
    }

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
