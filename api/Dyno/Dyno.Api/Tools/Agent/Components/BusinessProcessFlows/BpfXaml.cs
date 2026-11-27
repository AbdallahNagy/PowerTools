using System.Text.Json.Nodes;
using System.Xml.Linq;
using Dyno.Api.Tools.Agent.Components.Processes;

namespace Dyno.Api.Tools.Agent.Components.BusinessProcessFlows;

/// <summary>One stage of a business process flow, with the ids that keep records at it when the flow changes.</summary>
public sealed record BpfStageModel(Guid Id, string Name, string? Category, IReadOnlyList<BpfStepModel> Steps);

/// <summary>
/// One data step: a column users fill in at a stage. <see cref="ControlId"/> is unique in the flow (the designer
/// adds 1, 2, … when a column appears in more than one stage) and <see cref="ClassId"/> is the control of the
/// column's type.
/// </summary>
public sealed record BpfStepModel(Guid Id, string Column, string Label, bool Required, string ControlId, string ClassId, string DisplayName);

/// <summary>What <see cref="BpfXaml.Read"/> found: the stages in order, and what bpf_apply cannot write back.</summary>
public sealed class BpfReading
{
    public string? Table { get; set; }

    public List<BpfStageModel> Stages { get; } = [];

    public List<string> Problems { get; } = [];
}

/// <summary>
/// Reads and writes the XAML and client data of a business process flow in the layout the designer saves (see
/// api/Dyno/Dyno.Api.Tests/Tools/Agent/TestFixtures/BusinessProcessFlows): one EntityComposite per stage holding one
/// StageComposite, whose StepComposites each wrap a Control on a column. The stages run in order through
/// NextStageId. Branches, stage workflows and stages on other tables are reported as problems for now.
/// </summary>
public static class BpfXaml
{
    private const string Version = "Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
    private static readonly XNamespace Mcwb = $"clr-namespace:Microsoft.Crm.Workflow.BusinessProcessFlowActivities;assembly=Microsoft.Crm.Workflow, {Version}";
    private static readonly XNamespace Mcwc = $"clr-namespace:Microsoft.Crm.Workflow.ClientActivities;assembly=Microsoft.Crm.Workflow, {Version}";
    private static readonly XNamespace Mcwo = $"clr-namespace:Microsoft.Crm.Workflow.ObjectModel;assembly=Microsoft.Crm, {Version}";
    private const string ObjectModel = ":#Microsoft.Crm.Workflow.ObjectModel";

    // ── Reading ──────────────────────────────────────────────────────────────

    /// <summary>
    /// The stages of a flow. Elements are matched by local name and activity class, so XAML saved by older versions
    /// (Version=7.0.0.0 namespaces) reads the same.
    /// </summary>
    public static BpfReading Read(string xaml)
    {
        var reading = new BpfReading();
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

        var workflow = root.Elements().FirstOrDefault(e => e.Name.LocalName == "Workflow");
        if (workflow is null)
        {
            reading.Problems.Add("The XAML has no workflow body.");
            return reading;
        }

        var nextIds = new List<Guid?>();
        foreach (var element in workflow.Elements())
        {
            switch (Activity(element))
            {
                case "StageRelationshipCollectionComposite":
                    if (Activities(element).Any()) reading.Problems.Add("It links stages through relationships, which bpf_apply cannot write yet.");
                    break;
                case "EntityComposite":
                    ReadEntity(element, reading, nextIds);
                    break;
                default:
                    reading.Problems.Add($"It has a {Activity(element) ?? element.Name.LocalName} at the top level, which bpf_apply cannot write.");
                    break;
            }
        }

        if (reading.Stages.Count == 0) reading.Problems.Add("It has no stages.");
        for (var i = 0; i < reading.Stages.Count; i++)
        {
            Guid? expected = i + 1 < reading.Stages.Count ? reading.Stages[i + 1].Id : null;
            if (nextIds[i] != expected && !reading.Problems.Any(p => p.Contains("branch", StringComparison.Ordinal)))
            {
                reading.Problems.Add("Its stages do not run in the order they are listed, which bpf_apply cannot write yet.");
                break;
            }
        }

        return reading;
    }

