using System.Globalization;
using System.Text.Json;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.CommunityToolApi;

/// <summary>
/// Converts between the JSON value encoding of the community tool protocol and Dataverse SDK values.
/// Strings, numbers, booleans and null are plain; other values carry a "$type" tag:
/// EntityReference, OptionSetValue, Money, Decimal, Double, DateTime, Guid, OptionSetValueCollection,
/// and for execute parameters and results also Entity and EntityCollection.
/// </summary>
public static class CommunityToolValueCodec
{
    public const string TypeKey = "$type";

    // ── JSON -> SDK ──────────────────────────────────────────────────────────

    /// <summary>Decodes one value. <paramref name="path"/> names it in error messages.</summary>
    public static object? Decode(JsonElement value, string path) =>
        value.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.String => value.GetString(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => DecodeNumber(value),
            JsonValueKind.Object => DecodeTagged(value, path),
            _ => throw Invalid(path, "plain arrays are not supported; use a tagged value."),
        };

    /// <summary>Builds an entity from a values object.</summary>
    public static Entity DecodeEntity(
        string table,
        Guid? id,
        IReadOnlyDictionary<string, JsonElement>? values,
        string path)
    {
        var entity = new Entity(table);
        if (id is { } value)
            entity.Id = value;
        foreach (var (key, element) in values ?? new Dictionary<string, JsonElement>())
            entity[key] = Decode(element, $"{path}.{key}");
        return entity;
    }

    private static object DecodeNumber(JsonElement value)
    {
        if (value.TryGetInt32(out var whole))
            return whole;
        if (value.TryGetInt64(out var big))
            return big;
        return value.GetDecimal();
    }

    private static object DecodeTagged(JsonElement value, string path)
    {
        if (!value.TryGetProperty(TypeKey, out var tag) || tag.ValueKind != JsonValueKind.String)
            throw Invalid(path, $"objects must carry a string \"{TypeKey}\".");

        var type = tag.GetString();
        return type switch
        {
            "EntityReference" => new EntityReference(
                RequiredString(value, "logicalName", path),
                RequiredGuid(value, "id", path))
            {
                Name = OptionalString(value, "name", path),
            },
            "OptionSetValue" => new OptionSetValue(RequiredInt(value, "value", path)),
            "Money" => new Money(RequiredDecimal(value, "value", path)),
            "Decimal" => RequiredDecimal(value, "value", $"{path} (Decimal)"),
            "Double" => RequiredDouble(value, "value", $"{path} (Double)"),
            "DateTime" => ParseDateTime(RequiredString(value, "value", path), path),
            "Guid" => RequiredGuid(value, "value", path),
            "OptionSetValueCollection" => DecodeOptionSetValues(value, path),
            "Entity" => DecodeEntityObject(value, path),
            "EntityCollection" => DecodeEntityCollection(value, path),
            _ => throw Invalid(path, $"unknown {TypeKey} \"{type}\"."),
        };
    }

    private static OptionSetValueCollection DecodeOptionSetValues(JsonElement value, string path)
    {
        if (!value.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array)
            throw Invalid(path, "\"values\" must be an array of numbers.");

        var collection = new OptionSetValueCollection();
        foreach (var item in values.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Number || !item.TryGetInt32(out var option))
                throw Invalid(path, "\"values\" must be an array of whole numbers.");
            collection.Add(new OptionSetValue(option));
        }

