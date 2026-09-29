using Microsoft.Xrm.Sdk;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Fetch;

public sealed record FetchProjection(
    IReadOnlyList<Dictionary<string, object?>> Records,
    IReadOnlyList<string> Columns,
    IReadOnlyDictionary<string, string> ColumnTypes);

public static class FetchResultProjector
{
    public static FetchProjection Project(IEnumerable<Entity> entities, string valueMode)
    {
        var list = entities as IList<Entity> ?? entities.ToList();
        var columns = list
            .SelectMany(entity => entity.Attributes.Keys)
            .Distinct()
            .OrderBy(key => key)
            .ToList();

        var columnTypes = columns.ToDictionary(
            column => column,
            column =>
            {
                var firstNonNull = list
                    .Select(entity => entity.Attributes.TryGetValue(column, out var value) ? value : null)
                    .FirstOrDefault(value => value != null);
                return DataverseValueFormatter.GetTypeTag(firstNonNull);
            });

        var records = list
            .Select(entity => MapRecord(entity, valueMode))
            .ToList();

        return new FetchProjection(records, columns, columnTypes);
    }

    private static Dictionary<string, object?> MapRecord(Entity entity, string valueMode)
    {
        if (valueMode == FetchValueModes.Builder)
        {
            var builderRecord = new Dictionary<string, object?> { ["id"] = entity.Id.ToString() };
            foreach (var key in entity.Attributes.Keys)
            {
                if (entity[key] is OptionSetValue or bool
                    && entity.FormattedValues.TryGetValue(key, out var label))
                {
                    builderRecord[key] = label;
                }
                else
                {
                    builderRecord[key] = DataverseValueFormatter.Format(entity[key]);
                }
            }

            return builderRecord;
        }

        var record = new Dictionary<string, object?>();
        foreach (var key in entity.Attributes.Keys)
            record[key] = MapTesterValue(entity, key, valueMode);
        return record;
    }

    private static object? MapTesterValue(Entity entity, string key, string valueMode)
    {
        entity.Attributes.TryGetValue(key, out var value);
        if (valueMode == FetchValueModes.Formatted
            && entity.FormattedValues.TryGetValue(key, out var formatted))
        {
            return formatted;
        }

        return MapRaw(value);
    }

    private static object? MapRaw(object? value) => value switch
    {
        null => null,
        AliasedValue aliased => MapRaw(aliased.Value),
        EntityReference reference => reference.Id.ToString(),
        OptionSetValue option => option.Value,
        Money money => money.Value,
        OptionSetValueCollection options => string.Join(",", options.Select(option => option.Value)),
        string or bool or DateTime or int or long or decimal or double or float or Guid => value,
        _ => value.ToString()
    };
}
