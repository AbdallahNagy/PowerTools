using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Translator;

/// <summary>Turns Dataverse metadata into grid rows, one row per label of a component.</summary>
public static class TranslatorMapper
{
    private static readonly HashSet<AttributeTypeCode> ExcludedColumnTypes =
    [
        AttributeTypeCode.BigInt,
        AttributeTypeCode.CalendarRules,
        AttributeTypeCode.EntityName,
        AttributeTypeCode.ManagedProperty,
        AttributeTypeCode.Uniqueidentifier,
    ];

    public static Dictionary<int, string> Labels(Label? label, IReadOnlyCollection<int> lcids)
    {
        var labels = new Dictionary<int, string>();
        if (label?.LocalizedLabels is null) return labels;
        foreach (var localized in label.LocalizedLabels)
        {
            if (localized is null || !lcids.Contains(localized.LanguageCode)) continue;
            if (string.IsNullOrEmpty(localized.Label)) continue;
            labels[localized.LanguageCode] = localized.Label;
        }

        return labels;
    }

    /// <summary>The label in the base language, then any language, then the fallback.</summary>
    public static string BaseText(Label? label, int baseLcid, string fallback)
    {
        var all = label?.LocalizedLabels?.Where(item => item is not null && !string.IsNullOrWhiteSpace(item.Label)).ToList()
            ?? [];
        return all.FirstOrDefault(item => item.LanguageCode == baseLcid)?.Label
            ?? all.FirstOrDefault()?.Label
            ?? fallback;
    }

    public static IEnumerable<LabelRowDto> TableRows(EntityMetadata table, IReadOnlyCollection<int> lcids, int baseLcid)
    {
        var component = BaseText(table.DisplayName, baseLcid, table.LogicalName);
        var reason = ReadOnlyReason(table.IsCustomizable, table.IsRenameable, "table");
        yield return Row(LabelKinds.Table, table.LogicalName, LabelProperties.DisplayName, table.DisplayName);
        yield return Row(LabelKinds.Table, table.LogicalName, LabelProperties.DisplayCollectionName, table.DisplayCollectionName);
        yield return Row(LabelKinds.Table, table.LogicalName, LabelProperties.Description, table.Description);

        LabelRowDto Row(string kind, string logicalName, string property, Label? label) =>
            new()
            {
                Key = new LabelKeyDto { Kind = kind, Table = logicalName, Property = property },
                Component = component,
                ComponentName = logicalName,
                ReadOnlyReason = reason,
                Labels = Labels(label, lcids),
            };
    }

    /// <summary>
    /// Columns that are not useful to translate are left out. This is a heuristic, not a Microsoft rule:
    /// helper columns (<c>AttributeOf</c>), technical types, Virtual columns other than multi-select choices,
    /// columns with no labels at all, and rollup <c>_state</c> / <c>_date</c> helpers.
    /// </summary>
    public static bool IsExcludedColumn(AttributeMetadata attribute, IReadOnlySet<string> tableColumns)
    {
        if (!string.IsNullOrEmpty(attribute.AttributeOf)) return true;
        if (attribute.AttributeType is { } type && ExcludedColumnTypes.Contains(type)) return true;
        if (attribute.AttributeType == AttributeTypeCode.Virtual && !IsMultiSelect(attribute)) return true;
        if (!HasAnyLabel(attribute.DisplayName) && !HasAnyLabel(attribute.Description)) return true;
        return IsRollupHelper(attribute.LogicalName, tableColumns);
    }

    public static bool IsRollupHelper(string? logicalName, IReadOnlySet<string> tableColumns)
    {
        if (string.IsNullOrEmpty(logicalName)) return false;
        foreach (var suffix in new[] { "_state", "_date" })
        {
            if (logicalName.Length > suffix.Length &&
                logicalName.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) &&
                tableColumns.Contains(logicalName[..^suffix.Length]))
            {
                return true;
            }
        }

