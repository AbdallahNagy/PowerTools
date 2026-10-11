using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.RecycleBin;

/// <summary>Turns the attributes of a deleted record into display-ready field rows.</summary>
public static class RecycleBinValues
{
    public static IReadOnlyList<FieldDto> ToFields(Entity record) =>
        record.Attributes
            .Where(pair => pair.Value is not null and not AliasedValue)
            .Select(pair => ToField(record, pair.Key, pair.Value))
            .OrderBy(field => field.LogicalName, StringComparer.Ordinal)
            .ToList();

    public static FieldDto ToField(Entity record, string name, object value)
    {
        var formatted = record.FormattedValues.TryGetValue(name, out var text) ? text : null;
        return value switch
        {
            EntityReference reference => new FieldDto(
                name,
                "lookup",
                reference.Id.ToString("D"),
                reference.Name ?? formatted,
                reference.LogicalName),
            OptionSetValue option => new FieldDto(
                name,
                "choice",
                option.Value.ToString(CultureInfo.InvariantCulture),
                formatted,
                null),
            OptionSetValueCollection options => new FieldDto(
                name,
                "multichoice",
                string.Join(",", options.Select(option => option.Value.ToString(CultureInfo.InvariantCulture))),
                formatted,
                null),
            bool flag => new FieldDto(name, "boolean", flag ? "true" : "false", formatted, null),
            DateTime date => new FieldDto(name, "datetime", RecycleBinQueries.Utc(AsUtc(date)), null, null),
            Money money => new FieldDto(
                name,
                "money",
                money.Value.ToString(CultureInfo.InvariantCulture),
                formatted,
                null),
            int or long or decimal or double or float => new FieldDto(
                name,
                "number",
                Convert.ToString(value, CultureInfo.InvariantCulture),
                formatted,
                null),
            Guid id => new FieldDto(name, "guid", id.ToString("D"), null, null),
            string textValue => new FieldDto(name, "string", textValue, null, null),
            EntityCollection parties => new FieldDto(
                name,
                "other",
                string.Join("; ", parties.Entities.Select(PartyName).Where(party => party.Length > 0)),
                formatted,
                null),
            byte[] => new FieldDto(name, "other", null, "(binary data)", null),
            _ => new FieldDto(name, "other", Convert.ToString(value, CultureInfo.InvariantCulture), formatted, null),
        };
    }

    private static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(value, DateTimeKind.Utc) : value;

    private static string PartyName(Entity party) =>
        party.GetAttributeValue<EntityReference>("partyid") is { } reference
            ? reference.Name ?? reference.Id.ToString("D")
            : party.GetAttributeValue<string>("addressused") ?? "";
}
