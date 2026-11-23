using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Dyno.Api.Tools.Agent.Components.Processes;

/// <summary>A process's XAML read back into the steps of <see cref="ProcessApplySpec"/>.</summary>
public sealed class ProcessReading
{
    /// <summary>The primary table, when the XAML names it (an action's Target, or a read of the primary record).</summary>
    public string? Table { get; set; }

    /// <summary>The steps in spec shape. A step Power Tools cannot write back is <c>{keep: id}</c>.</summary>
    public JsonArray Steps { get; } = [];

    public List<ProcessArgument> Arguments { get; } = [];

    /// <summary>What the XAML has that a spec cannot hold, for example output arguments.</summary>
    public List<string> Problems { get; } = [];

    /// <summary>Steps kept as they are, by step id.</summary>
    public Dictionary<string, XElement> Keeps { get; } = new(StringComparer.Ordinal);

    public List<XElement> WorkflowVariables { get; } = [];

    public HashSet<Guid> ChildWorkflows { get; } = [];

    public Dictionary<string, (Guid Id, string? Table)> Messages { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Custom workflow activity types by type name, with their assembly-qualified name.</summary>
    public Dictionary<string, string> CustomTypes { get; } = new(StringComparer.Ordinal);

    /// <summary>The columns the steps read or write, by table, with the kind the XAML gives them when it does.</summary>
    public Dictionary<string, Dictionary<string, ValueKind?>> Columns { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Lookups on the primary record that steps go through, with the table each points to.</summary>
    public Dictionary<string, string> Lookups { get; } = new(StringComparer.OrdinalIgnoreCase);

    internal void Column(string table, string column, ValueKind? kind)
    {
        if (!Columns.TryGetValue(table, out var columns)) Columns[table] = columns = new(StringComparer.OrdinalIgnoreCase);
        if (kind is not null || !columns.ContainsKey(column)) columns[column] = kind ?? columns.GetValueOrDefault(column);
    }
}

/// <summary>
/// Reads the XAML the classic designer writes (and <see cref="ProcessXamlWriter"/> writes) into typed steps. A step it
/// does not recognize, or one with a value it cannot express, becomes a keep step that names the step's id, so a
/// read process can be sent back to process_apply without losing it.
/// </summary>
public static partial class ProcessXamlReader
{
    private const string PropertyType = "Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.";

    public static ProcessReading Read(string xaml)
    {
        var reading = new ProcessReading();
        XElement root;
        try
        {
            root = XElement.Parse(xaml);
        }
        catch (System.Xml.XmlException e)
        {
            reading.Problems.Add($"The XAML could not be read: {e.Message}");
            return reading;
        }

        ReadMembers(root, reading);
        var workflow = root.Element(Xns.Mxswa + "Workflow");
        if (workflow is null)
        {
            reading.Problems.Add("The XAML has no workflow body.");
            return reading;
        }

        reading.WorkflowVariables.AddRange(workflow.Element(Xns.Mxswa + "Workflow.Variables")?.Elements() ?? []);
        var steps = workflow.Elements().Where(e => e.Name != Xns.Mxswa + "Workflow.Variables");
        foreach (var step in new Reader(reading).Steps(steps)) reading.Steps.Add(step);
        return reading;
    }

    /// <summary>The step numbers used by an element and everything inside it.</summary>
    public static IEnumerable<int> StepNumbers(XElement element) =>
        element.DescendantsAndSelf()
            .Select(e => e.Attribute("DisplayName")?.Value)
            .Select(name => name is null ? null : StepNumber(StepId(name)))
            .Where(n => n is not null)
            .Select(n => n!.Value);

    public static int? StepNumber(string id) =>
        StepIdPattern().Match(id) is { Success: true } match && int.TryParse(match.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var n)
            ? n
            : null;

    private static string StepId(string displayName)
    {
        var colon = displayName.IndexOf(':');
        return (colon < 0 ? displayName : displayName[..colon]).Trim();
    }

    private static string? StepLabel(string displayName)
    {
        var colon = displayName.IndexOf(':');
        return colon < 0 || displayName[(colon + 1)..].Trim() is not { Length: > 0 } label ? null : label;
    }

    [GeneratedRegex(@"^([A-Za-z]+)Step(\d+)$")]
    private static partial Regex StepIdPattern();

    private static void ReadMembers(XElement root, ProcessReading reading)
    {
        foreach (var property in root.Element(Xns.X + "Members")?.Elements(Xns.X + "Property") ?? [])
        {
            var name = property.Attribute("Name")?.Value ?? "";
            if (name is "InputEntities" or "CreatedEntities") continue;
            var type = property.Attribute("Type")?.Value ?? "";
            var attributes = property.Element(Xns.X + "Property.Attributes")?.Elements()
                .ToDictionary(a => a.Name.LocalName, a => a.Attribute("Value")?.Value ?? "", StringComparer.Ordinal) ?? [];
            if (attributes.GetValueOrDefault("ArgumentTargetAttribute") == "True")
            {
                reading.Table = attributes.GetValueOrDefault("ArgumentEntityAttribute") is { Length: > 0 } table ? table : reading.Table;
                continue;
            }

            if (!type.StartsWith("InArgument(", StringComparison.Ordinal))
            {
                reading.Problems.Add($"Argument {name} is an output argument; process_apply cannot write output arguments yet.");
                continue;
            }

            var argumentType = ValueKinds.ArgumentType(type["InArgument(".Length..^1]);
            if (argumentType is null)
            {
                reading.Problems.Add($"Argument {name} has type {type}, which process_apply cannot write yet.");
                continue;
            }

            reading.Arguments.Add(new ProcessArgument
            {
                Name = name,
                Type = argumentType.Value,
                Required = attributes.GetValueOrDefault("ArgumentRequiredAttribute") == "True" ? true : null,
                Table = attributes.GetValueOrDefault("ArgumentEntityAttribute") is { Length: > 0 } t ? t : null,
                Description = attributes.GetValueOrDefault("ArgumentDescriptionAttribute") is { Length: > 0 } d ? d : null,
            });
        }
    }

    private sealed class Unreadable(string reason) : Exception(reason);

    /// <summary>A read of a column, kept with the table so a condition's literal can say what kind the column is.</summary>
    private sealed record ColumnRead(PColumn Value, string Table);

    private sealed class Reader(ProcessReading reading)
    {
        private int unnamed;

        public List<JsonObject> Steps(IEnumerable<XElement> elements)
        {
            var result = new List<JsonObject>();
            foreach (var element in elements)
            {
                if (element.Name == Xns.A + "Persist") continue;
                result.Add(Step(element));
            }

            return result;
        }

        private JsonObject Step(XElement element)
        {
            var display = element.Attribute("DisplayName")?.Value;
            var id = display is null ? $"Unnamed{++unnamed}" : StepId(display);
            var label = display is null ? null : StepLabel(display);
            JsonObject step;
            try
            {
                var kind = StepIdPattern().Match(id) is { Success: true } m ? m.Groups[1].Value : "";
                var activity = Xns.CrmActivity(element.Attribute("AssemblyQualifiedName")?.Value);
                step = (kind, element.Name.LocalName, activity) switch
                {
                    ("Update", "Sequence", _) => Update(element),
                    ("Create", "Sequence", _) => Create(element),
                    ("SendEmail", "Sequence", _) => SendEmail(element),
                    ("Assign", "Sequence", _) => Assign(element),
                    ("SetState", "SetState", _) => SetState(element),
                    ("Condition", "ActivityReference", "ConditionSequence") => If(element),
                    ("ChildWorkflow", "Sequence", _) => ChildWorkflow(element),
                    ("InvokeSdkMessage", "ActivityReference", "Composite") => Action(element),
                    ("CustomActivity", "ActivityReference", "Composite") => CustomActivity(element),
                    ("StopWorkflow", "Sequence", _) => Stop(element),
                    _ => throw new Unreadable("Power Tools does not write this kind of step."),
                };
            }
            catch (Unreadable e)
            {
                reading.Keeps[id] = element;
                step = new JsonObject { ["keep"] = id, ["summary"] = e.Message };
            }

            if (label is null) return step;
            var labelled = new JsonObject { ["label"] = label };
            foreach (var (key, value) in step.ToList())
            {
                step.Remove(key);
                labelled[key] = value;
            }

            return labelled;
        }

        // ── Steps ────────────────────────────────────────────────────────────

        private JsonObject Update(XElement sequence)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            var values = new JsonObject();
            string? record = null;
            foreach (var activity in Activities(sequence))
            {
                if (Value(activity, env)) continue;
                switch (activity.Name.LocalName)
                {
                    case "Assign":
                        continue;
                    case "SetEntityProperty":
                        values[activity.Attribute("Attribute")!.Value] = Set(activity, env).ToJson();
                        continue;
                    case "UpdateEntity":
                        record = Record(TempKey(activity.Attribute("Entity")?.Value));
                        continue;
                    default:
                        throw new Unreadable($"The update has a {activity.Name.LocalName} activity Power Tools does not write.");
                }
            }

            var update = new JsonObject();
            if (record is not null) update["record"] = record;
            update["values"] = values;
            return new JsonObject { ["update"] = update };
        }

        private JsonObject Create(XElement sequence)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            var values = new JsonObject();
            string? table = null;
            foreach (var activity in Activities(sequence))
            {
                if (Value(activity, env)) continue;
                switch (activity.Name.LocalName)
                {
                    case "Assign":
                        continue;
                    case "SetEntityProperty":
                        values[activity.Attribute("Attribute")!.Value] = Set(activity, env).ToJson();
                        continue;
                    case "CreateEntity":
                        table = activity.Attribute("EntityName")?.Value;
                        continue;
                    default:
                        throw new Unreadable($"The create has a {activity.Name.LocalName} activity Power Tools does not write.");
                }
            }

            return new JsonObject { ["create"] = new JsonObject { ["table"] = table ?? throw new Unreadable("The create names no table."), ["values"] = values } };
        }

        private JsonObject SendEmail(XElement sequence)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            var email = new JsonObject();
            var values = new JsonObject();
            var sent = false;
            foreach (var activity in Activities(sequence))
            {
                if (Value(activity, env)) continue;
                switch (activity.Name.LocalName)
                {
                    case "Assign":
                        continue;
                    case "SetEntityProperty":
                    {
                        var column = activity.Attribute("Attribute")!.Value;
                        var variable = VbText.Brackets(activity.Attribute("Value")?.Value);
                        switch (column)
                        {
                            case "from":
                                var from = Party(env, variable);
                                if (from.Count != 1) throw new Unreadable("The email has more than one sender.");
                                email["from"] = from[0].ToJson();
                                break;
                            case "to" or "cc":
                                email[column] = new JsonArray(Party(env, variable).Select(p => p.ToJson()).ToArray());
                                break;
                            case "subject":
                                email["subject"] = Set(activity, env).ToJson();
                                break;
                            case "description":
                                email["body"] = Set(activity, env).ToJson();
                                break;
                            case "regardingobjectid":
                                var regarding = Set(activity, env);
                                if (!(regarding is PColumn { From: null, Default: null } c && reading.Table is { } table
                                      && string.Equals(c.Column, $"{table}id", StringComparison.OrdinalIgnoreCase)))
                                    email["regarding"] = regarding.ToJson();
                                break;
                            default:
                                values[column] = Set(activity, env).ToJson();
                                break;
                        }

                        continue;
                    }

                    case "SendEmail":
                        sent = true;
                        continue;
                    default:
                        throw new Unreadable($"The email step has a {activity.Name.LocalName} activity Power Tools does not write.");
                }
            }

            if (!sent || email["subject"] is null) throw new Unreadable("The email step has no subject or does not send.");
            if (values.Count > 0) email["values"] = values;
            return new JsonObject { ["sendEmail"] = Ordered(email, "from", "to", "cc", "subject", "body", "regarding", "values") };
        }