        return false;
    }

    public static bool IsMultiSelect(AttributeMetadata attribute) =>
        attribute is MultiSelectPicklistAttributeMetadata
        || attribute.AttributeTypeName?.Value == AttributeTypeDisplayName.MultiSelectPicklistType.Value;

    public static IEnumerable<LabelRowDto> ColumnRows(EntityMetadata table, IReadOnlyCollection<int> lcids, int baseLcid)
    {
        var attributes = table.Attributes ?? [];
        var names = attributes
            .Select(attribute => attribute.LogicalName)
            .Where(name => !string.IsNullOrEmpty(name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var attribute in attributes.Where(attribute => !IsExcludedColumn(attribute, names)))
        {
            var component = BaseText(attribute.DisplayName, baseLcid, attribute.LogicalName);
            var reason = ReadOnlyReason(attribute.IsCustomizable, attribute.IsRenameable, "column");
            foreach (var (property, label) in new[]
                     {
                         (LabelProperties.DisplayName, attribute.DisplayName),
                         (LabelProperties.Description, attribute.Description),
                     })
            {
                yield return new LabelRowDto
                {
                    Key = new LabelKeyDto
                    {
                        Kind = LabelKinds.Column,
                        Table = table.LogicalName,
                        Column = attribute.LogicalName,
                        Property = property,
                    },
                    Component = component,
                    ComponentName = attribute.LogicalName,
                    ReadOnlyReason = reason,
                    Labels = Labels(label, lcids),
                };
            }
        }
    }

    /// <summary>Local choices: Picklist, State, Status, and multi-select columns that do not use a global choice.</summary>
    public static IEnumerable<LabelRowDto> ChoiceRows(EntityMetadata table, IReadOnlyCollection<int> lcids, int baseLcid)
    {
        foreach (var attribute in (table.Attributes ?? []).OfType<EnumAttributeMetadata>())
        {
            if (!string.IsNullOrEmpty(attribute.AttributeOf)) continue;
            if (attribute.OptionSet is not { } optionSet || optionSet.IsGlobal == true) continue;

            var component = BaseText(attribute.DisplayName, baseLcid, attribute.LogicalName);
            var reason = attribute.IsCustomizable?.Value == false ? "This column is not customizable." : null;
            foreach (var option in optionSet.Options ?? [])
            {
                if (option.Value is not { } value) continue;
                foreach (var (property, label) in new[]
                         {
                             (LabelProperties.Label, option.Label),
                             (LabelProperties.Description, option.Description),
                         })
                {
                    yield return new LabelRowDto
                    {
                        Key = new LabelKeyDto
                        {
                            Kind = LabelKinds.Choice,
                            Table = table.LogicalName,
                            Column = attribute.LogicalName,
                            Value = value,
                            Property = property,
                        },
                        Component = component,
                        ComponentName = attribute.LogicalName,
                        ReadOnlyReason = reason,
                        Labels = Labels(label, lcids),
                    };
                }
            }
        }
    }

    /// <summary>Yes/No columns with a local option set: the True (1) and False (0) labels.</summary>
    public static IEnumerable<LabelRowDto> BooleanRows(EntityMetadata table, IReadOnlyCollection<int> lcids, int baseLcid)
    {
        foreach (var attribute in (table.Attributes ?? []).OfType<BooleanAttributeMetadata>())
        {
            if (!string.IsNullOrEmpty(attribute.AttributeOf)) continue;
            if (attribute.OptionSet is not { } optionSet || optionSet.IsGlobal == true) continue;

            var component = BaseText(attribute.DisplayName, baseLcid, attribute.LogicalName);
            var reason = attribute.IsCustomizable?.Value == false ? "This column is not customizable." : null;
            foreach (var (value, option) in new[] { (1, optionSet.TrueOption), (0, optionSet.FalseOption) })
            {
                if (option is null) continue;
                yield return new LabelRowDto
                {
                    Key = new LabelKeyDto
                    {
                        Kind = LabelKinds.Boolean,
                        Table = table.LogicalName,
                        Column = attribute.LogicalName,
                        Value = value,
                        Property = LabelProperties.Label,
                    },
                    Component = component,
                    ComponentName = attribute.LogicalName,
                    ReadOnlyReason = reason,
                    Labels = Labels(option.Label, lcids),
                };
            }
        }
    }

    /// <summary>
    /// Relationships whose related-records menu uses a custom label. A 1:N shows its menu on the
    /// referenced (one) table; an N:N shows one menu on each of its two tables.
    /// </summary>
    public static IEnumerable<LabelRowDto> RelationshipRows(EntityMetadata table, IReadOnlyCollection<int> lcids)
    {
        var logicalName = table.LogicalName;
        foreach (var relationship in table.OneToManyRelationships ?? [])
        {
            if (!Same(relationship.ReferencedEntity, logicalName)) continue;
            if (relationship.AssociatedMenuConfiguration?.Behavior != AssociatedMenuBehavior.UseLabel) continue;
            yield return RelationshipRow(relationship, relationship.AssociatedMenuConfiguration.Label, null, "1:N");
        }

        foreach (var relationship in table.ManyToManyRelationships ?? [])
        {
            if (Same(relationship.Entity1LogicalName, logicalName) &&
                relationship.Entity1AssociatedMenuConfiguration?.Behavior == AssociatedMenuBehavior.UseLabel)
            {
                yield return RelationshipRow(relationship, relationship.Entity1AssociatedMenuConfiguration.Label, 1, "N:N");
            }

            if (Same(relationship.Entity2LogicalName, logicalName) &&
                relationship.Entity2AssociatedMenuConfiguration?.Behavior == AssociatedMenuBehavior.UseLabel)
            {
                yield return RelationshipRow(relationship, relationship.Entity2AssociatedMenuConfiguration.Label, 2, "N:N");
            }
        }

        LabelRowDto RelationshipRow(RelationshipMetadataBase relationship, Label? label, int? side, string type) =>
            new()
            {
                Key = new LabelKeyDto
                {
                    Kind = LabelKinds.Relationship,
                    Table = logicalName,
                    Relationship = relationship.SchemaName,
                    Side = side,
                    Property = LabelProperties.Label,
                },
                Component = relationship.SchemaName ?? "",
                ComponentName = null,
                Detail = type,
                ReadOnlyReason = relationship.IsCustomizable?.Value == false
                    ? "This relationship is not customizable."
                    : null,
                Labels = Labels(label, lcids),
            };
    }

    public static IEnumerable<LabelRowDto> GlobalChoiceRows(
        IEnumerable<OptionSetMetadataBase> optionSets,
        IReadOnlyCollection<int> lcids,
        int baseLcid)
    {
        foreach (var optionSet in optionSets)
        {
            if (string.IsNullOrEmpty(optionSet.Name)) continue;
            var component = BaseText(optionSet.DisplayName, baseLcid, optionSet.Name);
            var reason = optionSet.IsCustomizable?.Value == false ? "This choice is not customizable." : null;
            var booleanSet = optionSet is BooleanOptionSetMetadata;

            LabelRowDto Row(int? value, string property, Label? label) =>
                new()
                {
                    Key = new LabelKeyDto
                    {
                        Kind = LabelKinds.GlobalChoice,
                        OptionSet = optionSet.Name,
                        Value = value,
                        Property = property,
                    },
                    Component = component,
                    ComponentName = optionSet.Name,
                    BooleanSet = booleanSet,
                    ReadOnlyReason = reason,
                    Labels = Labels(label, lcids),
                };

            yield return Row(null, LabelProperties.DisplayName, optionSet.DisplayName);
            yield return Row(null, LabelProperties.Description, optionSet.Description);

            if (optionSet is BooleanOptionSetMetadata boolean)
            {
                if (boolean.TrueOption is { } trueOption) yield return Row(1, LabelProperties.Label, trueOption.Label);
                if (boolean.FalseOption is { } falseOption) yield return Row(0, LabelProperties.Label, falseOption.Label);
                continue;
            }

            if (optionSet is not OptionSetMetadata list) continue;
            foreach (var option in list.Options ?? [])
            {
                if (option.Value is not { } value) continue;
                yield return Row(value, LabelProperties.Label, option.Label);
                yield return Row(value, LabelProperties.Description, option.Description);
            }
        }
    }

    /// <summary>Rows for one view or chart. <paramref name="kind"/> is view or chart.</summary>
    public static IEnumerable<LabelRowDto> RecordRows(
        string kind,
        string table,
        Entity record,
        Label? name,
        Label? description,
        IReadOnlyCollection<int> lcids,
        int baseLcid)
    {
        var noun = kind == LabelKinds.View ? "view" : "chart";
        var component = BaseText(name, baseLcid, record.Id.ToString());
        var customizable = record.GetAttributeValue<BooleanManagedProperty>("iscustomizable");
        var reason = customizable?.Value == false ? $"This {noun} is not customizable." : null;
        var detail = kind == LabelKinds.View ? ViewType(record.GetAttributeValue<int?>("querytype")) : null;

        foreach (var (property, label) in new[]
                 {
                     (LabelProperties.RecordName, name),
                     (LabelProperties.RecordDescription, description),
                 })
        {
            yield return new LabelRowDto
            {
                Key = new LabelKeyDto { Kind = kind, Table = table, RecordId = record.Id, Property = property },
                Component = component,
                Detail = detail,
                ReadOnlyReason = reason,
                Labels = Labels(label, lcids),
            };
        }
    }

    /// <summary>savedquery.querytype as text. Unknown types are shown with their number.</summary>
    public static string? ViewType(int? queryType) =>
        queryType switch
        {
            null => null,
            0 => "Public view",
            1 => "Advanced Find view",
            2 => "Associated view",
            4 => "Quick Find view",
            8 => "Reporting view",
            16 => "Offline filter",
            64 => "Lookup view",
            1024 => "Mobile view",
            _ => $"View type {queryType}",
        };

    public static string? ReadOnlyReason(BooleanManagedProperty? customizable, BooleanManagedProperty? renameable, string noun)
    {
        if (customizable?.Value == false) return $"This {noun} is not customizable.";
        // Whether a description stays editable when only renaming is blocked is unverified,
        // so the whole row is read-only.
        if (renameable?.Value == false) return $"This {noun} cannot be renamed.";
        return null;
    }

    private static bool HasAnyLabel(Label? label) =>
        label?.LocalizedLabels?.Any(item => item is not null && !string.IsNullOrWhiteSpace(item.Label)) == true;

    private static bool Same(string? left, string? right) =>
        string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
}