    private static void ReadEntity(XElement entity, BpfReading reading, List<Guid?> nextIds)
    {
        var table = (string?)entity.Attribute("DisplayName") is { } display && display.IndexOf(':') is var colon and >= 0
            ? display[(colon + 1)..].Trim()
            : null;
        reading.Table ??= table;
        if (table is not null && !string.Equals(table, reading.Table, StringComparison.OrdinalIgnoreCase)
            && !reading.Problems.Any(p => p.Contains("more than one table", StringComparison.Ordinal)))
            reading.Problems.Add("Its stages are on more than one table, which bpf_apply cannot write yet.");

        var stages = Activities(entity).ToList();
        foreach (var stage in stages)
        {
            if (Activity(stage) != "StageComposite")
            {
                reading.Problems.Add($"A table step holds a {Activity(stage) ?? stage.Name.LocalName}, which bpf_apply cannot write.");
                continue;
            }

            var id = Guid.TryParse(Property(stage, "StageId"), out var stageId) ? stageId : Guid.Empty;
            var name = Labels(stage).FirstOrDefault() ?? DisplayName(stage) ?? "";
            var steps = new List<BpfStepModel>();
            foreach (var child in Activities(stage))
            {
                switch (Activity(child))
                {
                    case "StepComposite":
                        if (ReadStep(child, name, reading) is { } step) steps.Add(step);
                        break;
                    case "ConditionSequence":
                        if (!reading.Problems.Any(p => p.Contains("branch", StringComparison.Ordinal)))
                            reading.Problems.Add("It has branches, which bpf_apply cannot write yet.");
                        break;
                    default:
                        reading.Problems.Add($"Stage {name} has a {Activity(child) ?? child.Name.LocalName} (for example a stage workflow), which bpf_apply cannot write yet.");
                        break;
                }
            }

            reading.Stages.Add(new BpfStageModel(id, name, Property(stage, "StageCategory"), steps));
            nextIds.Add(Guid.TryParse(Property(stage, "NextStageId"), out var next) ? next : null);
        }
    }

    private static BpfStepModel? ReadStep(XElement step, string stage, BpfReading reading)
    {
        var control = step.Descendants().FirstOrDefault(e => e.Name.LocalName == "Control");
        var column = control is null ? null : ControlValue(control, "DataFieldName");
        if (control is null || string.IsNullOrEmpty(column))
        {
            reading.Problems.Add($"Stage {stage} has a step with no column, which bpf_apply cannot write.");
            return null;
        }

        var id = Guid.TryParse(Property(step, "ProcessStepId"), out var stepId) ? stepId : Guid.Empty;
        var required = string.Equals(Property(step, "IsProcessRequired"), "True", StringComparison.OrdinalIgnoreCase);
        var label = Labels(step).FirstOrDefault() ?? column;
        return new BpfStepModel(
            id,
            column.ToLowerInvariant(),
            label,
            required,
            ControlValue(control, "ControlId") ?? column,
            ControlValue(control, "ClassId") ?? "",
            ControlValue(control, "ControlDisplayName") ?? label);
    }

    /// <summary>A Control value, as an attribute or (as some tools write it) a child holding a Literal.</summary>
    private static string? ControlValue(XElement control, string name)
    {
        if ((string?)control.Attribute(name) is { } value) return value;
        var child = control.Elements().FirstOrDefault(e => e.Name.LocalName == $"Control.{name}");
        return (string?)child?.Descendants().FirstOrDefault(e => e.Name.LocalName == "Literal")?.Attribute("Value");
    }

