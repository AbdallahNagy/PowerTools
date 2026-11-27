using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Tables;

/// <summary>One difference between a column and its spec, and how to make it on the column's metadata.</summary>
public sealed record ColumnChange(string Field, string From, string To, Action<AttributeMetadata> Apply, string? BlockedReason = null);

/// <summary>
/// Column rules for table_apply: how a column type maps to Dataverse metadata, what a new column looks like, and
/// which differences an existing column can take. Pure functions, so they are tested without Dataverse.
/// </summary>
public static class TableColumns
{
    public const double MoneyLimit = 922_337_203_685_477;
    public const double DecimalLimit = 100_000_000_000;

    public static string TypeName(ColumnType type) => type switch
    {
        ColumnType.MultiChoice => "multichoice",
        ColumnType.DateOnly => "dateonly",
        ColumnType.DateTime => "datetime",
        _ => type.ToString().ToLowerInvariant(),
    };

    /// <summary>The range Dataverse allows for a number column's minimum and maximum.</summary>
    public static (double Min, double Max)? Limit(ColumnType type) => type switch
    {
        ColumnType.Integer => (int.MinValue, int.MaxValue),
        ColumnType.Decimal or ColumnType.Float => (-DecimalLimit, DecimalLimit),
        ColumnType.Money => (-MoneyLimit, MoneyLimit),
        _ => null,
    };

    public static string Number(double value) => value.ToString("R", CultureInfo.InvariantCulture);

    /// <summary>The spec type of an existing column, or null for a column table_apply does not manage.</summary>
    public static ColumnType? TypeOf(AttributeMetadata attribute) => attribute switch
    {
        MemoAttributeMetadata => ColumnType.Memo,
        StringAttributeMetadata => ColumnType.Text,
        IntegerAttributeMetadata => ColumnType.Integer,
        DecimalAttributeMetadata => ColumnType.Decimal,
        DoubleAttributeMetadata => ColumnType.Float,
        MoneyAttributeMetadata => ColumnType.Money,
        BooleanAttributeMetadata => ColumnType.Boolean,
        DateTimeAttributeMetadata date => date.Format == DateTimeFormat.DateOnly ? ColumnType.DateOnly : ColumnType.DateTime,
        MultiSelectPicklistAttributeMetadata => ColumnType.MultiChoice,
        PicklistAttributeMetadata => ColumnType.Choice,
        LookupAttributeMetadata => ColumnType.Lookup,
        FileAttributeMetadata => ColumnType.File,
        ImageAttributeMetadata => ColumnType.Image,
        _ => null,
    };

    public static AttributeRequiredLevel Level(RequiredLevel level) => level switch
    {
        RequiredLevel.Recommended => AttributeRequiredLevel.Recommended,
        RequiredLevel.Required => AttributeRequiredLevel.ApplicationRequired,
        _ => AttributeRequiredLevel.None,
    };

    public static string LevelName(AttributeRequiredLevel? level) => level switch
    {
        AttributeRequiredLevel.Recommended => "recommended",
        AttributeRequiredLevel.ApplicationRequired or AttributeRequiredLevel.SystemRequired => "required",
        _ => "none",
    };

    public static StringFormatName Format(TextFormat format) => format switch
    {
        TextFormat.Email => StringFormatName.Email,
        TextFormat.Url => StringFormatName.Url,
        TextFormat.Phone => StringFormatName.Phone,
        TextFormat.TextArea => StringFormatName.TextArea,
        _ => StringFormatName.Text,
    };

    public static string FormatName(StringFormatName? format) =>
        format?.Value is { } value ? value.ToLowerInvariant() : "text";

    public static DateTimeBehavior Behavior(DateBehavior behavior) => behavior switch
    {
        DateBehavior.DateOnly => DateTimeBehavior.DateOnly,
        DateBehavior.TimeZoneIndependent => DateTimeBehavior.TimeZoneIndependent,
        _ => DateTimeBehavior.UserLocal,
    };

    public static string BehaviorName(DateTimeBehavior? behavior) => behavior?.Value switch
    {
        "DateOnly" => "dateOnly",
        "TimeZoneIndependent" => "timeZoneIndependent",
        _ => "userLocal",
    };

    public static string BehaviorName(DateBehavior behavior) => BehaviorName(Behavior(behavior));

    /// <summary>
    /// The behavior a new column gets when the spec leaves it out: a date-only column holds a calendar day, so it is
    /// Date only and never shifts across time zones; a date and time column is User local, as in the maker portal.
    /// </summary>
    public static DateBehavior DefaultBehavior(ColumnType type) => type == ColumnType.DateOnly ? DateBehavior.DateOnly : DateBehavior.UserLocal;

