using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.AttributeExplorer;

public static class AttributeExplorerMapper
{
    public static IReadOnlyList<TableDto> Tables(IEnumerable<EntityMetadata> tables) =>
        tables
            .Where(table => table.IsPrivate != true)
            .Select(Table)
            .OrderBy(table => table.DisplayName ?? table.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(table => table.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static TableDto Table(EntityMetadata table) =>
        new(
            table.LogicalName ?? "",
            table.SchemaName ?? table.LogicalName ?? "",
            LabelText(table.DisplayName),
            table.EntitySetName,
            table.ObjectTypeCode,
            table.PrimaryIdAttribute,
            table.PrimaryNameAttribute,
            table.IsCustomEntity == true,
            table.IsManaged == true,
            table.IsIntersect == true,
            table.IsActivity == true,
            table.OwnershipType?.ToString());

    public static IReadOnlyList<AttributeDto> Attributes(EntityMetadata table)
    {
        var relationships = table.ManyToOneRelationships ?? [];
        return (table.Attributes ?? [])
            .Where(attribute => string.IsNullOrEmpty(attribute.AttributeOf))
            .Select(attribute => Attribute(attribute, relationships))
            .OrderBy(attribute => attribute.DisplayName ?? attribute.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(attribute => attribute.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static AttributeDto Attribute(
        AttributeMetadata attribute,
        IReadOnlyCollection<OneToManyRelationshipMetadata> manyToOne)
    {
        int? maxLength = null;
        string? format = null;
        string? dateTimeBehavior = null;
        string? minValue = null;
        string? maxValue = null;
        int? precision = null;
        IReadOnlyList<string>? targets = null;
        IReadOnlyList<RelationshipDto>? relationships = null;
        OptionSetDto? optionSet = null;
        BooleanOptionsDto? booleanOptions = null;
        string? defaultValue = null;

        switch (attribute)
        {
            case StringAttributeMetadata text:
                maxLength = text.MaxLength;
                format = text.Format?.ToString();
                break;
            case MemoAttributeMetadata memo:
                maxLength = memo.MaxLength;
                format = memo.Format?.ToString();
                break;
            case IntegerAttributeMetadata integer:
                minValue = Number(integer.MinValue);
                maxValue = Number(integer.MaxValue);
                format = integer.Format?.ToString();
                break;
            case BigIntAttributeMetadata bigInt:
                minValue = Number(bigInt.MinValue);
                maxValue = Number(bigInt.MaxValue);
                break;
            case DecimalAttributeMetadata number:
                minValue = Number(number.MinValue);
                maxValue = Number(number.MaxValue);
                precision = number.Precision;
                break;
            case DoubleAttributeMetadata number:
                minValue = Number(number.MinValue);
                maxValue = Number(number.MaxValue);
                precision = number.Precision;
                break;
            case MoneyAttributeMetadata money:
                minValue = Number(money.MinValue);
                maxValue = Number(money.MaxValue);
                precision = money.Precision;
                break;
            case DateTimeAttributeMetadata date:
                format = date.Format?.ToString();
                dateTimeBehavior = date.DateTimeBehavior?.Value;
                break;
            case LookupAttributeMetadata lookup:
                targets = (lookup.Targets ?? []).Where(target => !string.IsNullOrEmpty(target)).ToList();
                relationships = manyToOne
                    .Where(relationship => string.Equals(
                        relationship.ReferencingAttribute,
                        attribute.LogicalName,
                        StringComparison.OrdinalIgnoreCase))
                    .Select(relationship => new RelationshipDto(
                        relationship.SchemaName ?? "",
                        relationship.ReferencedEntity ?? ""))
                    .OrderBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                break;
            case EnumAttributeMetadata choice:
                optionSet = OptionSet(choice.OptionSet);
                defaultValue = DefaultChoice(choice, optionSet);
                break;
            case BooleanAttributeMetadata boolean:
                booleanOptions = new BooleanOptionsDto(
                    LabelText(boolean.OptionSet?.TrueOption?.Label),
                    LabelText(boolean.OptionSet?.FalseOption?.Label));
                defaultValue = DefaultBoolean(boolean, booleanOptions);
                break;
        }

        return new AttributeDto(
            attribute.LogicalName ?? "",
            attribute.SchemaName ?? attribute.LogicalName ?? "",
            LabelText(attribute.DisplayName),
            LabelText(attribute.Description),
            attribute.AttributeType?.ToString() ?? "Unknown",
            attribute.AttributeTypeName?.Value,
            attribute.RequiredLevel?.Value.ToString() ?? "None",
            attribute.IsCustomAttribute == true,
            attribute.IsManaged == true,
            attribute.IsPrimaryId == true,
            attribute.IsPrimaryName == true,
            attribute.SourceType,
            attribute.IntroducedVersion,
            attribute.MetadataId?.ToString(),
            attribute.ColumnNumber,
            attribute.IsValidForCreate,
            attribute.IsValidForUpdate,
            attribute.IsValidForRead,
            attribute.IsValidForAdvancedFind?.Value,
            attribute.IsAuditEnabled?.Value,
            attribute.IsSecured,
            attribute.IsFilterable,
            attribute.IsRetrievable,
            maxLength,
            format,
            dateTimeBehavior,
            minValue,
            maxValue,
            precision,
            targets,
            relationships,
            optionSet,
            booleanOptions,
            defaultValue);
    }

    /// <summary>User-language label, then the first stored label, else null.</summary>
    public static string? LabelText(Label? label)
    {
        var user = label?.UserLocalizedLabel?.Label;
        if (!string.IsNullOrWhiteSpace(user))
            return user;

        var first = label?.LocalizedLabels?
            .Select(item => item.Label)
            .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));
        return string.IsNullOrWhiteSpace(first) ? null : first;
    }

    private static OptionSetDto? OptionSet(OptionSetMetadata? set)
    {
        if (set is null)
            return null;

        var options = (set.Options ?? [])
            .Where(option => option.Value is not null)
            .Select(option => new OptionDto(
                option.Value!.Value,
                LabelText(option.Label) ?? option.Value.Value.ToString(CultureInfo.InvariantCulture)))
            .ToList();
        return new OptionSetDto(set.Name, set.IsGlobal == true, options);
    }

    private static string? DefaultChoice(EnumAttributeMetadata choice, OptionSetDto? optionSet)
    {
        if (choice.DefaultFormValue is not { } value || value < 0)
            return null;

        var match = optionSet?.Options.FirstOrDefault(option => option.Value == value);
        var text = value.ToString(CultureInfo.InvariantCulture);
        return match is null ? text : $"{match.Label} ({text})";
    }

    private static string? DefaultBoolean(BooleanAttributeMetadata boolean, BooleanOptionsDto options)
    {
        if (boolean.DefaultValue is not { } value)
            return null;

        return value ? options.TrueLabel ?? "True" : options.FalseLabel ?? "False";
    }

    private static string? Number<T>(T? value) where T : struct, IFormattable =>
        value?.ToString(null, CultureInfo.InvariantCulture);
}
