using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk.Metadata;

namespace Dyno.Api.Tools.Agent.Components.Processes;

/// <summary>What writing a process needs from the environment, read before the XAML is generated.</summary>
public sealed class ProcessCatalog
{
    public required string Table { get; init; }

    public ProcessKind Kind { get; init; }

    public ProcessMode Mode { get; init; }

    public Dictionary<string, EntityMetadata> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Child workflows by name (and by id), with the id the step names.</summary>
    public Dictionary<string, Guid> ChildWorkflows { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Custom process action messages by name: id and the table they are bound to.</summary>
    public Dictionary<string, (Guid Id, string? Table)> Messages { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Custom workflow activity types by type name, with their assembly-qualified name.</summary>
    public Dictionary<string, string> CustomTypes { get; } = new(StringComparer.Ordinal);

    /// <summary>Steps of the current XAML that are kept as they are, by step id.</summary>
    public Dictionary<string, XElement> Keeps { get; } = new(StringComparer.Ordinal);

    /// <summary>Workflow-level variables of the current XAML (custom step outputs), kept with their step.</summary>
    public List<XElement> WorkflowVariables { get; } = [];

    public List<ProcessArgument> Arguments { get; } = [];

    internal AttributeMetadata Column(string table, string column, string where)
    {
        var metadata = Tables.TryGetValue(table, out var t) ? t : throw Invalid($"{where}: table {table} was not found.");
        return metadata.Attributes?.FirstOrDefault(a => string.Equals(a.LogicalName, column, StringComparison.OrdinalIgnoreCase))
            ?? throw Invalid($"{where}: {table} has no column {column}.");
    }

    /// <summary>The table a lookup on the primary table points to; one target only.</summary>
    internal string LookupTarget(string lookup, string where)
    {
        if (Column(Table, lookup, where) is not LookupAttributeMetadata { Targets: { Length: > 0 } targets })
            throw Invalid($"{where}: {lookup} is not a lookup on {Table}.");
        if (targets.Length > 1)
            throw Invalid($"{where}: {lookup} can point to {string.Join(", ", targets)}; use a lookup with one table.");
        return targets[0];
    }

    internal string PrimaryId(string table) =>
        Tables.TryGetValue(table, out var t) && t.PrimaryIdAttribute is { Length: > 0 } id ? id : $"{table}id";

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

/// <summary>
/// Writes the XAML of a classic workflow or action the way the classic designer does, from the typed steps of
/// <see cref="ProcessApplySpec"/>. Each building block copies the shape found in real exported workflows
/// (api/Dyno/Dyno.Api.Tests/Tools/Agent/TestFixtures/ClassicWorkflows).
/// </summary>
public sealed class ProcessXamlWriter
{
    private readonly ProcessCatalog catalog;
    private readonly HashSet<int> reserved = [];
    private int next = 1;

    private ProcessXamlWriter(ProcessCatalog catalog)
    {
        this.catalog = catalog;
        foreach (var element in catalog.Keeps.Values) reserved.UnionWith(ProcessXamlReader.StepNumbers(element));
    }

    public static string Write(Guid workflowId, IReadOnlyList<ProcessStep> steps, ProcessCatalog catalog)
    {
        var writer = new ProcessXamlWriter(catalog);
        var className = $"XrmWorkflow{workflowId:N}";
        var root = new XElement(Xns.A + "Activity", new XAttribute(Xns.X + "Class", className), Xns.Declarations());

        var members = new XElement(Xns.X + "Members",
            Property("InputEntities", "InArgument(scg:IDictionary(x:String, mxs:Entity))"),
            Property("CreatedEntities", "InArgument(scg:IDictionary(x:String, mxs:Entity))"));
        foreach (var argument in writer.ActionArguments()) members.Add(argument);
        root.Add(members);
        root.Add(ThisArgument(className, "InputEntities", "scg:IDictionary(x:String, mxs:Entity)"));
        root.Add(ThisArgument(className, "CreatedEntities", "scg:IDictionary(x:String, mxs:Entity)"));
        if (catalog.Kind == ProcessKind.Action) root.Add(ThisArgument(className, "Target", "mxs:EntityReference"));
        root.Add(new XElement(Xns.Mva + "VisualBasic.Settings", "Assembly references and imported namespaces for internal implementation"));

        var body = new XElement(Xns.Mxswa + "Workflow");
        var keptVariables = catalog.WorkflowVariables
            .Where(v => catalog.Keeps.Keys.Any(k => VariableOf(v.Attribute("Name")?.Value, k)))
            .Select(v => new XElement(v))
            .ToList();
        if (keptVariables.Count > 0) body.Add(new XElement(Xns.Mxswa + "Workflow.Variables", keptVariables));
        foreach (var element in writer.Steps(steps, "steps")) body.Add(element);
        root.Add(body);
        return root.ToString(SaveOptions.None);
    }

    private static bool VariableOf(string? variable, string step) =>
        variable is not null && variable.StartsWith(step, StringComparison.Ordinal)
        && (variable.Length == step.Length || !char.IsDigit(variable[step.Length]));

    private IEnumerable<XElement> ActionArguments()
    {
        if (catalog.Kind != ProcessKind.Action) yield break;
        foreach (var argument in catalog.Arguments)
        {
            yield return ArgumentProperty(argument.Name, ValueKinds.ArgumentTypeName(argument.Type), argument.Required == true, false,
                argument.Description ?? "", argument.Table?.ToLowerInvariant() ?? "");
        }

        yield return ArgumentProperty("Target", "mxs:EntityReference", true, true, "Target Argument", catalog.Table);
    }

    private static XElement Property(string name, string type) =>
        new(Xns.X + "Property", new XAttribute("Name", name), new XAttribute("Type", type));

    private static XElement ArgumentProperty(string name, string type, bool required, bool target, string description, string table) =>
        new(Xns.X + "Property", new XAttribute("Name", name), new XAttribute("Type", $"InArgument({type})"),
            new XElement(Xns.X + "Property.Attributes",
                new XElement(Xns.Mxsw + "ArgumentRequiredAttribute", new XAttribute("Value", required ? "True" : "False")),
                new XElement(Xns.Mxsw + "ArgumentTargetAttribute", new XAttribute("Value", target ? "True" : "False")),
                new XElement(Xns.Mxsw + "ArgumentDescriptionAttribute", new XAttribute("Value", description)),
                new XElement(Xns.Mxsw + "ArgumentDirectionAttribute", new XAttribute("Value", "Input")),
                new XElement(Xns.Mxsw + "ArgumentEntityAttribute", new XAttribute("Value", table))));

    private static XElement ThisArgument(string className, string name, string type) =>
        new(Xns.This + $"{className}.{name}", new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", type)));

    private string StepName(string kind)
    {
        while (reserved.Contains(next)) next++;
        return $"{kind}Step{next++}";
    }

    private static string Display(string name, string? label) => string.IsNullOrWhiteSpace(label) ? name : $"{name}: {label.Trim()}";

    private List<XElement> Steps(IReadOnlyList<ProcessStep>? steps, string where)
    {
        var result = new List<XElement>();
        for (var i = 0; i < (steps?.Count ?? 0); i++) result.AddRange(Step(steps![i], $"{where}[{i}]"));
        return result;
    }

    private IEnumerable<XElement> Step(ProcessStep step, string where)
    {
        var count = new object?[]
        {
            step.Update, step.Create, step.SendEmail, step.Assign, step.SetState, step.If, step.ChildWorkflow, step.Action,
            step.CustomActivity, step.Stop, step.Keep,
        }.Count(v => v is not null);
        if (count != 1)
            throw Invalid($"{where}: give exactly one of update, create, sendEmail, assign, setState, if, childWorkflow, action, customActivity, stop, keep.");

        if (step.Update is { } update) return [Update(update, step.Label, where)];
        if (step.Create is { } create) return [Create(create, step.Label, where)];
        if (step.SendEmail is { } email) return [SendEmail(email, step.Label, where)];
        if (step.Assign is { } assign) return [Assign(assign, step.Label, where)];
        if (step.SetState is { } state) return SetState(state, step.Label, where);
        if (step.If is { } branch) return [Condition(branch, step.Label, where)];
        if (step.ChildWorkflow is { } child) return [ChildWorkflow(child, step.Label, where)];
        if (step.Action is { } action) return [Action(action, step.Label, where)];
        if (step.CustomActivity is { } custom) return [CustomActivity(custom, step.Label, where)];
        if (step.Stop is { } stop) return [Stop(stop, step.Label)];
        return [Keep(step.Keep!, where)];
    }

    // ── Records ──────────────────────────────────────────────────────────────

    /// <summary>The InputEntities key and table of primary or a lookup on the primary record.</summary>
    private (string Key, string Table) Record(string? record, string where)
    {
        if (string.IsNullOrWhiteSpace(record) || string.Equals(record, "primary", StringComparison.OrdinalIgnoreCase))
            return ("primaryEntity", catalog.Table);
        var lookup = record.Trim().ToLowerInvariant();
        var table = catalog.LookupTarget(lookup, where);
        return ($"related_{lookup}#{table}", table);
    }

    private static string Entity(string dictionary, string key) => $"[{dictionary}(\"{key}\")]";

    private XElement Update(ProcessRecordUpdate update, string? label, string where)
    {
        var name = StepName("Update");
        var (key, table) = Record(update.Record, where);
        var scope = new Scope(name);
        var temp = $"{key}#Temp";
        scope.Add(Assign("mxs:Entity", Entity("CreatedEntities", temp), $"[New Entity(\"{table}\")]"));
        scope.Add(Assign("s:Guid", $"[CreatedEntities(\"{temp}\").Id]", $"[InputEntities(\"{key}\").Id]"));
        if (update.Values is not { Count: > 0 }) throw Invalid($"{where}.update: values is empty.");
        SetValues(scope, update.Values, table, temp, $"{where}.update");
        scope.Add(new XElement(Xns.Mxswa + "UpdateEntity", new XAttribute("DisplayName", name),
            new XAttribute("Entity", Entity("CreatedEntities", temp)), new XAttribute("EntityName", table)));
        scope.Add(Assign("mxs:Entity", Entity("InputEntities", key), Entity("CreatedEntities", temp)));
        return scope.Sequence(Display(name, label));
    }

    private XElement Create(ProcessRecordCreate create, string? label, string where)
    {
        var name = StepName("Create");
        var table = create.Table.Trim().ToLowerInvariant();
        if (!catalog.Tables.ContainsKey(table)) throw Invalid($"{where}.create: table {table} was not found.");
        var scope = new Scope(name);
        var local = $"{name}_localParameter";
        var temp = $"{local}#Temp";
        scope.Add(Assign("mxs:Entity", Entity("CreatedEntities", temp), $"[New Entity(\"{table}\")]"));
        SetValues(scope, create.Values ?? [], table, temp, $"{where}.create");
        scope.Add(new XElement(Xns.Mxswa + "CreateEntity", new XAttribute("EntityId", "{x:Null}"), new XAttribute("DisplayName", Display(name, label)),
            new XAttribute("Entity", Entity("CreatedEntities", temp)), new XAttribute("EntityName", table)));
        scope.Add(Assign("mxs:Entity", Entity("CreatedEntities", local), Entity("CreatedEntities", temp)));
        return scope.Sequence(Display(name, label));
    }

    private XElement SendEmail(ProcessSendEmail email, string? label, string where)
    {
        var name = StepName("SendEmail");
        var scope = new Scope(name);
        var temp = $"{name}_localParameter#Temp";
        scope.Add(Assign("mxs:Entity", Entity("CreatedEntities", temp), "[New Entity(\"email\")]"));
        if (email.From is { } from) SetParty(scope, "from", [from], temp, $"{where}.sendEmail.from");
        if (email.To is not { Count: > 0 }) throw Invalid($"{where}.sendEmail: to needs at least one recipient.");
        SetParty(scope, "to", email.To, temp, $"{where}.sendEmail.to");
        if (email.Cc is { Count: > 0 } cc) SetParty(scope, "cc", cc, temp, $"{where}.sendEmail.cc");
        SetValue(scope, "email", "subject", ValueKind.Text, PValue.Parse(email.Subject, $"{where}.sendEmail.subject"), temp, $"{where}.sendEmail.subject");
        if (email.Body is { } body)
            SetValue(scope, "email", "description", ValueKind.Text, PValue.Parse(body, $"{where}.sendEmail.body"), temp, $"{where}.sendEmail.body");
        var regarding = email.Regarding is { } r
            ? PValue.Parse(r, $"{where}.sendEmail.regarding")
            : new PColumn(catalog.PrimaryId(catalog.Table), null, null);
        SetValue(scope, "email", "regardingobjectid", ValueKind.Ref, regarding, temp, $"{where}.sendEmail.regarding");
        if (email.Values is { Count: > 0 } values) SetValues(scope, values, "email", temp, $"{where}.sendEmail.values");
        scope.Add(new XElement(Xns.Mxswa + "SendEmail", new XAttribute("EntityId", "{x:Null}"), new XAttribute("DisplayName", name),
            new XAttribute("Entity", Entity("CreatedEntities", temp))));
        return scope.Sequence(Display(name, label));
    }

    private XElement Assign(ProcessAssign assign, string? label, string where)
    {
        var name = StepName("Assign");
        var (key, table) = Record(assign.Record, where);
        var scope = new Scope(name);
        var value = Emit(scope, PValue.Parse(assign.Owner, $"{where}.assign.owner"), ValueKind.Ref, $"{where}.assign.owner");
        var owner = scope.Variable();
        scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.EntityReference, {value}, \"Owner\"", TargetType.Missing, owner));
        scope.Add(new XElement(Xns.Mxswa + "AssignEntity", new XAttribute("DisplayName", name),
            new XAttribute("Entity", Entity("InputEntities", key)), new XAttribute("EntityId", $"[InputEntities(\"{key}\").Id]"),
            new XAttribute("EntityName", table), new XAttribute("Owner", $"[DirectCast({owner}, Microsoft.Xrm.Sdk.EntityReference)]")));
        return scope.Sequence(Display(name, label));
    }

    private IEnumerable<XElement> SetState(ProcessSetState state, string? label, string where)
    {
        var name = StepName("SetState");
        var (key, table) = Record(state.Record, where);
        var element = new XElement(Xns.Mxswa + "SetState", new XAttribute("DisplayName", Display(name, label)),
            new XAttribute("Entity", Entity("InputEntities", key)), new XAttribute("EntityId", $"[InputEntities(\"{key}\").Id]"),
            new XAttribute("EntityName", table),
            new XElement(Xns.Mxswa + "SetState.State", OptionSetLiteral(state.State)),
            new XElement(Xns.Mxswa + "SetState.Status", OptionSetLiteral(state.Status)));
        yield return element;
        // A background workflow persists after a status change, as the designer writes it.
        if (catalog.Mode == ProcessMode.Background && catalog.Kind == ProcessKind.Workflow) yield return new XElement(Xns.A + "Persist");
    }

    private static XElement OptionSetLiteral(int value) =>
        new(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "mxs:OptionSetValue"),
            new XElement(Xns.Mxswa + "ReferenceLiteral", new XAttribute(Xns.X + "TypeArguments", "mxs:OptionSetValue"),
                new XElement(Xns.Mxs + "OptionSetValue", new XAttribute("ExtensionData", "{x:Null}"), new XAttribute("Value", value))));

    private XElement ChildWorkflow(string child, string? label, string where)
    {
        if (!catalog.ChildWorkflows.TryGetValue(child.Trim(), out var id))
            throw Invalid($"{where}.childWorkflow: no workflow {child} that can run as a child workflow on {catalog.Table}.");
        var name = StepName("ChildWorkflow");
        var parameters = $"{name}_1";
        return new XElement(Xns.A + "Sequence", new XAttribute("DisplayName", Display(name, label)),
            new XElement(Xns.A + "Sequence.Variables",
                new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "scg:Dictionary(x:String, x:Object)"),
                    new XAttribute("Default", "[New Dictionary(Of System.String, System.Object)]"), new XAttribute("Name", parameters))),
            new XElement(Xns.Mxswa + "StartChildWorkflow", new XAttribute("DisplayName", Display(name, label)),
                new XAttribute("EntityId", "[InputEntities(\"primaryEntity\").Id]"), new XAttribute("EntityName", catalog.Table),
                new XAttribute("InputParameters", $"[{parameters}]"), new XAttribute("WorkflowId", id.ToString("D"))));
    }

    private XElement Action(ProcessActionCall call, string? label, string where)
    {
        if (!catalog.Messages.TryGetValue(call.Name.Trim(), out var message))
            throw Invalid($"{where}.action: no activated custom process action {call.Name}.");
        var name = StepName("InvokeSdkMessage");
        var scope = new Scope(name);
        var (_, table) = Record(call.Record, where);
        if (message.Table is { } bound && !string.Equals(bound, table, StringComparison.OrdinalIgnoreCase))
            throw Invalid($"{where}.action: {call.Name} is bound to {bound}, not {table}; set record to a lookup to {bound}.");
        var read = string.IsNullOrWhiteSpace(call.Record) || string.Equals(call.Record, "primary", StringComparison.OrdinalIgnoreCase)
            ? catalog.PrimaryId(catalog.Table)
            : call.Record.Trim().ToLowerInvariant();
        var target = Emit(scope, new PColumn(read, null, null), ValueKind.Ref, $"{where}.action");
        var converted = scope.Converted(target);
        scope.Add(Convert(target, ValueKind.Ref, converted));
        scope.Add(new XElement(Xns.Mcwa + "InvokeSdkMessageActivity", new XAttribute("DisplayName", name),
            new XAttribute("SdkMessageEntityName", message.Table ?? ""), new XAttribute("SdkMessageId", message.Id.ToString("D")),
            new XAttribute("SdkMessageName", call.Name.Trim()), new XAttribute("SdkMessageRequestSuffix", ""),
            new XElement(Xns.Mcwa + "InvokeSdkMessageActivity.Arguments",
                In("mxs:EntityReference", "Target", $"[DirectCast({converted}, Microsoft.Xrm.Sdk.EntityReference)]")),
            new XElement(Xns.Mcwa + "InvokeSdkMessageActivity.Properties",
                new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute(Xns.X + "Key", "Target#InArgumentEntityType"),
                    new XElement(Xns.X + "String", table)),
                new XElement(Xns.X + "String", new XAttribute(Xns.X + "Key", "Target#InArgumentRequired"), "Target"))));
        return scope.Composite(Display(name, label));
    }

    private XElement CustomActivity(ProcessCustomActivity custom, string? label, string where)
    {
        if (!catalog.CustomTypes.TryGetValue(custom.Type.Trim(), out var assemblyQualifiedName))
            throw Invalid($"{where}.customActivity: no custom workflow activity {custom.Type} is registered.");
        var name = StepName("CustomActivity");
        var scope = new Scope(name);
        var arguments = new XElement(Xns.Mxswa + "ActivityReference.Arguments");
        foreach (var input in custom.Inputs ?? [])
        {
            var kind = ValueKinds.Of(input.Type);
            // A null value leaves the input empty: the designer converts a variable nothing assigns.
            var value = input.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
                ? scope.Variable()
                : Emit(scope, PValue.Parse(input.Value, $"{where}.customActivity.{input.Name}"), kind, $"{where}.customActivity.{input.Name}");
            var converted = scope.Converted(value);
            scope.Add(Convert(value, kind, converted));
            arguments.Add(In(ValueKinds.TypeName(kind), input.Name, $"[DirectCast({converted}, {ClrName(kind)})]"));
        }

        scope.Add(new XElement(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", assemblyQualifiedName),
            new XAttribute("DisplayName", Display(name, label)), arguments));
        return scope.Composite(Display(name, label));
    }

    private static string ClrName(ValueKind kind) => kind switch
    {
        ValueKind.Text => "System.String",
        ValueKind.Bool => "System.Boolean",
        ValueKind.Ref => "Microsoft.Xrm.Sdk.EntityReference",
        ValueKind.Date => "System.DateTime",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    private XElement Stop(ProcessStop stop, string? label)
    {
        var name = StepName("StopWorkflow");
        var message = $"{name}_1";
        var status = stop.Status == ProcessStopStatus.Canceled ? "Canceled" : "Succeeded";
        var labelId = new Guid(System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes($"{name}|{stop.Message}")));
        return new XElement(Xns.A + "Sequence", new XAttribute("DisplayName", Display(name, label)),
            new XElement(Xns.A + "Sequence.Variables",
                new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:Object"), new XAttribute("Name", message)),
                new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute("Default", labelId.ToString("D")), new XAttribute("Name", "stepLabelLabelId")),
                string.IsNullOrEmpty(stop.Message)
                    ? new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute("Name", "stepLabelDescription"),
                        new XElement(Xns.A + "Variable.Default", new XElement(Xns.A + "Literal", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute("Value", ""))))
                    : new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:String"), new XAttribute("Default", stop.Message), new XAttribute("Name", "stepLabelDescription")),
                new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:Int32"), new XAttribute("Default", "1033"), new XAttribute("Name", "stepLabelLanguageCode"))),
            Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.String, {VbText.Quote(stop.Message ?? "")}, \"String\"", TargetType.Of(ValueKind.Text), message),
            new XElement(Xns.A + "TerminateWorkflow", new XAttribute("DisplayName", Display(name, label)),
                new XAttribute("Exception", $"[New Microsoft.Xrm.Sdk.InvalidPluginExecutionException(Microsoft.Xrm.Sdk.OperationStatus.{status})]"),
                new XAttribute("Reason", $"[DirectCast({message}, System.String)]")));
    }

    private XElement Keep(string id, string where) =>
        catalog.Keeps.TryGetValue(id.Trim(), out var element)
            ? new XElement(element)
            : throw Invalid($"{where}.keep: the process has no step {id}. keep only names steps inspect_solution returned for this process.");

    // ── Conditions ───────────────────────────────────────────────────────────

    private XElement Condition(ProcessIf branch, string? label, string where)
    {
        var name = StepName("Condition");
        var variables = new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Variable"), new XAttribute(Xns.X + "Key", "Variables"));
        var activities = new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Activity"), new XAttribute(Xns.X + "Key", "Activities"));
        var branches = new List<(ProcessCondition Condition, List<ProcessStep> Then)> { (branch.Condition, branch.Then) };
        branches.AddRange((branch.ElseIf ?? []).Select(e => (e.Condition, e.Then)));
        for (var i = 0; i < branches.Count; i++)
        {
            var branchName = StepName("ConditionBranch");
            var scope = new Scope(branchName);
            var result = $"{branchName}_condition";
            variables.Add(BoolVariable(result));
            Evaluate(scope, branches[i].Condition, result, $"{where}.if{(i == 0 ? "" : $".elseIf[{i - 1}]")}.condition");
            foreach (var variable in scope.Variables) variables.Add(variable);
            foreach (var activity in scope.Activities) activities.Add(activity);
            activities.Add(Branch(branchName, $"[{result}]", Steps(branches[i].Then, $"{where}.if.then")));
        }

        if (branch.Else is { } otherwise)
        {
            var branchName = StepName("ConditionBranch");
            activities.Add(Branch(branchName, "True", Steps(otherwise, $"{where}.if.else")));
        }

        return new XElement(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("ConditionSequence")),
            new XAttribute("DisplayName", Display(name, label)),
            new XElement(Xns.Mxswa + "ActivityReference.Arguments", In("x:Boolean", "Wait", "False")),
            new XElement(Xns.Mxswa + "ActivityReference.Properties", variables, activities,
                new XElement(Xns.X + "Boolean", new XAttribute(Xns.X + "Key", "ContainsElseBranch"), branch.Else is null ? "False" : "True")));
    }

    private static XElement BoolVariable(string name) =>
        new(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:Boolean"), new XAttribute("Default", "False"), new XAttribute("Name", name));

    private static XElement Branch(string name, string condition, List<XElement> then) =>
        new(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("ConditionBranch")), new XAttribute("DisplayName", name),
            new XElement(Xns.Mxswa + "ActivityReference.Arguments", In("x:Boolean", "Condition", condition)),
            new XElement(Xns.Mxswa + "ActivityReference.Properties",
                new XElement(Xns.Mxswa + "ActivityReference", new XAttribute(Xns.X + "Key", "Then"), new XAttribute("AssemblyQualifiedName", Xns.Crm("Composite")),
                    new XAttribute("DisplayName", name),
                    new XElement(Xns.Mxswa + "ActivityReference.Properties",
                        new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Variable"), new XAttribute(Xns.X + "Key", "Variables")),
                        new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Activity"), new XAttribute(Xns.X + "Key", "Activities"), then))),
                new XElement(Xns.X + "Null", new XAttribute(Xns.X + "Key", "Else")),
                new XElement(Xns.X + "Null", new XAttribute(Xns.X + "Key", "Description"))));

    /// <summary>Evaluates a condition into the boolean variable result.</summary>
    private void Evaluate(Scope scope, ProcessCondition condition, string result, string where)
    {
        var groups = (condition.All is not null ? 1 : 0) + (condition.Any is not null ? 1 : 0) + (condition.Column is not null ? 1 : 0)
            + (condition.Argument is not null ? 1 : 0);
        if (groups != 1) throw Invalid($"{where}: give exactly one of column, argument, all or any.");
        if (condition.All is { } all) { Combine(scope, all, "And", result, $"{where}.all"); return; }
        if (condition.Any is { } any) { Combine(scope, any, "Or", result, $"{where}.any"); return; }

        var op = condition.Operator ?? throw Invalid($"{where}: operator is required.");
        var operand = scope.Variable();
        ValueKind kind;
        if (condition.Argument is { } argumentName)
        {
            var argument = catalog.Kind == ProcessKind.Action
                ? catalog.Arguments.FirstOrDefault(a => string.Equals(a.Name, argumentName.Trim(), StringComparison.Ordinal))
                : null;
            if (argument is null) throw Invalid($"{where}: argument {argumentName} is not an input argument of this action.");
            kind = ValueKinds.Of(argument.Type);
            scope.Add(Expression("CustomOperationArguments", argument.Name, TargetType.Null, operand));
        }
        else
        {
            var (key, table) = Record(condition.From, where);
            var column = condition.Column!.Trim().ToLowerInvariant();
            var metadata = catalog.Column(table, column, where);
            kind = ValueKinds.Of(metadata) is { } k and not ValueKind.Party
                ? k
                : throw Invalid($"{where}: conditions on {column} ({metadata.AttributeType}) are not supported yet.");
            scope.Add(GetProperty(column, key, table, operand, null));
        }

        var parameters = new List<string>();
        switch (op)
        {
            case ProcessOperator.Equal or ProcessOperator.NotEqual:
                parameters.Add(ConditionLiteral(scope, condition.Value ?? throw Invalid($"{where}: {op} needs value."), kind, where));
                break;
            case ProcessOperator.In:
                if (condition.Values is not { Count: > 0 } values) throw Invalid($"{where}: in needs values.");
                parameters.AddRange(values.Select(v => ConditionLiteral(scope, v, kind, where)));
                break;
        }

        var name = op switch
        {
            ProcessOperator.Equal => "Equal",
            ProcessOperator.NotEqual => "NotEqual",
            ProcessOperator.IsNull => "Null",
            ProcessOperator.NotNull => "NotNull",
            _ => "In",
        };
        scope.Add(new XElement(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("EvaluateCondition")),
            new XAttribute("DisplayName", "EvaluateCondition"),
            new XElement(Xns.Mxswa + "ActivityReference.Arguments",
                In("mxsq:ConditionOperator", "ConditionOperator", name),
                parameters.Count == 0
                    ? new XElement(Xns.X + "Null", new XAttribute(Xns.X + "Key", "Parameters"))
                    : In("s:Object[]", "Parameters", $"[New Object() {{ {string.Join(", ", parameters)} }}]"),
                In("x:Object", "Operand", $"[{operand}]"),
                Out("x:Boolean", "Result", $"[{result}]"))));
    }

    private void Combine(Scope scope, List<ProcessCondition> parts, string op, string result, string where)
    {
        if (parts.Count == 0) throw Invalid($"{where}: is empty.");
        if (parts.Count == 1) { Evaluate(scope, parts[0], result, $"{where}[0]"); return; }
        var left = scope.Bool();
        Evaluate(scope, parts[0], left, $"{where}[0]");
        for (var i = 1; i < parts.Count; i++)
        {
            var right = scope.Bool();
            Evaluate(scope, parts[i], right, $"{where}[{i}]");
            var target = i == parts.Count - 1 ? result : scope.Bool();
            scope.Add(new XElement(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("EvaluateLogicalCondition")),
                new XAttribute("DisplayName", "EvaluateLogicalCondition"),
                new XElement(Xns.Mxswa + "ActivityReference.Arguments",
                    In("mxsq:LogicalOperator", "LogicalOperator", op),
                    In("x:Boolean", "LeftOperand", $"[{left}]"),
                    In("x:Boolean", "RightOperand", $"[{right}]"),
                    Out("x:Boolean", "Result", $"[{target}]"))));
            left = target;
        }
    }

    /// <summary>A literal a condition compares with, as the designer writes it there (a lookup has no target type).</summary>
    private string ConditionLiteral(Scope scope, JsonElement json, ValueKind kind, string where)
    {
        var value = PValue.Parse(json, where);
        if (value is not (PLiteral or PLookup)) throw Invalid($"{where}: a condition compares with literal values.");
        return Literal(scope, value, kind, where, inCondition: true);
    }

    // ── Values ───────────────────────────────────────────────────────────────

    private void SetValues(Scope scope, Dictionary<string, JsonElement> values, string table, string temp, string where)
    {
        foreach (var (column, json) in values)
        {
            var logical = column.Trim().ToLowerInvariant();
            var metadata = catalog.Column(table, logical, where);
            var kind = ValueKinds.Of(metadata) is { } k and not ValueKind.Party
                ? k
                : throw Invalid($"{where}: writing {logical} ({metadata.AttributeType}) is not supported yet; text, choice, yes/no, lookup, date and currency columns are.");
            SetValue(scope, table, logical, kind, PValue.Parse(json, $"{where}.{logical}"), temp, $"{where}.{logical}");
        }
    }

    private void SetValue(Scope scope, string table, string column, ValueKind kind, PValue value, string temp, string where)
    {
        var variable = Emit(scope, value, kind, where);
        scope.Add(SetProperty(column, temp, table, variable, kind));
    }

    private void SetParty(Scope scope, string column, List<JsonElement> parties, string temp, string where)
    {
        var result = scope.Variable();
        var items = parties.Select((p, i) => Emit(scope, PValue.Parse(p, $"{where}[{i}]"), ValueKind.Ref, $"{where}[{i}]")).ToList();
        scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.PartyList, {string.Join(", ", items)}",
            TargetType.Of(ValueKind.Party), result));
        scope.Add(SetProperty(column, temp, "email", result, ValueKind.Party));
    }

    /// <summary>Emits the activities that compute value as kind, and answers the variable that holds it.</summary>
    private string Emit(Scope scope, PValue value, ValueKind kind, string where)
    {
        switch (value)
        {
            case PLiteral or PLookup:
                return Literal(scope, value, kind, where, inCondition: false);
            case PColumn column:
            {
                var result = scope.Variable();
                var (key, table) = Record(column.From, where);
                var name = column.Column.Trim().ToLowerInvariant();
                catalog.Column(table, name, where);
                var read = scope.Variable();
                scope.Add(GetProperty(name, key, table, read, kind));
                var items = new List<string> { read };
                if (column.Default is { } fallback) items.Add(Literal(scope, fallback, kind, where, inCondition: false));
                scope.Add(Expression("SelectFirstNonNull", $"{string.Join(", ", items)}", TargetType.Of(kind), result));
                return result;
            }

            case PArgument argument:
            {
                if (catalog.Kind != ProcessKind.Action || catalog.Arguments.All(a => !string.Equals(a.Name, argument.Name, StringComparison.Ordinal)))
                    throw Invalid($"{where}: argument {argument.Name} is not an input argument of this action.");
                var result = scope.Variable();
                var read = scope.Variable();
                scope.Add(Expression("CustomOperationArguments", argument.Name, TargetType.Of(kind), read));
                scope.Add(Expression("SelectFirstNonNull", read, TargetType.Of(kind), result));
                return result;
            }

            case PNow:
            {
                if (kind != ValueKind.Date) throw Invalid($"{where}: now fits only a date column.");
                var result = scope.Variable();
                var now = scope.Variable();
                scope.Add(Expression("RetrieveCurrentTime", "", TargetType.Of(ValueKind.Date), now));
                scope.Add(Expression("SelectFirstNonNull", now, TargetType.Of(kind), result));
                return result;
            }

            case PConcat concat:
            {
                if (kind != ValueKind.Text) throw Invalid($"{where}: concat fits only a text column.");
                var result = scope.Variable();
                var parts = concat.Parts.Select(p => Emit(scope, p, ValueKind.Text, where)).ToList();
                scope.Add(Expression("Add", string.Join(", ", parts), TargetType.Of(ValueKind.Text), result));
                return result;
            }
        }

        throw Invalid($"{where}: unsupported value.");
    }

    private string Literal(Scope scope, PValue value, ValueKind kind, string where, bool inCondition)
    {
        var result = scope.Variable();
        switch (kind)
        {
            case ValueKind.Text when value is PLiteral text:
                scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.String, {VbText.Quote(text.AsText())}, \"String\"",
                    TargetType.Of(ValueKind.Text), result));
                return result;
            case ValueKind.Choice when value is PLiteral { Value.ValueKind: JsonValueKind.Number } choice && choice.Value.TryGetInt32(out var option):
                scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.OptionSetValue, \"{option}\", \"Picklist\"",
                    TargetType.Of(ValueKind.Choice), result));
                return result;
            case ValueKind.Bool when value is PLiteral { Value.ValueKind: JsonValueKind.True or JsonValueKind.False } flag:
                scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.Boolean, \"{(flag.Value.GetBoolean() ? 1 : 0)}\"",
                    TargetType.Of(ValueKind.Bool), result));
                return result;
            case ValueKind.Ref when value is PLookup lookup:
                var id = scope.Variable();
                scope.Add(Expression("CreateCrmType", $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.Guid, \"{lookup.Id:D}\", \"UniqueIdentifier\"",
                    inCondition ? TargetType.Of(ValueKind.Guid) : TargetType.Of(ValueKind.Ref), id));
                scope.Add(Expression("CreateCrmType",
                    $"Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.EntityReference, \"{lookup.Table}\", {VbText.Quote(lookup.Name ?? "")}, {id}, \"Lookup\"",
                    inCondition ? TargetType.Null : TargetType.Of(ValueKind.Ref), result));
                return result;
        }

        throw Invalid(kind switch
        {
            ValueKind.Choice => $"{where}: a choice value is its number, for example 2.",
            ValueKind.Bool => $"{where}: a yes/no value is true or false.",
            ValueKind.Ref => $"{where}: a lookup value is {{\"lookup\": {{\"table\", \"id\", \"name\"}}}} or a column.",
            _ => $"{where}: a literal {kind} value is not supported yet; copy it from a column instead.",
        });
    }

    // ── XAML building blocks ─────────────────────────────────────────────────

    private readonly record struct TargetType(string? Type, bool Omitted)
    {
        public static TargetType Of(ValueKind kind) => new(ValueKinds.TypeName(kind), false);

        public static readonly TargetType Null = new(null, false);

        public static readonly TargetType Missing = new(null, true);
    }

    private static XElement TypeLiteral(string? type) =>
        type is null
            ? new XElement(Xns.Mxswa + "ReferenceLiteral", new XAttribute(Xns.X + "TypeArguments", "s:Type"), new XElement(Xns.X + "Null"))
            : new XElement(Xns.Mxswa + "ReferenceLiteral", new XAttribute(Xns.X + "TypeArguments", "s:Type"), new XAttribute("Value", type));

    private static XElement Expression(string op, string parameters, TargetType target, string result)
    {
        var parametersElement = In("s:Object[]", "Parameters", $"[New Object() {{ {parameters} }}]");
        if (op == "RetrieveCurrentTime")
        {
            parametersElement.Value = "[New Object() {  }]";
            parametersElement.Add(new XAttribute(XNamespace.Xml + "space", "preserve"));
        }

        return new XElement(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("EvaluateExpression")),
            new XAttribute("DisplayName", "EvaluateExpression"),
            new XElement(Xns.Mxswa + "ActivityReference.Arguments",
                In("x:String", "ExpressionOperator", op),
                parametersElement,
                target.Omitted
                    ? new XElement(Xns.X + "Null", new XAttribute(Xns.X + "Key", "TargetType"))
                    : new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "s:Type"), new XAttribute(Xns.X + "Key", "TargetType"), TypeLiteral(target.Type)),
                Out("x:Object", "Result", $"[{result}]")));
    }

    private static XElement Convert(string value, ValueKind kind, string result) =>
        new(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("ConvertCrmXrmTypes")), new XAttribute("DisplayName", "ConvertCrmXrmTypes"),
            new XElement(Xns.Mxswa + "ActivityReference.Arguments",
                In("x:Object", "Value", $"[{value}]"),
                new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "s:Type"), new XAttribute(Xns.X + "Key", "TargetType"), TypeLiteral(ValueKinds.TypeName(kind))),
                Out("x:Object", "Result", $"[{result}]")));

    private static XElement GetProperty(string column, string key, string table, string result, ValueKind? kind) =>
        new(Xns.Mxswa + "GetEntityProperty", new XAttribute("Attribute", column), new XAttribute("Entity", Entity("InputEntities", key)),
            new XAttribute("EntityName", table), new XAttribute("Value", $"[{result}]"),
            new XElement(Xns.Mxswa + "GetEntityProperty.TargetType",
                new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "s:Type"), TypeLiteral(kind is { } k ? ValueKinds.TypeName(k) : null))));

    private static XElement SetProperty(string column, string temp, string table, string value, ValueKind kind) =>
        new(Xns.Mxswa + "SetEntityProperty", new XAttribute("Attribute", column), new XAttribute("Entity", Entity("CreatedEntities", temp)),
            new XAttribute("EntityName", table), new XAttribute("Value", $"[{value}]"),
            new XElement(Xns.Mxswa + "SetEntityProperty.TargetType",
                new XElement(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", "s:Type"), TypeLiteral(ValueKinds.TypeName(kind)))));

    private static XElement Assign(string type, string to, string value) =>
        new(Xns.A + "Assign", new XAttribute(Xns.X + "TypeArguments", type), new XAttribute("To", to), new XAttribute("Value", value));

    private static XElement In(string type, string key, string value) =>
        new(Xns.A + "InArgument", new XAttribute(Xns.X + "TypeArguments", type), new XAttribute(Xns.X + "Key", key), value);

    private static XElement Out(string type, string key, string value) =>
        new(Xns.A + "OutArgument", new XAttribute(Xns.X + "TypeArguments", type), new XAttribute(Xns.X + "Key", key), value);

    private static AgentProblemException Invalid(string message) => ProcessCatalog.Invalid(message);

    /// <summary>The variables and activities of one step.</summary>
    private sealed class Scope(string name)
    {
        private int count;

        public List<XElement> Variables { get; } = [];

        public List<XElement> Activities { get; } = [];

        public string Variable()
        {
            var variable = $"{name}_{++count}";
            Variables.Add(new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:Object"), new XAttribute("Name", variable)));
            return variable;
        }

        public string Bool()
        {
            var variable = $"{name}_{++count}";
            Variables.Add(BoolVariable(variable));
            return variable;
        }

        public string Converted(string variable)
        {
            var converted = $"{variable}_converted";
            Variables.Add(new XElement(Xns.A + "Variable", new XAttribute(Xns.X + "TypeArguments", "x:Object"), new XAttribute("Name", converted)));
            return converted;
        }

        public void Add(XElement activity) => Activities.Add(activity);

        public XElement Sequence(string display) =>
            new(Xns.A + "Sequence", new XAttribute("DisplayName", display),
                new XElement(Xns.A + "Sequence.Variables", Variables), Activities);

        public XElement Composite(string display) =>
            new(Xns.Mxswa + "ActivityReference", new XAttribute("AssemblyQualifiedName", Xns.Crm("Composite")), new XAttribute("DisplayName", display),
                new XElement(Xns.Mxswa + "ActivityReference.Properties",
                    new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Variable"), new XAttribute(Xns.X + "Key", "Variables"), Variables),
                    new XElement(Xns.Sco + "Collection", new XAttribute(Xns.X + "TypeArguments", "Activity"), new XAttribute(Xns.X + "Key", "Activities"), Activities)));
    }
}