    /// <summary>
    /// A new column's metadata, apart from lookups (a relationship) and the choice options, which the caller adds.
    /// Every value comes from the spec or a fixed default, so the plan detail can name it.
    /// </summary>
    public static AttributeMetadata New(ColumnDefinition column)
    {
        AttributeMetadata attribute = column.Type switch
        {
            ColumnType.Text => new StringAttributeMetadata
            {
                MaxLength = column.MaxLength ?? 100,
                FormatName = Format(column.Format ?? TextFormat.Text),
            },
            ColumnType.Memo => new MemoAttributeMetadata { MaxLength = column.MaxLength ?? 2000, Format = StringFormat.TextArea },
            ColumnType.Integer => new IntegerAttributeMetadata
            {
                Format = IntegerFormat.None,
                MinValue = (int)(column.MinValue ?? int.MinValue),
                MaxValue = (int)(column.MaxValue ?? int.MaxValue),
            },
            ColumnType.Decimal => new DecimalAttributeMetadata
            {
                Precision = column.Precision ?? 2,
                MinValue = (decimal)(column.MinValue ?? -DecimalLimit),
                MaxValue = (decimal)(column.MaxValue ?? DecimalLimit),
            },
            ColumnType.Float => new DoubleAttributeMetadata
            {
                Precision = column.Precision ?? 2,
                MinValue = column.MinValue ?? -DecimalLimit,
                MaxValue = column.MaxValue ?? DecimalLimit,
            },
            ColumnType.Money => new MoneyAttributeMetadata
            {
                // PrecisionSource 2 is the currency's precision; 0 uses Precision.
                Precision = column.Precision ?? 2,
                PrecisionSource = column.Precision is null ? 2 : 0,
                MinValue = column.MinValue ?? -MoneyLimit,
                MaxValue = column.MaxValue ?? MoneyLimit,
            },
            ColumnType.Boolean => new BooleanAttributeMetadata { DefaultValue = false },
            ColumnType.DateTime => new DateTimeAttributeMetadata(DateTimeFormat.DateAndTime)
            {
                DateTimeBehavior = Behavior(column.Behavior ?? DateBehavior.UserLocal),
            },
            ColumnType.DateOnly => new DateTimeAttributeMetadata(DateTimeFormat.DateOnly)
            {
                DateTimeBehavior = Behavior(column.Behavior ?? DefaultBehavior(ColumnType.DateOnly)),
            },
            ColumnType.Choice => new PicklistAttributeMetadata(),
            ColumnType.MultiChoice => new MultiSelectPicklistAttributeMetadata(),
            ColumnType.File => new FileAttributeMetadata { MaxSizeInKB = column.MaxSizeInKb ?? 32768 },
            ColumnType.Image => new ImageAttributeMetadata { CanStoreFullImage = false },
            _ => throw new ArgumentOutOfRangeException(nameof(column), $"{column.Type} is built as a relationship."),
        };
        attribute.SchemaName = column.SchemaName;
        attribute.RequiredLevel = new AttributeRequiredLevelManagedProperty(Level(column.RequiredLevel ?? RequiredLevel.None));
        if (column.AuditEnabled is { } audit) attribute.IsAuditEnabled = new BooleanManagedProperty(audit);
        return attribute;
    }

    /// <summary>The settings a new column gets, as the plan shows them. It names every value the request carries.</summary>
    public static string NewDetail(ColumnDefinition column)
    {
        var parts = new List<string> { TypeName(column.Type), Quote(column.DisplayName) };
        if (column.Description is { } description) parts.Add($"description {Quote(description)}");
        parts.Add($"required {(column.RequiredLevel ?? RequiredLevel.None).ToString().ToLowerInvariant()}");
        if (column.AuditEnabled is { } audit) parts.Add($"audit {(audit ? "on" : "off")}");
        switch (column.Type)
        {
            case ColumnType.Text:
                parts.Add($"max length {column.MaxLength ?? 100}");
                parts.Add($"format {FormatName(Format(column.Format ?? TextFormat.Text))}");
                break;
            case ColumnType.Memo:
                parts.Add($"max length {column.MaxLength ?? 2000}");
                break;
            case ColumnType.Integer or ColumnType.Decimal or ColumnType.Float or ColumnType.Money:
                var (min, max) = Defaults(column.Type);
                if (column.Type != ColumnType.Integer)
                    parts.Add(column.Type == ColumnType.Money && column.Precision is null ? "precision of the currency" : $"precision {column.Precision ?? 2}");
                parts.Add($"from {Number(column.MinValue ?? min)} to {Number(column.MaxValue ?? max)}");
                break;
            case ColumnType.Boolean:
                parts.Add($"yes {Quote(column.TrueLabel ?? "Yes")}, no {Quote(column.FalseLabel ?? "No")}");
                break;
            case ColumnType.DateTime or ColumnType.DateOnly:
                parts.Add($"behavior {BehaviorName(column.Behavior ?? DefaultBehavior(column.Type))}");
                break;
            case ColumnType.File:
                parts.Add($"max size {column.MaxSizeInKb ?? 32768} KB");
                break;
        }

        return string.Join(", ", parts);
    }

