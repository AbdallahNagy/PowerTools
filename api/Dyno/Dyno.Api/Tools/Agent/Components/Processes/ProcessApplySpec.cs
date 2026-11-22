using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Processes;

[JsonConverter(typeof(JsonStringEnumConverter<ProcessKind>))]
public enum ProcessKind
{
    [JsonStringEnumMemberName("workflow")] Workflow,
    [JsonStringEnumMemberName("action")] Action,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessMode>))]
public enum ProcessMode
{
    [JsonStringEnumMemberName("realtime")] Realtime,
    [JsonStringEnumMemberName("background")] Background,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessState>))]
public enum ProcessState
{
    [JsonStringEnumMemberName("activated")] Activated,
    [JsonStringEnumMemberName("draft")] Draft,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessRunAs>))]
public enum ProcessRunAs
{
    [JsonStringEnumMemberName("owner")] Owner,
    [JsonStringEnumMemberName("user")] User,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessArgumentType>))]
public enum ProcessArgumentType
{
    [JsonStringEnumMemberName("string")] String,
    [JsonStringEnumMemberName("integer")] Integer,
    [JsonStringEnumMemberName("float")] Float,
    [JsonStringEnumMemberName("decimal")] Decimal,
    [JsonStringEnumMemberName("boolean")] Boolean,
    [JsonStringEnumMemberName("datetime")] DateTime,
    [JsonStringEnumMemberName("entityReference")] EntityReference,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessStopStatus>))]
public enum ProcessStopStatus
{
    [JsonStringEnumMemberName("succeeded")] Succeeded,
    [JsonStringEnumMemberName("canceled")] Canceled,
}

[JsonConverter(typeof(JsonStringEnumConverter<ProcessOperator>))]
public enum ProcessOperator
{
    [JsonStringEnumMemberName("equals")] Equal,
    [JsonStringEnumMemberName("notEquals")] NotEqual,
    [JsonStringEnumMemberName("null")] IsNull,
    [JsonStringEnumMemberName("notNull")] NotNull,
    [JsonStringEnumMemberName("in")] In,
}

[Description("A classic workflow or custom process action, saved through a solution import so it behaves the same online and on-premises. The steps replace the process's steps. See the guide powertools://guides/classic-workflows.")]
public sealed class ProcessApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the process goes into.")]
    public required string Solution { get; init; }

    [Description("The process name; an existing workflow or action matches by name.")]
    public required string Name { get; init; }

    [Description("workflow or action. Cannot change.")]
    public required ProcessKind Kind { get; init; }

    [Description("Logical name of the primary table. Cannot change.")]
    public required string Table { get; init; }

    public string? Description { get; init; }

    [Description("Workflows: realtime or background. Default realtime.")]
    public ProcessMode? Mode { get; init; }

    [Description("Workflows: when it starts. Default on demand only.")]
    public ProcessTriggers? Triggers { get; init; }

    [Description("Real-time workflows: run as the workflow owner or the user who made the change. Default owner.")]
    public ProcessRunAs? RunAs { get; init; }

    [Description("Actions: the message name with the publisher prefix, for example contoso_NotifyPayment. Default: prefix plus the name without spaces.")]
    public string? UniqueName { get; init; }

    [Description("Actions: input arguments. Target is added for the primary table.")]
    public List<ProcessArgument>? Arguments { get; init; }

    [Description("The steps, in order. Needed for a new process.")]
    public List<ProcessStep>? Steps { get; init; }

    [Description("activated or draft. Default activated.")]
    public ProcessState? State { get; init; }
}

public sealed class ProcessTriggers
{
    [Description("Users can run it on demand.")]
    public bool? OnDemand { get; init; }

    [Description("Other workflows can start it as a child workflow.")]
    public bool? AsChild { get; init; }

    public bool? OnCreate { get; init; }

    [Description("Columns whose change starts it. An empty list removes the update trigger.")]
    public List<string>? OnUpdate { get; init; }
}

public sealed class ProcessArgument
{
    public required string Name { get; init; }

    public required ProcessArgumentType Type { get; init; }

    public bool? Required { get; init; }

    [Description("entityReference arguments: the table.")]
    public string? Table { get; init; }

    public string? Description { get; init; }
}

[Description("One step: exactly one of update, create, sendEmail, assign, setState, if, childWorkflow, action, customActivity, stop, keep.")]
public sealed class ProcessStep
{
    [Description("Text shown after the step in the designer.")]
    public string? Label { get; init; }