    /// <summary>The class name of an ActivityReference, for example StageComposite.</summary>
    private static string? Activity(XElement element)
    {
        var name = (string?)element.Attribute("AssemblyQualifiedName");
        if (name is null) return null;
        var end = name.IndexOf(',');
        var full = end < 0 ? name : name[..end];
        return full[(full.LastIndexOf('.') + 1)..];
    }

    private static IEnumerable<XElement> Properties(XElement element) =>
        element.Elements().FirstOrDefault(e => e.Name.LocalName == "ActivityReference.Properties")?.Elements() ?? [];

    private static XElement? Keyed(XElement element, string key) =>
        Properties(element).FirstOrDefault(e => (string?)e.Attribute(Xns.X + "Key") == key);

    private static IEnumerable<XElement> Activities(XElement element) => Keyed(element, "Activities")?.Elements() ?? [];

    /// <summary>A keyed string property; null for x:Null.</summary>
    private static string? Property(XElement element, string key) =>
        Keyed(element, key) is { } found && found.Name.LocalName != "Null" ? found.Value.Trim() : null;

    private static IEnumerable<string> Labels(XElement element) =>
        Keyed(element, "StepLabels")?.Elements().Select(l => (string?)l.Attribute("Description")).OfType<string>() ?? [];

    private static string? DisplayName(XElement element) =>
        (string?)element.Attribute("DisplayName") is { } display && display.IndexOf(':') is var colon and >= 0 ? display[(colon + 1)..].Trim() : null;

    // ── Writing ──────────────────────────────────────────────────────────────