    private static (double Min, double Max) Defaults(ColumnType type) => type switch
    {
        ColumnType.Integer => (int.MinValue, int.MaxValue),
        ColumnType.Money => (-MoneyLimit, MoneyLimit),
        _ => (-DecimalLimit, DecimalLimit),
    };

    /// <summary>
    /// What an existing column of the same type must change to match the spec. Only what the spec gives is compared,
    /// and labels only in the base language. A change Dataverse does not allow comes back with a reason.
    /// </summary>
    public static IReadOnlyList<ColumnChange> Changes(ColumnDefinition column, AttributeMetadata current, int language)
    {
        var changes = new List<ColumnChange>();
        var renameBlocked = current.IsRenameable is { Value: false }
            ? $"{current.LogicalName} cannot be renamed (managed property)."
            : null;

        if (column.DisplayName is { } display && !Labels.Matches(current.DisplayName, display, language))
        {
            changes.Add(new ColumnChange("display name", Quote(Labels.Text(current.DisplayName, language)), Quote(display),
                a => a.DisplayName = Labels.Make(display, language), renameBlocked));
        }

        if (column.Description is { } description && !Labels.Matches(current.Description, description, language))
        {
            changes.Add(new ColumnChange("description", Quote(Labels.Text(current.Description, language)), Quote(description),
                a => a.Description = Labels.Make(description, language)));
        }

        if (column.RequiredLevel is { } level && LevelName(current.RequiredLevel?.Value) != LevelName(Level(level)))
        {
            var blocked = current.RequiredLevel is { CanBeChanged: false }
                ? $"The required level of {current.LogicalName} cannot be changed (managed property)."
                : current.RequiredLevel?.Value == AttributeRequiredLevel.SystemRequired
                    ? $"{current.LogicalName} is required by the system."
                    : null;
            changes.Add(new ColumnChange("required", LevelName(current.RequiredLevel?.Value), LevelName(Level(level)),
                a => a.RequiredLevel = new AttributeRequiredLevelManagedProperty(Level(level)) { CanBeChanged = true }, blocked));
        }

        if (column.AuditEnabled is { } audit && (current.IsAuditEnabled?.Value ?? false) != audit)
        {
            var blocked = current.IsAuditEnabled is { CanBeChanged: false }
                ? $"Auditing of {current.LogicalName} cannot be changed (managed property)."
                : null;
            changes.Add(new ColumnChange("audit", OnOff(current.IsAuditEnabled?.Value ?? false), OnOff(audit),
                a => a.IsAuditEnabled = new BooleanManagedProperty(audit), blocked));
        }

        switch (current)
        {
            case MemoAttributeMetadata memo:
                if (column.MaxLength is { } memoLength && memo.MaxLength != memoLength)
                    changes.Add(new ColumnChange("max length", $"{memo.MaxLength}", $"{memoLength}", a => ((MemoAttributeMetadata)a).MaxLength = memoLength));
                break;
            case StringAttributeMetadata text:
                if (column.MaxLength is { } length && text.MaxLength != length)
                    changes.Add(new ColumnChange("max length", $"{text.MaxLength}", $"{length}", a => ((StringAttributeMetadata)a).MaxLength = length));
                if (column.Format is { } format && FormatName(text.FormatName) != FormatName(Format(format)))
                {
                    changes.Add(new ColumnChange("format", FormatName(text.FormatName), FormatName(Format(format)),
                        a => ((StringAttributeMetadata)a).FormatName = Format(format)));
                }

                break;
            case IntegerAttributeMetadata integer:
                Range(changes, column, integer.MinValue, integer.MaxValue,
                    (a, v) => ((IntegerAttributeMetadata)a).MinValue = (int)v, (a, v) => ((IntegerAttributeMetadata)a).MaxValue = (int)v);
                break;
            case DecimalAttributeMetadata number:
                Range(changes, column, (double?)number.MinValue, (double?)number.MaxValue,
                    (a, v) => ((DecimalAttributeMetadata)a).MinValue = (decimal)v, (a, v) => ((DecimalAttributeMetadata)a).MaxValue = (decimal)v);
                Precision(changes, column, number.Precision, (a, p) => ((DecimalAttributeMetadata)a).Precision = p);
                break;
            case DoubleAttributeMetadata number:
                Range(changes, column, number.MinValue, number.MaxValue,
                    (a, v) => ((DoubleAttributeMetadata)a).MinValue = v, (a, v) => ((DoubleAttributeMetadata)a).MaxValue = v);
                Precision(changes, column, number.Precision, (a, p) => ((DoubleAttributeMetadata)a).Precision = p);
                break;
            case MoneyAttributeMetadata money:
                Range(changes, column, money.MinValue, money.MaxValue,
                    (a, v) => ((MoneyAttributeMetadata)a).MinValue = v, (a, v) => ((MoneyAttributeMetadata)a).MaxValue = v);
                if (column.Precision is { } precision && (money.Precision != precision || money.PrecisionSource != 0))
                {
                    var from = money.PrecisionSource == 0 ? $"{money.Precision}" : "of the currency";
                    changes.Add(new ColumnChange("precision", from, $"{precision}", a =>
                    {
                        ((MoneyAttributeMetadata)a).Precision = precision;
                        ((MoneyAttributeMetadata)a).PrecisionSource = 0;
                    }));
                }

                break;
            case DateTimeAttributeMetadata date:
                DateChanges(changes, column, date);
                break;
            case FileAttributeMetadata file:
                if (column.MaxSizeInKb is { } size && file.MaxSizeInKB != size)
                {
                    changes.Add(new ColumnChange("max size", $"{file.MaxSizeInKB} KB", $"{size} KB", _ => { },
                        $"The maximum size of file column {current.LogicalName} is fixed once created. Remove the column and create it again (its files are lost)."));
                }

                break;
        }

        return changes;
    }