    [Description("Update the primary record or a record a lookup on it points to.")]
    public ProcessRecordUpdate? Update { get; init; }

    public ProcessRecordCreate? Create { get; init; }

    public ProcessSendEmail? SendEmail { get; init; }

    [Description("Assign the primary record (or one a lookup points to) to a user or team.")]
    public ProcessAssign? Assign { get; init; }

    public ProcessSetState? SetState { get; init; }

    public ProcessIf? If { get; init; }

    [Description("Name of the workflow to start as a child of the primary record; it must allow running as a child.")]
    public string? ChildWorkflow { get; init; }

    public ProcessActionCall? Action { get; init; }

    public ProcessCustomActivity? CustomActivity { get; init; }

    public ProcessStop? Stop { get; init; }

    [Description("A step Power Tools reads but cannot write (for example a custom step with outputs): its id from inspect_solution, kept exactly as it is.")]
    public string? Keep { get; init; }

    [Description("Read back only, with keep: what the kept step does. Ignored when written.")]
    public string? Summary { get; init; }
}

public sealed class ProcessRecordUpdate
{
    [Description("primary, or the lookup column on the primary record. Default primary.")]
    public string? Record { get; init; }

    [Description("Column logical name to value. See the guide for values.")]
    public required Dictionary<string, JsonElement> Values { get; init; }
}

public sealed class ProcessRecordCreate
{
    public required string Table { get; init; }

    public required Dictionary<string, JsonElement> Values { get; init; }
}

public sealed class ProcessSendEmail
{
    [Description("A value that gives one user, team, contact, account or queue.")]
    public JsonElement? From { get; init; }

    public List<JsonElement>? To { get; init; }

    public List<JsonElement>? Cc { get; init; }

    public required JsonElement Subject { get; init; }

    public JsonElement? Body { get; init; }

    [Description("Default: the primary record.")]
    public JsonElement? Regarding { get; init; }

    [Description("Other email columns to set, column logical name to value.")]
    public Dictionary<string, JsonElement>? Values { get; init; }
}

public sealed class ProcessAssign
{
    [Description("primary, or a lookup column on the primary record. Default primary.")]
    public string? Record { get; init; }

    [Description("A value that gives a user or team.")]
    public required JsonElement Owner { get; init; }
}

public sealed class ProcessSetState
{
    [Description("primary, or a lookup column on the primary record. Default primary.")]
    public string? Record { get; init; }

    public required int State { get; init; }

    public required int Status { get; init; }
}

public sealed class ProcessIf
{
    public required ProcessCondition Condition { get; init; }

    public required List<ProcessStep> Then { get; init; }

    public List<ProcessElseIf>? ElseIf { get; init; }

    public List<ProcessStep>? Else { get; init; }
}

public sealed class ProcessElseIf
{
    public required ProcessCondition Condition { get; init; }

    public required List<ProcessStep> Then { get; init; }
}

[Description("A column test, or all (and) or any (or) of other conditions.")]
public sealed class ProcessCondition
{
    public string? Column { get; init; }

    [Description("Actions: test an input argument instead of a column.")]
    public string? Argument { get; init; }

    [Description("The lookup column on the primary record whose record holds column. Default the primary record.")]
    public string? From { get; init; }

    public ProcessOperator? Operator { get; init; }

    public JsonElement? Value { get; init; }

    [Description("For in.")]
    public List<JsonElement>? Values { get; init; }

    public List<ProcessCondition>? All { get; init; }

    public List<ProcessCondition>? Any { get; init; }
}

public sealed class ProcessActionCall
{
    [Description("The message name of an activated custom process action, for example contoso_NotifyPayment.")]
    public required string Name { get; init; }

    [Description("The record passed as Target: primary or a lookup column. Default primary.")]
    public string? Record { get; init; }
}

public sealed class ProcessCustomActivity
{
    [Description("The type name of a registered custom workflow activity, for example Contoso.Steps.CloseTasks.")]
    public required string Type { get; init; }

    public List<ProcessCustomInput>? Inputs { get; init; }
}

public sealed class ProcessCustomInput
{
    public required string Name { get; init; }

    [Description("string, boolean, entityReference or datetime.")]
    public required ProcessArgumentType Type { get; init; }

    [Description("A value; null leaves the input empty.")]
    public required JsonElement Value { get; init; }
}

public sealed class ProcessStop
{
    [Description("succeeded or canceled.")]
    public required ProcessStopStatus Status { get; init; }

    public string? Message { get; init; }
}