        private JsonObject Assign(XElement sequence)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            JsonObject? assign = null;
            foreach (var activity in Activities(sequence))
            {
                if (Value(activity, env)) continue;
                if (activity.Name.LocalName != "AssignEntity")
                    throw new Unreadable($"The assign step has a {activity.Name.LocalName} activity Power Tools does not write.");
                var owner = DirectCastVariable(activity.Attribute("Owner")?.Value);
                assign = new JsonObject();
                if (Record(EntityKey(activity.Attribute("Entity")?.Value)) is { } record) assign["record"] = record;
                assign["owner"] = Get(env, owner).ToJson();
            }

            return new JsonObject { ["assign"] = assign ?? throw new Unreadable("The assign step assigns nothing.") };
        }

        private JsonObject SetState(XElement element)
        {
            var state = new JsonObject();
            if (Record(EntityKey(element.Attribute("Entity")?.Value)) is { } record) state["record"] = record;
            state["state"] = OptionSet(element.Element(Xns.Mxswa + "SetState.State"));
            state["status"] = OptionSet(element.Element(Xns.Mxswa + "SetState.Status"));
            return new JsonObject { ["setState"] = state };
        }

        private static int OptionSet(XElement? argument) =>
            argument?.Descendants(Xns.Mxs + "OptionSetValue").FirstOrDefault()?.Attribute("Value")?.Value is { } text
            && int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
                ? value
                : throw new Unreadable("The status change has no literal state and status.");

        private JsonObject ChildWorkflow(XElement sequence)
        {
            var start = Activities(sequence).ToList() is [{ Name.LocalName: "StartChildWorkflow" } only] ? only : throw new Unreadable("The child workflow step has other activities.");
            if (EntityKey(start.Attribute("EntityId")?.Value.Replace(".Id]", "]")) != "primaryEntity")
                throw new Unreadable("The child workflow runs on a record other than the primary record.");
            if (!Guid.TryParse(start.Attribute("WorkflowId")?.Value, out var id)) throw new Unreadable("The child workflow has no workflow id.");
            reading.ChildWorkflows.Add(id);
            return new JsonObject { ["childWorkflow"] = id.ToString("D") };
        }

        private JsonObject Action(XElement composite)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            JsonObject? action = null;
            foreach (var activity in Activities(composite))
            {
                if (Value(activity, env)) continue;
                if (activity.Name != Xns.Mcwa + "InvokeSdkMessageActivity")
                    throw new Unreadable($"The action step has a {activity.Name.LocalName} activity Power Tools does not write.");
                var arguments = activity.Element(Xns.Mcwa + "InvokeSdkMessageActivity.Arguments")?.Elements().ToList() ?? [];
                if (arguments is not [var target] || target.Attribute(Xns.X + "Key")?.Value != "Target")
                    throw new Unreadable("The action step passes arguments other than Target.");
                var name = activity.Attribute("SdkMessageName")?.Value ?? throw new Unreadable("The action step names no message.");
                if (!Guid.TryParse(activity.Attribute("SdkMessageId")?.Value, out var messageId)) throw new Unreadable("The action step has no message id.");
                var bound = activity.Attribute("SdkMessageEntityName")?.Value is { Length: > 0 } t ? t : null;
                reading.Messages[name] = (messageId, bound);
                if (Get(env, DirectCastVariable(target.Value)) is not PColumn { From: null, Default: null } column)
                    throw new Unreadable("The action's Target is not the primary record or a lookup on it.");
                action = new JsonObject { ["name"] = name };
                if (!(reading.Table is { } table && string.Equals(column.Column, $"{table}id", StringComparison.OrdinalIgnoreCase)))
                    action["record"] = column.Column;
            }

            return new JsonObject { ["action"] = action ?? throw new Unreadable("The action step calls no action.") };
        }

        private JsonObject CustomActivity(XElement composite)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            JsonObject? custom = null;
            foreach (var activity in Activities(composite))
            {
                if (custom is not null) throw new Unreadable("The custom step reads its outputs back; Power Tools keeps such steps as they are.");
                if (Value(activity, env)) continue;
                var aqn = activity.Attribute("AssemblyQualifiedName")?.Value;
                if (activity.Name != Xns.Mxswa + "ActivityReference" || aqn is null || Xns.CrmActivity(aqn) is not null)
                    throw new Unreadable($"The custom step has a {activity.Name.LocalName} activity Power Tools does not write.");
                var type = aqn[..aqn.IndexOf(',')].Trim();
                reading.CustomTypes[type] = aqn;
                var inputs = new JsonArray();
                foreach (var argument in activity.Element(Xns.Mxswa + "ActivityReference.Arguments")?.Elements() ?? [])
                {
                    if (argument.Name != Xns.A + "InArgument") throw new Unreadable("The custom step has outputs.");
                    var argumentType = ValueKinds.ArgumentType(argument.Attribute(Xns.X + "TypeArguments")?.Value ?? "");
                    if (argumentType is not (ProcessArgumentType.String or ProcessArgumentType.Boolean or ProcessArgumentType.EntityReference or ProcessArgumentType.DateTime))
                        throw new Unreadable($"The custom step has an input of type {argument.Attribute(Xns.X + "TypeArguments")?.Value}.");
                    var variable = DirectCastVariable(argument.Value);
                    inputs.Add(new JsonObject
                    {
                        ["name"] = argument.Attribute(Xns.X + "Key")?.Value,
                        ["type"] = JsonSerializer.SerializeToNode(argumentType.Value),
                        ["value"] = env.TryGetValue(variable, out var value) ? AsValue(value).ToJson() : null,
                    });
                }

                custom = new JsonObject { ["type"] = type };
                if (inputs.Count > 0) custom["inputs"] = inputs;
            }

            return new JsonObject { ["customActivity"] = custom ?? throw new Unreadable("The custom step runs no activity.") };
        }

        private JsonObject Stop(XElement sequence)
        {
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            JsonObject? stop = null;
            foreach (var activity in Activities(sequence))
            {
                if (Value(activity, env)) continue;
                if (activity.Name != Xns.A + "TerminateWorkflow") throw new Unreadable($"The stop step has a {activity.Name.LocalName} activity.");
                var exception = activity.Attribute("Exception")?.Value ?? "";
                var status = exception.Contains("OperationStatus.Succeeded", StringComparison.Ordinal) ? "succeeded"
                    : exception.Contains("OperationStatus.Canceled", StringComparison.Ordinal) ? "canceled"
                    : throw new Unreadable("The stop step ends with a status Power Tools does not write.");
                stop = new JsonObject { ["status"] = status };
                if (Get(env, DirectCastVariable(activity.Attribute("Reason")?.Value)) is not PLiteral message)
                    throw new Unreadable("The stop message is not plain text.");
                if (message.AsText() is { Length: > 0 } text) stop["message"] = text;
            }

            return new JsonObject { ["stop"] = stop ?? throw new Unreadable("The stop step does not stop.") };
        }

        private JsonObject If(XElement sequence)
        {
            var properties = sequence.Element(Xns.Mxswa + "ActivityReference.Properties") ?? throw new Unreadable("The condition has no branches.");
            var activities = Keyed(properties, "Activities")?.Elements() ?? [];
            var env = new Dictionary<string, object>(StringComparer.Ordinal);
            var conditions = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
            var branches = new List<(JsonObject? Condition, List<JsonObject> Then)>();
            foreach (var activity in activities)
            {
                if (Value(activity, env)) continue;
                switch (Xns.CrmActivity(activity.Attribute("AssemblyQualifiedName")?.Value))
                {
                    case "EvaluateCondition":
                        Condition(activity, env, conditions);
                        continue;
                    case "EvaluateLogicalCondition":
                        Logical(activity, conditions);
                        continue;
                    case "ConditionBranch":
                    {
                        var test = Keyed(activity.Element(Xns.Mxswa + "ActivityReference.Arguments"), "Condition")?.Value.Trim();
                        var branchProperties = activity.Element(Xns.Mxswa + "ActivityReference.Properties");
                        if (Keyed(branchProperties, "Else") is { } otherwise && otherwise.Name != Xns.X + "Null")
                            throw new Unreadable("The branch has an else of its own.");
                        var then = Keyed(branchProperties, "Then") is { } composite ? Steps(Activities(composite)) : [];
                        if (test == "True")
                        {
                            branches.Add((null, then));
                            continue;
                        }

                        var condition = conditions.GetValueOrDefault(VbText.Brackets(test)) ?? throw new Unreadable("The branch tests a condition Power Tools cannot read.");
                        branches.Add((condition, then));
                        continue;
                    }

                    default:
                        throw new Unreadable($"The condition has a {activity.Name.LocalName} activity Power Tools does not write.");
                }
            }

            if (branches.Count == 0 || branches[0].Condition is null) throw new Unreadable("The condition has no first branch.");
            if (branches.Take(branches.Count - 1).Any(b => b.Condition is null)) throw new Unreadable("The else branch is not the last.");
            var result = new JsonObject
            {
                ["condition"] = branches[0].Condition,
                ["then"] = new JsonArray(branches[0].Then.ToArray<JsonNode?>()),
            };
            var elseIf = branches.Skip(1).Where(b => b.Condition is not null)
                .Select(b => (JsonNode?)new JsonObject { ["condition"] = b.Condition, ["then"] = new JsonArray(b.Then.ToArray<JsonNode?>()) })
                .ToArray();
            if (elseIf.Length > 0) result["elseIf"] = new JsonArray(elseIf);
            if (branches[^1].Condition is null) result["else"] = new JsonArray(branches[^1].Then.ToArray<JsonNode?>());
            return new JsonObject { ["if"] = result };
        }

        private void Condition(XElement activity, Dictionary<string, object> env, Dictionary<string, JsonObject> conditions)
        {
            var arguments = activity.Element(Xns.Mxswa + "ActivityReference.Arguments");
            var op = Keyed(arguments, "ConditionOperator")?.Value.Trim() switch
            {
                "Equal" => "equals",
                "NotEqual" => "notEquals",
                "Null" => "null",
                "NotNull" => "notNull",
                "In" => "in",
                var other => throw new Unreadable($"The condition uses operator {other}, which Power Tools does not write yet."),
            };
            var operand = VbText.Brackets(Keyed(arguments, "Operand")?.Value.Trim());
            var parameters = Keyed(arguments, "Parameters") is { } p && p.Name != Xns.X + "Null"
                ? VbText.Items(p.Value).Select(item => Get(env, item)).ToList()
                : [];
            if (parameters.Any(v => v is not (PLiteral or PLookup))) throw new Unreadable("The condition compares with a value that is not a literal.");

            var condition = new JsonObject();
            switch (env.GetValueOrDefault(operand))
            {
                case ColumnRead read:
                    condition["column"] = read.Value.Column;
                    if (read.Value.From is not null) condition["from"] = read.Value.From;
                    if (parameters.FirstOrDefault() is { } first) reading.Column(read.Table, read.Value.Column, KindOf(first));
                    break;
                case PArgument argument:
                    condition["argument"] = argument.Name;
                    break;
                default:
                    throw new Unreadable("The condition tests something other than a column or an argument.");
            }

            condition["operator"] = op;
            switch (op)
            {
                case "equals" or "notEquals" when parameters.Count == 1:
                    condition["value"] = parameters[0].ToJson();
                    break;
                case "in" when parameters.Count > 0:
                    condition["values"] = new JsonArray(parameters.Select(v => (JsonNode?)v.ToJson()).ToArray());
                    break;
                case "null" or "notNull" when parameters.Count == 0:
                    break;
                default:
                    throw new Unreadable($"The condition gives {parameters.Count} value(s) for {op}.");
            }

            conditions[VbText.Brackets(Keyed(arguments, "Result")?.Value.Trim())] = condition;
        }

        private static void Logical(XElement activity, Dictionary<string, JsonObject> conditions)
        {
            var arguments = activity.Element(Xns.Mxswa + "ActivityReference.Arguments");
            var group = Keyed(arguments, "LogicalOperator")?.Value.Trim() switch
            {
                "And" => "all",
                "Or" => "any",
                _ => throw new Unreadable("The condition combines with an operator other than and or or."),
            };
            var parts = new JsonArray();
            foreach (var side in new[] { "LeftOperand", "RightOperand" })
            {
                var part = conditions.GetValueOrDefault(VbText.Brackets(Keyed(arguments, side)?.Value.Trim()))
                    ?? throw new Unreadable("The condition combines a test Power Tools cannot read.");
                // and(and(a, b), c) is all [a, b, c], as the writer builds it.
                if (part.Count == 1 && part[group] is JsonArray same)
                    foreach (var inner in same) parts.Add(inner?.DeepClone());
                else
                    parts.Add(part.DeepClone());
            }

            conditions[VbText.Brackets(Keyed(arguments, "Result")?.Value.Trim())] = new JsonObject { [group] = parts };
        }

        private static ValueKind? KindOf(object value) => value switch
        {
            PLookup => ValueKind.Ref,
            PLiteral { Value.ValueKind: JsonValueKind.Number } => ValueKind.Choice,
            PLiteral { Value.ValueKind: JsonValueKind.True or JsonValueKind.False } => ValueKind.Bool,
            PLiteral => ValueKind.Text,
            _ => null,
        };

        // ── Values ───────────────────────────────────────────────────────────

        /// <summary>Interprets an activity that computes a value into env; false when it is not one.</summary>
        private bool Value(XElement activity, Dictionary<string, object> env)
        {
            if (activity.Name == Xns.Mxswa + "GetEntityProperty")
            {
                var column = activity.Attribute("Attribute")?.Value ?? "";
                if (column.StartsWith('!')) throw new Unreadable($"The step reads {column}, which Power Tools does not write.");
                var table = activity.Attribute("EntityName")?.Value ?? "";
                var key = EntityKey(activity.Attribute("Entity")?.Value);
                var from = Record(key);
                if (from is null) reading.Table ??= table;
                var kind = ValueKinds.FromTypeName(TypeOf(activity.Element(Xns.Mxswa + "GetEntityProperty.TargetType")?.Element(Xns.A + "InArgument")));
                reading.Column(table, column, kind);
                env[VbText.Brackets(activity.Attribute("Value")?.Value)] = new ColumnRead(new PColumn(column, from, null), table);
                return true;
            }

            switch (Xns.CrmActivity(activity.Attribute("AssemblyQualifiedName")?.Value))
            {
                case "ConvertCrmXrmTypes":
                {
                    var arguments = activity.Element(Xns.Mxswa + "ActivityReference.Arguments");
                    var value = VbText.Brackets(Keyed(arguments, "Value")?.Value.Trim());
                    var result = VbText.Brackets(Keyed(arguments, "Result")?.Value.Trim());
                    if (env.TryGetValue(value, out var known)) env[result] = known;
                    return true;
                }

                case "EvaluateExpression":
                {
                    var arguments = activity.Element(Xns.Mxswa + "ActivityReference.Arguments");
                    var op = Keyed(arguments, "ExpressionOperator")?.Value.Trim();
                    var items = Keyed(arguments, "Parameters") is { } p ? VbText.Items(p.Value) : [];
                    var target = Keyed(arguments, "TargetType") is { } t && t.Name != Xns.X + "Null" ? TypeOf(t) : null;
                    env[VbText.Brackets(Keyed(arguments, "Result")?.Value.Trim())] = Expression(op, items, target, env);
                    return true;
                }

                default:
                    return false;
            }
        }

        private static object Expression(string? op, List<string> items, string? target, Dictionary<string, object> env)
        {
            switch (op)
            {
                case "CreateCrmType":
                    return CreateCrmType(items, env);
                case "SelectFirstNonNull" when items.Count == 1:
                    return env.TryGetValue(items[0], out var only) ? only : throw new Unreadable($"The step uses {items[0]}, which Power Tools does not write.");
                case "SelectFirstNonNull" when items.Count == 2:
                    if (env.GetValueOrDefault(items[0]) is ColumnRead { Value.Default: null } read && Get(env, items[1]) is PLiteral or PLookup)
                        return read with { Value = read.Value with { Default = Get(env, items[1]) } };
                    throw new Unreadable("The step picks between values in a way Power Tools does not write.");
                case "RetrieveCurrentTime":
                    return new PNow();
                case "CustomOperationArguments" when items.Count == 1:
                    return new PArgument(items[0]);
                case "Add" when target == "x:String":
                    return new PConcat(items.Select(i => Get(env, i)).ToList());
                default:
                    throw new Unreadable($"The step uses the {op} operation{(target is null ? "" : $" on {target}")}, which Power Tools does not write yet.");
            }
        }

        private static object CreateCrmType(List<string> items, Dictionary<string, object> env)
        {
            if (items.Count < 2 || !items[0].StartsWith(PropertyType, StringComparison.Ordinal)) throw new Unreadable("The step builds a value Power Tools cannot read.");
            var type = items[0][PropertyType.Length..];
            switch (type)
            {
                case "String":
                    return Literal(VbText.Unquote(items[1]));
                case "OptionSetValue" when int.TryParse(VbText.Unquote(items[1]), NumberStyles.Integer, CultureInfo.InvariantCulture, out var option):
                    return Literal(option);
                case "Boolean":
                    return Literal(Literals.Bool(VbText.Unquote(items[1])));
                case "Guid" when Guid.TryParse(VbText.Unquote(items[1]), out var id):
                    return id;
                case "EntityReference" when items.Count == 5 && items[4] == "\"Lookup\"" && env.GetValueOrDefault(items[3]) is Guid id:
                    var name = VbText.Unquote(items[2]);
                    return new PLookup(VbText.Unquote(items[1]), id, name.Length == 0 ? null : name);
                case "EntityReference" when items.Count == 3 && items[2] == "\"Owner\"":
                    return env.TryGetValue(items[1], out var owner) ? owner : throw new Unreadable("The owner is a value Power Tools cannot read.");
                case "PartyList":
                    return items.Skip(1).Select(i => Get(env, i)).ToList();
                default:
                    throw new Unreadable($"The step has a literal {type} value, which Power Tools does not write yet.");
            }
        }

        private static PLiteral Literal<T>(T value) => new(JsonSerializer.SerializeToElement(value));

        private PValue Set(XElement setProperty, Dictionary<string, object> env)
        {
            var kind = ValueKinds.FromTypeName(TypeOf(setProperty.Element(Xns.Mxswa + "SetEntityProperty.TargetType")?.Element(Xns.A + "InArgument")));
            reading.Column(setProperty.Attribute("EntityName")?.Value ?? "", setProperty.Attribute("Attribute")!.Value, kind);
            return Get(env, VbText.Brackets(setProperty.Attribute("Value")?.Value));
        }

        private static PValue Get(Dictionary<string, object> env, string variable) =>
            env.TryGetValue(variable, out var value) ? AsValue(value) : throw new Unreadable($"The step uses {variable}, which Power Tools does not write.");

        private static PValue AsValue(object value) => value switch
        {
            PValue v => v,
            ColumnRead read => read.Value,
            _ => throw new Unreadable("The step uses a value Power Tools cannot express."),
        };

        private static List<PValue> Party(Dictionary<string, object> env, string variable) =>
            env.GetValueOrDefault(variable) is List<PValue> party ? party : throw new Unreadable("The email recipients are not a list Power Tools can read.");

        // ── XAML helpers ─────────────────────────────────────────────────────

        private static IEnumerable<XElement> Activities(XElement step) =>
            step.Name == Xns.A + "Sequence"
                ? step.Elements().Where(e => e.Name != Xns.A + "Sequence.Variables")
                : Keyed(step.Element(Xns.Mxswa + "ActivityReference.Properties"), "Activities")?.Elements() ?? [];

        private static XElement? Keyed(XElement? parent, string key) =>
            parent?.Elements().FirstOrDefault(e => e.Attribute(Xns.X + "Key")?.Value == key);

        private static string? TypeOf(XElement? inArgument)
        {
            var literal = inArgument?.Name == Xns.Mxswa + "ReferenceLiteral" ? inArgument : inArgument?.Element(Xns.Mxswa + "ReferenceLiteral");
            return literal?.Attribute("Value")?.Value;
        }

        /// <summary>The dictionary key of <c>[InputEntities("key")]</c>.</summary>
        private static string EntityKey(string? expression)
        {
            var text = VbText.Brackets(expression?.Trim());
            const string prefix = "InputEntities(\"";
            return text.StartsWith(prefix, StringComparison.Ordinal) && text.EndsWith("\")", StringComparison.Ordinal)
                ? text[prefix.Length..^2]
                : throw new Unreadable("The step works on a record Power Tools cannot name.");
        }

        /// <summary>The key of <c>[CreatedEntities("key#Temp")]</c>, without #Temp.</summary>
        private static string TempKey(string? expression)
        {
            var text = VbText.Brackets(expression?.Trim());
            const string prefix = "CreatedEntities(\"";
            return text.StartsWith(prefix, StringComparison.Ordinal) && text.EndsWith("#Temp\")", StringComparison.Ordinal)
                ? text[prefix.Length..^"#Temp\")".Length]
                : throw new Unreadable("The step writes a record Power Tools cannot name.");
        }

        /// <summary>null for the primary record, or the lookup on it that a related key goes through.</summary>
        private string? Record(string key)
        {
            if (key == "primaryEntity") return null;
            if (key.StartsWith("related_", StringComparison.Ordinal) && key.Split('#') is [var related, var table])
            {
                var lookup = related["related_".Length..];
                reading.Lookups[lookup] = table;
                return lookup;
            }

            throw new Unreadable("The step works on a record other than the primary record or one a lookup on it points to.");
        }

        private static string DirectCastVariable(string? expression)
        {
            var text = VbText.Brackets(expression?.Trim());
            const string prefix = "DirectCast(";
            if (!text.StartsWith(prefix, StringComparison.Ordinal)) throw new Unreadable("The step passes a value Power Tools cannot read.");
            var comma = text.IndexOf(',');
            return comma < 0 ? throw new Unreadable("The step passes a value Power Tools cannot read.") : text[prefix.Length..comma].Trim();
        }

        private static JsonObject Ordered(JsonObject node, params string[] order)
        {
            var result = new JsonObject();
            foreach (var key in order)
            {
                if (node[key] is { } value)
                {
                    node.Remove(key);
                    result[key] = value;
                }
            }

            return result;
        }
    }
}