    /// <summary>The XAML of a linear flow on one table, numbered as the designer numbers its steps.</summary>
    public static string Write(Guid workflowId, string table, IReadOnlyList<BpfStageModel> stages, int language)
    {
        var className = $"XrmWorkflow{workflowId:N}";
        var numbers = new Numbers();
        var body = new XElement(Xns.Mxswa + "Workflow",
            Reference("Microsoft.Crm.Workflow.BusinessProcessFlowActivities.StageRelationshipCollectionComposite", $"RelationshipCollectionStep{numbers.Next()}", []));

        for (var i = 0; i < stages.Count; i++)
        {
            var stage = stages[i];
            var entityNumber = numbers.Next();
            var stageNumber = numbers.Next();
            var steps = stage.Steps.Select(step =>
            {
                var n = numbers.Next(2);
                return Reference(Crm("StepComposite"), $"StepStep{n}: {step.Label}",
                    [new XElement(Xns.A + "Sequence", new XAttribute("DisplayName", $"ControlStep{n + 1}"), Control(step))],
                    StepLabels(step.Id, step.Label, language),
                    new XElement(Xns.X + "String", new XAttribute(Xns.X + "Key", "ProcessStepId"), step.Id.ToString("D")),
                    new XElement(Xns.X + "Boolean", new XAttribute(Xns.X + "Key", "IsProcessRequired"), step.Required ? "True" : "False"));
            }).ToList();
            Guid? next = i + 1 < stages.Count ? stages[i + 1].Id : null;
            var stageElement = Reference(Crm("StageComposite"), $"StageStep{stageNumber}: {stage.Name}", steps,
                StepLabels(stage.Id, stage.Name, language),
                new XElement(Xns.X + "String", new XAttribute(Xns.X + "Key", "StageId"), stage.Id.ToString("D")),
                KeyedString("StageCategory", stage.Category),
                KeyedString("NextStageId", next?.ToString("D")));
            body.Add(Reference(Crm("EntityComposite"), $"EntityStep{entityNumber}: {table}", [stageElement],
                KeyedString("RelationshipName", null),
                KeyedString("AttributeName", null),
                new XElement(Xns.X + "Boolean", new XAttribute(Xns.X + "Key", "IsClosedLoop"), "False")));
        }

        var dictionary = "scg:IDictionary(x:String, mxs:Entity)";
        var root = new XElement(Xns.A + "Activity",
            new XAttribute(Xns.X + "Class", className),
            Declarations(),
            new XElement(Xns.X + "Members",
                new XElement(Xns.X + "Property", new XAttribute("Name", "InputEntities"), new XAttribute("Type", $"InArgument({dictionary})")),
                new XElement(Xns.X + "Property", new XAttribute("Name", "CreatedEntities"), new XAttribute("Type", $"InArgument({dictionary})"))),
            new XElement(Xns.This + $"{className}.InputEntities", new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", dictionary))),
            new XElement(Xns.This + $"{className}.CreatedEntities", new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", dictionary))),
            new XElement(Xns.Mva + "VisualBasic.Settings", "Assembly references and imported namespaces for internal implementation"),
            body);
        return root.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>The client data the designer loads, matching <see cref="Write"/> step for step.</summary>
    public static string ClientData(Guid workflowId, string name, string? description, string table, IReadOnlyList<BpfStageModel> stages, int language)
    {
        var numbers = new Numbers();
        var relationship = numbers.Next();
        var list = new JsonArray
        {
            Step("RelationshipCollectionStep", relationship, "", $"Step_{relationship}", [], []),
        };
        for (var i = 0; i < stages.Count; i++)
        {
            var stage = stages[i];
            var entityNumber = numbers.Next();
            var stageNumber = numbers.Next();
            var steps = new List<JsonNode>();
            foreach (var step in stage.Steps)
            {
                var n = numbers.Next(2);
                var control = Step("ControlStep", n + 1, "", $"Step_{n + 1}", [], []);
                control.Remove("steps");
                control["controlId"] = step.ControlId;
                control["classId"] = step.ClassId;
                control["dataFieldName"] = step.Column;
                control["systemStepType"] = "IdentifyContact";
                control["isSystemControl"] = false;
                control["parameters"] = "";
                control["controlDisplayName"] = step.DisplayName;
                control["isUnbound"] = false;
                control["controlType"] = "0";
                var stepNode = Step("StepStep", n, step.Label, null, [Label(step.Id, step.Label, language)], [control]);
                stepNode["stepStepId"] = step.Id.ToString("D");
                stepNode["isProcessRequired"] = step.Required;
                stepNode["isHidden"] = false;
                steps.Add(stepNode);
            }

            var stageNode = Step("StageStep", stageNumber, stage.Name, $"Step_{stageNumber}", [Label(stage.Id, stage.Name, language)], steps);
            stageNode["stageId"] = stage.Id.ToString("D");
            stageNode["nextStageId"] = i + 1 < stages.Count ? stages[i + 1].Id.ToString("D") : null;
            stageNode["stageCategory"] = stage.Category;
            var entityNode = Step("EntityStep", entityNumber, table, $"Step_{entityNumber}", [], [stageNode]);
            entityNode["relationshipName"] = null;
            entityNode["attributeName"] = null;
            entityNode["isClosedLoop"] = false;
            list.Add(entityNode);
        }

        var root = new JsonObject
        {
            ["__class"] = "WorkflowStep" + ObjectModel,
            ["id"] = "WorkflowStep0",
            ["description"] = description ?? "",
            ["name"] = "Step_0",
            ["stepLabels"] = new JsonObject { ["list"] = new JsonArray() },
            ["steps"] = new JsonObject { ["list"] = list },
            ["primaryEntityName"] = table,
            ["nextStepIndex"] = numbers.Peek().ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["isCrmUIWorkflow"] = true,
            ["category"] = "4",
            ["businessProcessType"] = "0",
            ["mode"] = "0",
            ["title"] = name,
            ["workflowEntityId"] = workflowId.ToString("D"),
            ["formId"] = null,
            ["argumentsArray"] = new JsonArray(),
            ["variables"] = new JsonArray(),
            ["inputs"] = new JsonArray(),
        };
        return root.ToJsonString();
    }

    private static JsonObject Step(string kind, int number, string? description, string? name, IEnumerable<JsonNode> labels, IEnumerable<JsonNode> steps) => new()
    {
        ["__class"] = kind + ObjectModel,
        ["id"] = $"{kind}{number}",
        ["description"] = description,
        ["name"] = name,
        ["stepLabels"] = new JsonObject { ["list"] = new JsonArray([.. labels]) },
        ["steps"] = new JsonObject { ["list"] = new JsonArray([.. steps]) },
    };

    private static JsonObject Label(Guid id, string text, int language) => new()
    {
        ["labelId"] = id.ToString("D"),
        ["languageCode"] = language,
        ["description"] = text,
    };

    private static XElement Control(BpfStepModel step) =>
        new(Mcwb + "Control",
            new XAttribute("ClassId", step.ClassId),
            new XAttribute("ControlDisplayName", step.DisplayName),
            new XAttribute("ControlId", step.ControlId),
            new XAttribute("DataFieldName", step.Column),
            new XAttribute("IsSystemControl", "False"),
            new XAttribute("SystemStepType", "0"),
            new XElement(Mcwb + "Control.Parameters",
                new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "x:String"),
                    new XElement(Xns.A + "Literal", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute("Value", "")))));

    private static XElement Reference(string activity, string displayName, IEnumerable<XElement> activities, params XElement[] properties)
    {
        var collection = new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Activity"), new XAttribute(Xns.X + "Key", "Activities"), activities);
        return new XElement(Xns.Mxswa + "ActivityReference",
            new XAttribute("AssemblyQualifiedName", activity.Contains(',') ? activity : $"{activity}, Microsoft.Crm.Workflow, {Version}"),
            new XAttribute("DisplayName", displayName),
            new XElement(Xns.Mxswa + "ActivityReference.Properties",
                new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Variable"), new XAttribute(Xns.X + "Key", "Variables")),
                collection,
                properties));
    }

    private static XElement StepLabels(Guid id, string text, int language) =>
        new(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "mcwo:StepLabel"), new XAttribute(Xns.X + "Key", "StepLabels"),
            new XElement(Mcwo + "StepLabel", new XAttribute("Description", text), new XAttribute("LabelId", id.ToString("D")), new XAttribute("LanguageCode", language)));

