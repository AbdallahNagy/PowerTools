using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk.Metadata;

namespace Dyno.Api.Tools.Agent.Components.Processes;

/// <summary>XAML namespaces exactly as the classic designer writes them.</summary>
internal static class Xns
{
    public static readonly XNamespace A = "http://schemas.microsoft.com/netfx/2009/xaml/activities";
    public static readonly XNamespace X = "http://schemas.microsoft.com/winfx/2006/xaml";
    public static readonly XNamespace Mxswa = "clr-namespace:Microsoft.Xrm.Sdk.Workflow.Activities;assembly=Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace Mxs = "clr-namespace:Microsoft.Xrm.Sdk;assembly=Microsoft.Xrm.Sdk, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace Mxsq = "clr-namespace:Microsoft.Xrm.Sdk.Query;assembly=Microsoft.Xrm.Sdk, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace Mxsw = "clr-namespace:Microsoft.Xrm.Sdk.Workflow;assembly=Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace Mcwa = "clr-namespace:Microsoft.Crm.Workflow.Activities;assembly=Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace Mva = "clr-namespace:Microsoft.VisualBasic.Activities;assembly=System.Activities, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    public static readonly XNamespace S = "clr-namespace:System;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
    public static readonly XNamespace Scg = "clr-namespace:System.Collections.Generic;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
    public static readonly XNamespace Sco = "clr-namespace:System.Collections.ObjectModel;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
    public static readonly XNamespace Srs = "clr-namespace:System.Runtime.Serialization;assembly=System.Runtime.Serialization, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
    public static readonly XNamespace This = "clr-namespace:";

    public static IEnumerable<XAttribute> Declarations() =>
    [
        new("xmlns", A.NamespaceName),
        new(XNamespace.Xmlns + "mcwa", Mcwa.NamespaceName),
        new(XNamespace.Xmlns + "mva", Mva.NamespaceName),
        new(XNamespace.Xmlns + "mxs", Mxs.NamespaceName),
        new(XNamespace.Xmlns + "mxsq", Mxsq.NamespaceName),
        new(XNamespace.Xmlns + "mxsw", Mxsw.NamespaceName),
        new(XNamespace.Xmlns + "mxswa", Mxswa.NamespaceName),
        new(XNamespace.Xmlns + "s", S.NamespaceName),
        new(XNamespace.Xmlns + "scg", Scg.NamespaceName),
        new(XNamespace.Xmlns + "sco", Sco.NamespaceName),
        new(XNamespace.Xmlns + "srs", Srs.NamespaceName),
        new(XNamespace.Xmlns + "this", This.NamespaceName),
        new(XNamespace.Xmlns + "x", X.NamespaceName),
    ];

    /// <summary>Assembly-qualified name of a designer building block.</summary>
    public static string Crm(string activity) =>
        $"Microsoft.Crm.Workflow.Activities.{activity}, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";

    public static string? CrmActivity(string? assemblyQualifiedName)
    {
        const string prefix = "Microsoft.Crm.Workflow.Activities.";
        if (assemblyQualifiedName is null || !assemblyQualifiedName.StartsWith(prefix, StringComparison.Ordinal)) return null;
        var end = assemblyQualifiedName.IndexOf(',');
        return end < 0 ? null : assemblyQualifiedName[prefix.Length..end];
    }
}

/// <summary>
/// The text of a VB expression parameter list as the designer writes it: string literals have their quotes doubled and
/// commas, quotes, markup characters and anything outside printable ASCII written as character references.
/// </summary>
internal static class VbText
{
    public static string Quote(string text)
    {
        var builder = new StringBuilder("\"");
        foreach (var c in text)
        {
            switch (c)
            {
                case '"': builder.Append("&#34;&#34;"); break;
                case ',': builder.Append("&#44;"); break;
                case '<': builder.Append("&lt;"); break;
                case '>': builder.Append("&gt;"); break;
                case '&': builder.Append("&amp;"); break;
                default:
                    if (c < 32 || c > 126) builder.Append("&#").Append((int)c).Append(';');
                    else builder.Append(c);
                    break;
            }
        }

        return builder.Append('"').ToString();
    }

    public static string Unquote(string literal)
    {
        var inner = literal.Length >= 2 && literal[0] == '"' && literal[^1] == '"' ? literal[1..^1] : literal;
        return System.Net.WebUtility.HtmlDecode(inner).Replace("\"\"", "\"");
    }