    private static void DateChanges(List<ColumnChange> changes, ColumnDefinition column, DateTimeAttributeMetadata date)
    {
        var currentBehavior = BehaviorName(date.DateTimeBehavior);
        var wantedFormat = column.Type == ColumnType.DateOnly ? DateTimeFormat.DateOnly : DateTimeFormat.DateAndTime;
        if (date.Format != wantedFormat)
        {
            // A date-only behavior needs the date-only format, so that column cannot get a time back.
            var blocked = currentBehavior == "dateOnly" && wantedFormat == DateTimeFormat.DateAndTime
                ? $"{date.LogicalName} has behavior dateOnly, which keeps no time. It cannot become a datetime column."
                : null;
            changes.Add(new ColumnChange("type", column.Type == ColumnType.DateOnly ? "datetime" : "dateonly", TypeName(column.Type),
                a => ((DateTimeAttributeMetadata)a).Format = wantedFormat, blocked));
        }

        if (column.Behavior is { } behavior && currentBehavior != BehaviorName(behavior))
        {
            var blocked = currentBehavior != "userLocal"
                ? $"The behavior of {date.LogicalName} is {currentBehavior}. Dataverse allows a change only from userLocal."
                : date.CanChangeDateTimeBehavior is { Value: false }
                    ? $"The behavior of {date.LogicalName} cannot be changed (managed property)."
                    : null;
            changes.Add(new ColumnChange("behavior", currentBehavior, BehaviorName(behavior),
                a => ((DateTimeAttributeMetadata)a).DateTimeBehavior = Behavior(behavior), blocked));
        }
    }

    private static void Range(
        List<ColumnChange> changes, ColumnDefinition column, double? min, double? max,
        Action<AttributeMetadata, double> setMin, Action<AttributeMetadata, double> setMax)
    {
        if (column.MinValue is { } wantedMin && min != wantedMin)
            changes.Add(new ColumnChange("min", min is null ? "none" : Number(min.Value), Number(wantedMin), a => setMin(a, wantedMin)));
        if (column.MaxValue is { } wantedMax && max != wantedMax)
            changes.Add(new ColumnChange("max", max is null ? "none" : Number(max.Value), Number(wantedMax), a => setMax(a, wantedMax)));
    }

    private static void Precision(List<ColumnChange> changes, ColumnDefinition column, int? current, Action<AttributeMetadata, int> set)
    {
        if (column.Precision is { } precision && current != precision)
            changes.Add(new ColumnChange("precision", current?.ToString(CultureInfo.InvariantCulture) ?? "none", $"{precision}", a => set(a, precision)));
    }

    public static string Quote(string? text) => text is null ? "(none)" : $"'{text}'";

    public static string OnOff(bool value) => value ? "on" : "off";
}