    private static XElement KeyedString(string key, string? value) =>
        value is null
            ? new XElement(Xns.X + "Null", new XAttribute(Xns.X + "Key", key))
            : new XElement(Xns.X + "String", new XAttribute(Xns.X + "Key", key), value);

    private static string Crm(string activity) => Xns.Crm(activity);

    private static IEnumerable<XAttribute> Declarations() =>
    [
        new("xmlns", Xns.A.NamespaceName),
        new(XNamespace.Xmlns + "mcwb", Mcwb.NamespaceName),
        new(XNamespace.Xmlns + "mcwc", Mcwc.NamespaceName),
        new(XNamespace.Xmlns + "mcwo", Mcwo.NamespaceName),
        new(XNamespace.Xmlns + "mva", Xns.Mva.NamespaceName),
        new(XNamespace.Xmlns + "mxs", Xns.Mxs.NamespaceName),
        new(XNamespace.Xmlns + "mxsq", Xns.Mxsq.NamespaceName),
        new(XNamespace.Xmlns + "mxswa", Xns.Mxswa.NamespaceName),
        new(XNamespace.Xmlns + "s", Xns.S.NamespaceName),
        new(XNamespace.Xmlns + "scg", Xns.Scg.NamespaceName),
        new(XNamespace.Xmlns + "sco", Xns.Sco.NamespaceName),
        new(XNamespace.Xmlns + "srs", Xns.Srs.NamespaceName),
        new(XNamespace.Xmlns + "this", Xns.This.NamespaceName),
        new(XNamespace.Xmlns + "x", Xns.X.NamespaceName),
    ];

    /// <summary>Step numbers, unique across the flow and given out in the designer's order.</summary>
    private sealed class Numbers
    {
        private int next = 1;

        public int Next(int count = 1)
        {
            var value = next;
            next += count;
            return value;
        }

        public int Peek() => next;
    }
}
