using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Flows;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class FlowPlannerTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<FlowApplySpec>(FlowPlanner.Family, new FlowPlanner());
    private readonly RowWorld world = new();

    public FlowPlannerTests() => world.Features.Add("connectionreference");

    private const string Definition = """
        {
          "triggers": {
            "When_an_account_is_added": {
              "type": "OpenApiConnectionWebhook",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger", "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": { "subscriptionRequest/message": 1, "subscriptionRequest/entityname": "account", "subscriptionRequest/scope": 4 },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "actions": {
            "Add_a_task": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord", "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": { "entityName": "tasks", "item/subject": "Call the new account" },
                "authentication": "@parameters('$authentication')"
              }
            }
          }
        }
        """;

    private static FlowApplySpec Spec(FlowState? state = null, string definition = Definition, bool references = true) => new()
    {
        Solution = "Core",
        Name = "New account follow-up",
        ConnectionReferences = references
            ? new() { ["shared_commondataserviceforapps"] = new FlowConnectionReference { LogicalName = "new_dataverse", Connector = "shared_commondataserviceforapps" } }
            : null,
        Definition = JsonSerializer.Deserialize<JsonElement>(definition),
        State = state,
    };

    private Task<Plan> PlanAsync(FlowApplySpec spec) => new FlowPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Flow => world.Table("workflow").Single();

    private void Connect() => world.Table("connectionreference").Single()["connectionid"] = "shared-commondataser-1234";

    [Fact]
    public async Task Creates_the_reference_and_the_flow_but_stays_off_and_names_the_connector_to_sign_in_to()
    {
        var result = await world.ApplyAsync(Family, Spec(FlowState.On));

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal(["createConnectionReference", "createFlow"], result.Steps.Where(s => s.Status == StepStatus.Done).Select(s => s.Op));
        var blocked = Assert.Single(result.Remaining.Steps);
        Assert.Equal("turnOnFlow", blocked.Op);
        Assert.Contains("new_dataverse (shared_commondataserviceforapps)", blocked.Reason);
        Assert.Contains("maker portal", blocked.Reason);

        var reference = world.Table("connectionreference").Single();
        Assert.Equal("/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", reference["connectorid"]);
        Assert.Equal(5, Flow.GetAttributeValue<OptionSetValue>("category").Value);
        Assert.Equal(1, Flow.GetAttributeValue<OptionSetValue>("type").Value);
        Assert.Equal("none", Flow["primaryentity"]);
        var clientData = JsonNode.Parse(Flow.GetAttributeValue<string>("clientdata"))!;
        Assert.Equal("new_dataverse", clientData["properties"]!["connectionReferences"]!["shared_commondataserviceforapps"]!["connection"]!["connectionReferenceLogicalName"]!.GetValue<string>());
        Assert.Equal(FlowPlanner.SchemaUri, clientData["properties"]!["definition"]!["$schema"]!.GetValue<string>());
        Assert.NotNull(clientData["properties"]!["definition"]!["parameters"]!["$connections"]);
    }

    [Fact]
    public async Task Once_the_reference_has_a_connection_the_same_spec_turns_the_flow_on_and_then_plans_nothing()
    {
        await world.ApplyAsync(Family, Spec(FlowState.On));
        Connect();

        var plan = await PlanAsync(Spec(FlowState.On));
        Assert.Equal("turnOnFlow", Assert.Single(plan.Steps).Op);
        var result = await world.ApplyAsync(Family, Spec(FlowState.On));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(1, Flow.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Empty((await PlanAsync(Spec(FlowState.On))).Steps);
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task A_definition_change_on_a_flow_that_is_on_turns_it_off_saves_it_and_turns_it_on_again()
    {
        await world.ApplyAsync(Family, Spec(FlowState.On));
        Connect();
        await world.ApplyAsync(Family, Spec(FlowState.On));
        var changed = Definition.Replace("Call the new account", "Welcome the new account");

        var step = Assert.Single((await PlanAsync(Spec(definition: changed))).Steps);
        Assert.Equal("updateFlow", step.Op);
        Assert.Contains("on again after", step.Detail);
        var result = await world.ApplyAsync(Family, Spec(definition: changed));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Contains("Welcome the new account", Flow.GetAttributeValue<string>("clientdata"));
        Assert.Equal(1, Flow.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Empty((await PlanAsync(Spec(definition: changed))).Steps);
    }

    [Fact]
    public async Task The_approval_hash_covers_which_connection_reference_the_flow_uses()
    {
        world.Add(new Entity("connectionreference") { ["connectionreferencelogicalname"] = "new_other", ["connectorid"] = "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" });
        var spec = Spec();
        var other = new FlowApplySpec
        {
            Solution = spec.Solution,
            Name = spec.Name,
            Definition = spec.Definition,
            ConnectionReferences = new() { ["shared_commondataserviceforapps"] = new FlowConnectionReference { LogicalName = "new_other", Connector = "shared_commondataserviceforapps" } },
        };

        var first = await PlanAsync(spec);
        var second = await PlanAsync(other);

        Assert.Contains("shared_commondataserviceforapps → new_dataverse", first.Steps.Single(s => s.Op == "createFlow").Detail);
        Assert.NotEqual(first.Steps.Single(s => s.Op == "createFlow").Detail, second.Steps.Single(s => s.Op == "createFlow").Detail);
    }

    [Fact]
    public async Task State_off_turns_a_running_flow_off()
    {
        await world.ApplyAsync(Family, Spec(FlowState.On));
        Connect();
        await world.ApplyAsync(Family, Spec(FlowState.On));

        var result = await world.ApplyAsync(Family, Spec(FlowState.Off));

        Assert.Equal("turnOffFlow", Assert.Single(result.Steps).Op);
        Assert.Equal(0, Flow.GetAttributeValue<OptionSetValue>("statecode").Value);
    }

    [Fact]
    public async Task A_connection_the_definition_uses_without_a_reference_entry_is_refused()
    {
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(references: false)));

        Assert.Contains("shared_commondataserviceforapps", error.Problem.Message);
        Assert.Empty(world.Writes);
    }

    [Fact]
    public async Task A_reference_that_exists_for_another_connector_is_refused()
    {
        world.Add(new Entity("connectionreference")
        {
            ["connectionreferencelogicalname"] = "new_dataverse",
            ["connectorid"] = "/providers/Microsoft.PowerApps/apis/shared_office365",
        });

        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec()));

        Assert.Contains("shared_office365", error.Problem.Message);
    }

    [Fact]
    public async Task A_managed_flow_is_blocked()
    {
        await world.ApplyAsync(Family, Spec());
        Flow["ismanaged"] = true;

        var step = Assert.Single((await PlanAsync(Spec(definition: Definition.Replace("Call", "Phone")))).Steps);

        Assert.Equal(PlanStepKind.Blocked, step.Kind);
    }

    [Fact]
    public async Task Without_cloud_flows_the_plan_is_unsupported_and_names_process_apply()
    {
        world.Features.Remove("connectionreference");

        var step = Assert.Single((await PlanAsync(Spec(FlowState.On))).Steps);

        Assert.Equal(PlanStepKind.Unsupported, step.Kind);
        Assert.Contains("process_apply", step.Route);
    }

    [Fact]
    public async Task Describe_returns_the_spec_shape_so_a_read_flow_can_be_sent_back()
    {
        await world.ApplyAsync(Family, Spec());

        var described = FlowPlanner.Describe(Flow);

        Assert.Equal("off", described["state"]);
        var references = Assert.IsType<Dictionary<string, object?>>(described["connectionReferences"]);
        Assert.Contains("shared_commondataserviceforapps", references.Keys);
        var definition = Assert.IsType<JsonElement>(described["definition"]);
        var roundTrip = Spec();
        Assert.Empty((await PlanAsync(new FlowApplySpec
        {
            Solution = "Core",
            Name = roundTrip.Name,
            ConnectionReferences = roundTrip.ConnectionReferences,
            Definition = definition,
        })).Steps);
    }
}