    /// <summary>The items of <c>[New Object() { a, "b", c }]</c>, split at top-level commas.</summary>
    public static List<string> Items(string expression)
    {
        var text = expression.Trim();
        var open = text.IndexOf('{');
        var close = text.LastIndexOf('}');
        if (open < 0 || close < open) return [];
        var body = text[(open + 1)..close];
        var items = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < body.Length; i++)
        {
            var c = body[i];
            if (c == '"')
            {
                if (quoted && i + 1 < body.Length && body[i + 1] == '"')
                {
                    current.Append("\"\"");
                    i++;
                    continue;
                }

                quoted = !quoted;
            }

            if (c == ',' && !quoted)
            {
                items.Add(current.ToString().Trim());
                current.Clear();
                continue;
            }

            current.Append(c);
        }

        if (current.ToString().Trim() is { Length: > 0 } last) items.Add(last);
        return items;
    }

    public static string Brackets(string? expression) =>
        expression is { Length: >= 2 } e && e[0] == '[' && e[^1] == ']' ? e[1..^1] : expression ?? "";
}

/// <summary>The kinds of value a column, argument or step input holds, with the type the XAML names.</summary>
public enum ValueKind { Text, Choice, Bool, Ref, Date, Money, Guid, Party }

internal static class ValueKinds
{
    public static string TypeName(ValueKind kind) => kind switch
    {
        ValueKind.Text => "x:String",
        ValueKind.Choice => "mxs:OptionSetValue",
        ValueKind.Bool => "x:Boolean",
        ValueKind.Ref => "mxs:EntityReference",
        ValueKind.Date => "s:DateTime",
        ValueKind.Money => "mxs:Money",
        ValueKind.Guid => "s:Guid",
        ValueKind.Party => "mxs:EntityCollection",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static ValueKind? FromTypeName(string? name) => name switch
    {
        "x:String" => ValueKind.Text,
        "mxs:OptionSetValue" => ValueKind.Choice,
        "x:Boolean" => ValueKind.Bool,
        "mxs:EntityReference" => ValueKind.Ref,
        "s:DateTime" => ValueKind.Date,
        "mxs:Money" => ValueKind.Money,
        "s:Guid" => ValueKind.Guid,
        "mxs:EntityCollection" => ValueKind.Party,
        _ => null,
    };

    /// <summary>The kind a column is written as, or null when v1 cannot write that column type.</summary>
    public static ValueKind? Of(AttributeMetadata column) => column.AttributeType switch
    {
        AttributeTypeCode.String or AttributeTypeCode.Memo => ValueKind.Text,
        AttributeTypeCode.Picklist or AttributeTypeCode.State or AttributeTypeCode.Status => ValueKind.Choice,
        AttributeTypeCode.Boolean => ValueKind.Bool,
        AttributeTypeCode.Lookup or AttributeTypeCode.Customer or AttributeTypeCode.Owner => ValueKind.Ref,
        AttributeTypeCode.Uniqueidentifier => ValueKind.Ref,
        AttributeTypeCode.DateTime => ValueKind.Date,
        AttributeTypeCode.Money => ValueKind.Money,
        AttributeTypeCode.PartyList => ValueKind.Party,
        _ => null,
    };

    public static ValueKind Of(ProcessArgumentType type) => type switch
    {
        ProcessArgumentType.String => ValueKind.Text,
        ProcessArgumentType.Boolean => ValueKind.Bool,
        ProcessArgumentType.EntityReference => ValueKind.Ref,
        ProcessArgumentType.DateTime => ValueKind.Date,
        _ => throw new AgentProblemException(AgentFaults.InvalidRequest(
            $"A custom step input of type {type} is not supported yet; string, boolean, entityReference and datetime are.")),
    };

    public static string ArgumentTypeName(ProcessArgumentType type) => type switch
    {
        ProcessArgumentType.String => "x:String",
        ProcessArgumentType.Integer => "x:Int32",
        ProcessArgumentType.Float => "x:Double",
        ProcessArgumentType.Decimal => "x:Decimal",
        ProcessArgumentType.Boolean => "x:Boolean",
        ProcessArgumentType.DateTime => "s:DateTime",
        ProcessArgumentType.EntityReference => "mxs:EntityReference",
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };

    public static ProcessArgumentType? ArgumentType(string typeName) => typeName switch
    {
        "x:String" => ProcessArgumentType.String,
        "x:Int32" => ProcessArgumentType.Integer,
        "x:Double" => ProcessArgumentType.Float,
        "x:Decimal" => ProcessArgumentType.Decimal,
        "x:Boolean" => ProcessArgumentType.Boolean,
        "s:DateTime" => ProcessArgumentType.DateTime,
        "mxs:EntityReference" => ProcessArgumentType.EntityReference,
        _ => null,
    };
}

/// <summary>A value in a step: what the spec's JSON says, parsed once.</summary>
internal abstract record PValue
{
    public static PValue Parse(JsonElement json, string where)
    {
        switch (json.ValueKind)
        {
            case JsonValueKind.String:
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                return new PLiteral(json.Clone());
            case JsonValueKind.Object:
                if (json.TryGetProperty("column", out var column))
                {
                    var from = json.TryGetProperty("from", out var f) && f.ValueKind == JsonValueKind.String ? f.GetString() : null;
                    PValue? fallback = json.TryGetProperty("default", out var d) ? Parse(d, where) : null;
                    if (fallback is not null and not (PLiteral or PLookup)) throw Invalid($"{where}: default must be a literal value.");
                    return new PColumn(Text(column, where, "column"), from, fallback);
                }

                if (json.TryGetProperty("argument", out var argument)) return new PArgument(Text(argument, where, "argument"));
                if (json.TryGetProperty("now", out var now) && now.ValueKind == JsonValueKind.True) return new PNow();
                if (json.TryGetProperty("concat", out var concat) && concat.ValueKind == JsonValueKind.Array)
                    return new PConcat(concat.EnumerateArray().Select(p => Parse(p, where)).ToList());
                if (json.TryGetProperty("lookup", out var lookup) && lookup.ValueKind == JsonValueKind.Object)
                {
                    var table = lookup.TryGetProperty("table", out var t) ? Text(t, where, "lookup.table") : throw Invalid($"{where}: lookup needs table.");
                    var idText = lookup.TryGetProperty("id", out var i) ? Text(i, where, "lookup.id") : "";
                    if (!Guid.TryParse(idText, out var id)) throw Invalid($"{where}: lookup.id must be a GUID.");
                    var name = lookup.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
                    return new PLookup(table.ToLowerInvariant(), id, name);
                }

                break;
        }

        throw Invalid($"{where}: a value is a literal, or an object with column, argument, now, concat or lookup. See powertools://guides/classic-workflows.");
    }

