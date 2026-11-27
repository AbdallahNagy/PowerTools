using System.ComponentModel;
using System.Text.Json.Serialization;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.BusinessProcessFlows;

[JsonConverter(typeof(JsonStringEnumConverter<BpfState>))]
public enum BpfState
{
    [JsonStringEnumMemberName("active")] Active,
    [JsonStringEnumMemberName("draft")] Draft,
}

[Description("A business process flow on one table: its stages in order, each with the columns users fill in. Written with SDK messages, so it works online and on-premises. The stages replace the flow's stages. See the guide dyno://guides/business-process-flows.")]
public sealed class BpfApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the flow, and the table that holds its progress, go into.")]
    public required string Solution { get; init; }

    [Description("The flow's name; an existing business process flow matches by name.")]
    public required string Name { get; init; }

    [Description("Logical name of the table the flow runs on. Cannot change. Business process flows are turned on for the table if they are not yet; that cannot be undone.")]
    public required string Table { get; init; }

    public string? Description { get; init; }

    [Description("The stages, in the order a record moves through them. Needed for a new flow. A stage keeps its id (and the records at it) when its name stays the same.")]
    public List<BpfStage>? Stages { get; init; }

    [Description("active or draft. Default: a new flow is active, an existing one keeps its state.")]
    public BpfState? State { get; init; }
}

public sealed class BpfStage
{
    [Description("The stage name, unique in the flow.")]
    public required string Name { get; init; }

    [Description("The data steps, in order. A stage may have none.")]
    public List<BpfStep>? Steps { get; init; }
}

public sealed class BpfStep
{
    [Description("Logical name of a column on the flow's table.")]
    public required string Column { get; init; }

    [Description("Text shown for the step. Default: the column's display name, or the current label.")]
    public string? Label { get; init; }

    [Description("The step must have a value before the record moves to the next stage. Default false, or the current setting.")]
    public bool? Required { get; init; }
}