        return collection;
    }

    private static Entity DecodeEntityObject(JsonElement value, string path)
    {
        if (value.TryGetProperty(TypeKey, out var tag) && tag.GetString() != "Entity")
            throw Invalid(path, $"expected {TypeKey} \"Entity\".");

        var table = RequiredString(value, "logicalName", path);
        Guid? id = value.TryGetProperty("id", out var idElement) && idElement.ValueKind != JsonValueKind.Null
            ? RequiredGuid(value, "id", path)
            : null;

        Dictionary<string, JsonElement>? values = null;
        if (value.TryGetProperty("values", out var valuesElement) && valuesElement.ValueKind != JsonValueKind.Null)
        {
            if (valuesElement.ValueKind != JsonValueKind.Object)
                throw Invalid(path, "\"values\" must be an object.");
            values = valuesElement.EnumerateObject().ToDictionary(property => property.Name, property => property.Value);
        }

        return DecodeEntity(table, id, values, $"{path}.values");
    }

    private static EntityCollection DecodeEntityCollection(JsonElement value, string path)
    {
        if (!value.TryGetProperty("entities", out var entities) || entities.ValueKind != JsonValueKind.Array)
            throw Invalid(path, "\"entities\" must be an array.");

        var collection = new EntityCollection();
        var index = 0;
        foreach (var item in entities.EnumerateArray())
        {
            var itemPath = $"{path}.entities[{index++}]";
            if (item.ValueKind != JsonValueKind.Object)
                throw Invalid(itemPath, "each entity must be an object.");
            collection.Entities.Add(DecodeEntityObject(item, itemPath));
        }

        if (collection.Entities.Count > 0)
            collection.EntityName = collection.Entities[0].LogicalName;
        return collection;
    }

    private static DateTime ParseDateTime(string text, string path)
    {
        if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var date))
            throw Invalid(path, $"\"value\" is not an ISO-8601 date: \"{text}\".");

        // An explicit offset parses as local time; Dataverse expects UTC.
        return date.Kind == DateTimeKind.Local ? date.ToUniversalTime() : date;
    }

    private static string RequiredString(JsonElement value, string name, string path)
    {
        if (!value.TryGetProperty(name, out var property)
            || property.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw Invalid(path, $"\"{name}\" must be a non-empty string.");
        }

        return property.GetString()!;
    }

    private static string? OptionalString(JsonElement value, string name, string path)
    {
        if (!value.TryGetProperty(name, out var property) || property.ValueKind == JsonValueKind.Null)
            return null;
        if (property.ValueKind != JsonValueKind.String)
            throw Invalid(path, $"\"{name}\" must be a string.");
        return property.GetString();
    }

    private static Guid RequiredGuid(JsonElement value, string name, string path)
    {
        var text = value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
        if (!Guid.TryParse(text, out var id))
            throw Invalid(path, $"\"{name}\" must be a GUID.");
        return id;
    }

    private static int RequiredInt(JsonElement value, string name, string path)
    {
        if (!value.TryGetProperty(name, out var property)
            || property.ValueKind != JsonValueKind.Number
            || !property.TryGetInt32(out var number))
        {
            throw Invalid(path, $"\"{name}\" must be a whole number.");
        }

        return number;
    }

    private static decimal RequiredDecimal(JsonElement value, string name, string path)
    {
        if (!value.TryGetProperty(name, out var property)
            || property.ValueKind != JsonValueKind.Number
            || !property.TryGetDecimal(out var number))
        {
            throw Invalid(path, $"\"{name}\" must be a number.");
        }

        return number;
    }

    private static double RequiredDouble(JsonElement value, string name, string path)
    {
        if (!value.TryGetProperty(name, out var property)
            || property.ValueKind != JsonValueKind.Number
            || !property.TryGetDouble(out var number))
        {
            throw Invalid(path, $"\"{name}\" must be a number.");
        }

        return number;
    }

    private static CommunityToolValueException Invalid(string path, string message) =>
        new($"{path}: {message}");

    // ── SDK -> JSON ──────────────────────────────────────────────────────────

    /// <summary>
    /// Encodes one SDK value into a JSON-serializable value. Unknown types become their ToString().
    /// Byte arrays become base64 strings; NaN and the infinities, which JSON cannot hold, become null.
    /// </summary>
    public static object? Encode(object? value) =>
        value switch
        {
            null => null,
            AliasedValue aliased => Encode(aliased.Value),
            double number => double.IsFinite(number) ? number : null,
            float number => float.IsFinite(number) ? number : null,
            byte[] bytes => Convert.ToBase64String(bytes),
            string or bool or int or long or decimal => value,
            Guid id => Tagged("Guid", ("value", Id(id))),
            DateTime date => Tagged("DateTime", ("value", FormatDateTime(date))),
            EntityReference reference => EncodeReference(reference),
            OptionSetValue option => Tagged("OptionSetValue", ("value", option.Value)),
            Money money => Tagged("Money", ("value", money.Value)),
            OptionSetValueCollection options =>
                Tagged("OptionSetValueCollection", ("values", options.Select(option => option.Value).ToArray())),
            Entity entity => Tagged(
                "Entity",
                ("logicalName", entity.LogicalName),
                ("id", Id(entity.Id)),
                ("values", EncodeAttributes(entity))),
            EntityCollection collection => Tagged(
                "EntityCollection",
                ("entities", collection.Entities.Select(Encode).ToArray())),
            _ => value.ToString(),
        };

    /// <summary>Every attribute of an entity, encoded.</summary>
    public static Dictionary<string, object?> EncodeAttributes(Entity entity) =>
        entity.Attributes.ToDictionary(attribute => attribute.Key, attribute => Encode(attribute.Value));

    /// <summary>Lowercase GUID without braces.</summary>
    public static string Id(Guid id) => id.ToString("D");

    private static Dictionary<string, object?> EncodeReference(EntityReference reference)
    {
        var encoded = Tagged("EntityReference", ("logicalName", reference.LogicalName), ("id", Id(reference.Id)));
        if (reference.Name is not null)
            encoded["name"] = reference.Name;
        return encoded;
    }

    private static string FormatDateTime(DateTime date) =>
        date.Kind switch
        {
            DateTimeKind.Utc => date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
            DateTimeKind.Local => date.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
            _ => date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture),
        };

    private static Dictionary<string, object?> Tagged(string type, params (string Key, object? Value)[] fields)
    {
        var result = new Dictionary<string, object?> { [TypeKey] = type };
        foreach (var (key, value) in fields)
            result[key] = value;
        return result;
    }
}