    private static string Text(JsonElement json, string where, string what) =>
        json.ValueKind == JsonValueKind.String && json.GetString() is { Length: > 0 } text
            ? text.Trim()
            : throw Invalid($"{where}: {what} must be a non-empty string.");

    public abstract JsonNode ToJson();

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

internal sealed record PLiteral(JsonElement Value) : PValue
{
    public override JsonNode ToJson() => JsonNode.Parse(Value.GetRawText())!;

    public string AsText() => Value.ValueKind == JsonValueKind.String ? Value.GetString()! : Value.GetRawText();
}

internal sealed record PColumn(string Column, string? From, PValue? Default) : PValue
{
    public override JsonNode ToJson()
    {
        var node = new JsonObject { ["column"] = Column };
        if (From is not null) node["from"] = From;
        if (Default is not null) node["default"] = Default.ToJson();
        return node;
    }
}

internal sealed record PArgument(string Name) : PValue
{
    public override JsonNode ToJson() => new JsonObject { ["argument"] = Name };
}

internal sealed record PNow : PValue
{
    public override JsonNode ToJson() => new JsonObject { ["now"] = true };
}

internal sealed record PConcat(List<PValue> Parts) : PValue
{
    public override JsonNode ToJson() => new JsonObject { ["concat"] = new JsonArray(Parts.Select(p => p.ToJson()).ToArray()) };
}

internal sealed record PLookup(string Table, Guid Id, string? Name) : PValue
{
    public override JsonNode ToJson()
    {
        var lookup = new JsonObject { ["table"] = Table, ["id"] = Id.ToString("D") };
        if (!string.IsNullOrEmpty(Name)) lookup["name"] = Name;
        return new JsonObject { ["lookup"] = lookup };
    }
}

internal static class Literals
{
    public static JsonNode Choice(string text) =>
        int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? JsonValue.Create(n) : JsonValue.Create(text);

    public static bool Bool(string text) => text is "1" || string.Equals(text, "true", StringComparison.OrdinalIgnoreCase);
}
