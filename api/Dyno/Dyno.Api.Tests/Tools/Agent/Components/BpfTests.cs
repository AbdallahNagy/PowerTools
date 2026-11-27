using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.BusinessProcessFlows;
using Dyno.Api.Tools.Agent.Components.Processes;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

/// <summary>
/// bpf_apply against designer-made flows (TestFixtures/BusinessProcessFlows) and a fake environment: reading the
/// designer's XAML, writing it back the same way, and the plan for creating, changing and activating a flow.
/// </summary>
public sealed class BpfTests
{
    private static readonly string Folder = Path.Combine(System.AppContext.BaseDirectory, "Tools", "Agent", "TestFixtures", "BusinessProcessFlows");
    private static readonly IApplyFamily Family = new ApplyFamily<BpfApplySpec>(BpfPlanner.Family, new BpfPlanner());
    private readonly RowWorld world = new();

    public BpfTests()
    {
        world.Schema.AddTable("new_Permit", "Permit", "Permits");
        world.Schema.AddColumn("new_permit", new PicklistAttributeMetadata { SchemaName = "new_Status", DisplayName = new Label("Status", 1033) });
        world.Schema.AddColumn("new_permit", new BooleanAttributeMetadata { SchemaName = "new_Urgent", DisplayName = new Label("Urgent", 1033) });
        world.Schema.AddColumn("new_permit", new DateTimeAttributeMetadata { SchemaName = "new_Due", DisplayName = new Label("Due", 1033) });
        world.Schema.AddColumn("new_permit", new LookupAttributeMetadata { SchemaName = "new_ApplicantId", Targets = ["contact"], DisplayName = new Label("Applicant", 1033) });
        world.Schema.AddColumn("new_permit", new ManagedPropertyAttributeMetadata { SchemaName = "new_Odd" });
        // Activating a flow makes Dataverse name it and create the table that holds each record's progress.
        world.OnExecute = request =>
        {
            if (request is SetStateRequest { State.Value: 1 } state && state.EntityMoniker.LogicalName == "workflow")
            {
                var row = world.Row("workflow", state.EntityMoniker.Id);
                var backing = $"new_bpf_{row.Id:N}";
                row["uniquename"] = backing;
                if (!world.Schema.Tables.ContainsKey(backing)) world.Schema.AddTable(backing, "Permit flow", "Permit flows").MetadataId = Guid.NewGuid();
            }

            return null;
        };
    }

    private static string Fixture(string prefix, string extension) =>
        File.ReadAllText(Directory.GetFiles(Folder, $"{prefix}*{extension}").Single());

    private static BpfApplySpec Spec(string stages = Stages, BpfState? state = null, string? description = null) => new()
    {
        Solution = "Core",
        Name = "Permit review",
        Table = "new_permit",
        Description = description,
        Stages = JsonSerializer.Deserialize<List<BpfStage>>(stages, JsonSerializerOptions.Web),
        State = state,
    };

    private const string Stages = """
        [
          { "name": "Apply", "steps": [ { "column": "new_applicantid", "required": true }, { "column": "new_name" } ] },
          { "name": "Review", "steps": [ { "column": "new_status", "label": "Decide" }, { "column": "new_urgent" } ] },
          { "name": "Close", "steps": [ { "column": "new_due" } ] }
        ]
        """;

    private Task<Plan> PlanAsync(BpfApplySpec spec) => new BpfPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Flow => world.Table("workflow").Single();

    // ── The designer's XAML ──────────────────────────────────────────────────

    [Fact]
    public void Reads_a_linear_designer_flow_saved_with_older_namespaces()
    {
        var reading = BpfXaml.Read(Fixture("Translation_Process", ".xaml"));

        Assert.Empty(reading.Problems);
        Assert.Equal("knowledgearticle", reading.Table);
        Assert.Equal(["Author", "Publish"], reading.Stages.Select(s => s.Name));
        var language = Assert.Single(reading.Stages[0].Steps);
        Assert.Equal(("languagelocaleid", "Set Language", true, "270BD3DB-D9AF-4782-9025-509E298DEC0A"), (language.Column, language.Label, language.Required, language.ClassId));
        Assert.Equal(Guid.Parse("70fd6400-6034-4005-983a-d9b2d47edc26"), language.Id);
        Assert.Equal(Guid.Parse("24c90895-7a93-4851-9856-2da2dd47bf32"), reading.Stages[0].Id);
        Assert.Null(reading.Stages[0].Category);
        Assert.Equal("-1", reading.Stages[1].Category);
        Assert.False(Assert.Single(reading.Stages[1].Steps).Required);
    }

    [Theory]
    [InlineData("Expired_Process")]
    [InlineData("New_Process")]
    public void A_flow_with_branches_reads_its_stages_and_says_it_cannot_be_written_yet(string fixture)
    {
        var reading = BpfXaml.Read(Fixture(fixture, ".xaml"));

        Assert.Equal(4, reading.Stages.Count);
        Assert.Contains(reading.Problems, p => p.Contains("branches", StringComparison.Ordinal));
        Assert.DoesNotContain(reading.Problems, p => p.Contains("order", StringComparison.Ordinal));
    }

    [Fact]
    public void Writing_a_flow_back_reads_the_same_and_has_the_designer_client_data_shape()
    {
        var reading = BpfXaml.Read(Fixture("Translation_Process", ".xaml"));
        var id = Guid.Parse("bd57803e-0408-44d6-b21d-ae7158ec6555");

        var xaml = BpfXaml.Write(id, "knowledgearticle", reading.Stages, 1033);
        var again = BpfXaml.Read(xaml);

        Assert.Empty(again.Problems);
        Assert.Equal(JsonSerializer.Serialize(reading.Stages), JsonSerializer.Serialize(again.Stages));
        Assert.StartsWith($"<Activity x:Class=\"XrmWorkflow{id:N}\"", xaml);

        var written = JsonNode.Parse(BpfXaml.ClientData(id, "Translation Process", "Translations", "knowledgearticle", reading.Stages, 1033))!;
        var designer = JsonNode.Parse(Fixture("Translation_Process", ".clientdata.json"))!;
        Assert.Equal(Keys(designer), Keys(written));
        Assert.Equal(Shape(designer), Shape(written));
        Assert.Equal("bd57803e-0408-44d6-b21d-ae7158ec6555", written["workflowEntityId"]!.GetValue<string>());
    }

    /// <summary>The property names of the root and of every step, by step class.</summary>
    private static string Keys(JsonNode root)
    {
        var keys = new SortedDictionary<string, string>(StringComparer.Ordinal) { ["root"] = string.Join(",", root.AsObject().Select(p => p.Key).Order(StringComparer.Ordinal)) };
        foreach (var step in Steps(root)) keys[step["__class"]!.GetValue<string>()] = string.Join(",", step.AsObject().Select(p => p.Key).Order(StringComparer.Ordinal));
        return string.Join("\n", keys.Select(k => $"{k.Key}: {k.Value}"));
    }

    /// <summary>The step classes in tree order, with the ids and labels that the flow runs on.</summary>
    private static string Shape(JsonNode root) => string.Join("\n", Steps(root).Select(s =>
        $"{s["__class"]} {s["stageId"]} {s["nextStageId"]} {s["stepStepId"]} {s["dataFieldName"]} {s["isProcessRequired"]} {s["stepLabels"]?["list"]?.ToJsonString()}"));

    private static IEnumerable<JsonNode> Steps(JsonNode node)
    {
        foreach (var child in node["steps"]?["list"]?.AsArray() ?? [])
        {
            yield return child!;
            foreach (var inner in Steps(child!)) yield return inner;
        }
    }

    // ── Planning and applying ────────────────────────────────────────────────

    [Fact]
    public async Task Creates_an_active_flow_turns_flows_on_for_the_table_and_adds_the_progress_table_to_the_solution()
    {
        var plan = await PlanAsync(Spec());
        Assert.Equal(["enableBusinessProcessFlows", "createBpf", "activateBpf"], plan.Steps.Select(s => s.Op));
        Assert.Contains("Apply (new_applicantid*, new_name) → Review (new_status, new_urgent) → Close (new_due)", plan.Steps[1].Detail);

        var result = await world.ApplyAsync(Family, Spec());

        Assert.True(result.Outcome == ApplyOutcome.Applied, JsonSerializer.Serialize(result));
        Assert.True(world.Schema.Tables["new_permit"].IsBusinessProcessEnabled);
        Assert.Equal(4, Flow.GetAttributeValue<OptionSetValue>("category").Value);
        Assert.Equal(0, Flow.GetAttributeValue<OptionSetValue>("businessprocesstype").Value);
        Assert.Equal(1, Flow.GetAttributeValue<OptionSetValue>("statecode").Value);
        var create = world.Executed.OfType<Microsoft.Xrm.Sdk.Messages.CreateRequest>().Single();
        Assert.Equal("Core", create.Parameters["SolutionUniqueName"]);
        var backing = world.Schema.Tables[$"new_bpf_{Flow.Id:N}"];
        Assert.Contains(world.Table("solutioncomponent"), c => (Guid)c["objectid"] == backing.MetadataId && c.GetAttributeValue<OptionSetValue>("componenttype").Value == 1);
        Assert.DoesNotContain(world.Table("solutioncomponent"), c => (Guid)c["objectid"] == world.Schema.Tables["new_permit"].MetadataId);

        var reading = BpfXaml.Read(Flow.GetAttributeValue<string>("xaml"));
        Assert.Empty(reading.Problems);
        Assert.Equal(["Apply", "Review", "Close"], reading.Stages.Select(s => s.Name));
        Assert.Equal(["Applicant", "Name"], reading.Stages[0].Steps.Select(s => s.Label));
        Assert.Equal("Decide", reading.Stages[1].Steps[0].Label);
        Assert.Equal("67fac785-cd58-4f9f-abb3-4b7ddc6ed5ed", reading.Stages[1].Steps[1].ClassId);
        Assert.Equal("new_permit", JsonNode.Parse(Flow.GetAttributeValue<string>("clientdata"))!["primaryEntityName"]!.GetValue<string>());

        Assert.Empty((await PlanAsync(Spec())).Steps);
        Assert.Empty((await PlanAsync(new BpfApplySpec { Solution = "Core", Name = "Permit review", Table = "new_permit" })).Steps);
    }

    [Fact]
    public async Task Planning_a_new_flow_twice_gives_the_same_hash()
    {
        Assert.Equal((await PlanAsync(Spec())).Hash, (await PlanAsync(Spec())).Hash);
    }

    [Fact]
    public async Task Changing_an_active_flow_keeps_stage_and_step_ids_saves_it_in_draft_and_activates_it_again()
    {
        await world.ApplyAsync(Family, Spec());
        var before = BpfXaml.Read(Flow.GetAttributeValue<string>("xaml")).Stages;
        const string changed = """
            [
              { "name": "Apply", "steps": [ { "column": "new_applicantid" }, { "column": "new_name" }, { "column": "new_due", "required": true } ] },
              { "name": "Review", "steps": [ { "column": "new_status" }, { "column": "new_urgent" } ] },
              { "name": "Close", "steps": [ { "column": "new_due" } ] }
            ]
            """;

        var step = Assert.Single((await PlanAsync(Spec(changed))).Steps);
        Assert.Equal("updateBpf", step.Op);
        Assert.Equal(PlanEffect.Change, step.Effect);
        Assert.Contains("changes the steps of Apply;", step.Detail);
        Assert.Contains("deactivated while it is saved", step.Detail);
        var result = await world.ApplyAsync(Family, Spec(changed));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(1, Flow.GetAttributeValue<OptionSetValue>("statecode").Value);
        var states = world.Executed.OfType<SetStateRequest>().Select(s => s.State.Value).ToList();
        Assert.Equal([1, 0, 1], states);
        var after = BpfXaml.Read(Flow.GetAttributeValue<string>("xaml")).Stages;
        Assert.Equal(before.Select(s => s.Id), after.Select(s => s.Id));
        Assert.Equal(before[0].Steps[0].Id, after[0].Steps[0].Id);
        Assert.True(after[0].Steps[0].Required, "a step left without required keeps its current setting");
        Assert.Equal("Decide", after[1].Steps[0].Label);
        Assert.Equal("new_due", after[0].Steps[2].ControlId);
        Assert.Equal("new_due1", after[2].Steps[0].ControlId);
        Assert.Equal(before[2].Steps[0].Id, after[2].Steps[0].Id);
        Assert.Empty((await PlanAsync(Spec(changed))).Steps);
    }

    [Fact]
    public async Task Removing_a_stage_is_destructive_and_says_records_there_lose_their_place()
    {
        await world.ApplyAsync(Family, Spec());
        const string shorter = """[ { "name": "Apply", "steps": [ { "column": "new_applicantid" } ] }, { "name": "Close", "steps": [ { "column": "new_due" } ] } ]""";

        var step = Assert.Single((await PlanAsync(Spec(shorter))).Steps);

        Assert.Equal(PlanEffect.Destructive, step.Effect);
        Assert.Contains("removes stage(s) Review", step.Detail);
    }

    [Fact]
    public async Task Draft_leaves_a_new_flow_inactive_and_a_later_state_change_is_its_own_step()
    {
        await world.ApplyAsync(Family, Spec(state: BpfState.Draft));
        Assert.Equal(0, Flow.GetAttributeValue<OptionSetValue>("statecode")?.Value ?? 0);
        Assert.DoesNotContain(world.Executed, r => r is SetStateRequest);

        var step = Assert.Single((await PlanAsync(Spec(state: BpfState.Active))).Steps);
        Assert.Equal("activateBpf", step.Op);
    }

    [Theory]
    [InlineData("""[ { "name": "A", "steps": [ { "column": "new_missing" } ] } ]""", "has no column new_missing")]
    [InlineData("""[ { "name": "A" }, { "name": "a" } ]""", "two stages are named a")]
    [InlineData("""[ { "name": "A", "steps": [ { "column": "new_name" }, { "column": "new_name" } ] } ]""", "appears twice")]
    [InlineData("""[ { "name": "A", "steps": [ { "column": "new_odd" } ] } ]""", "cannot show")]
    [InlineData("[]", "at least one stage")]
    public async Task Rejects_specs_it_cannot_write(string stages, string message)
    {
        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(stages)));
        Assert.Contains(message, problem.Problem.Message);
    }

    [Fact]
    public async Task Refuses_a_name_that_belongs_to_a_classic_workflow()
    {
        world.Add(new Entity("workflow") { ["name"] = "Permit review", ["type"] = new OptionSetValue(1), ["category"] = new OptionSetValue(0), ["primaryentity"] = "new_permit" });

        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec()));
        Assert.Contains("not a business process flow", problem.Problem.Message);
    }

    [Fact]
    public async Task Refuses_to_rewrite_a_flow_with_branches_but_can_still_change_its_state()
    {
        world.Schema.Tables["new_permit"].IsBusinessProcessEnabled = true;
        world.Add(new Entity("workflow")
        {
            ["name"] = "Permit review",
            ["type"] = new OptionSetValue(1),
            ["category"] = new OptionSetValue(4),
            ["businessprocesstype"] = new OptionSetValue(0),
            ["primaryentity"] = "new_permit",
            ["statecode"] = new OptionSetValue(0),
            ["xaml"] = Fixture("Expired_Process", ".xaml"),
        });

        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec()));
        Assert.Contains("branches", problem.Problem.Message);
        var step = Assert.Single((await PlanAsync(new BpfApplySpec { Solution = "Core", Name = "Permit review", Table = "new_permit", State = BpfState.Active })).Steps);
        Assert.Equal("activateBpf", step.Op);
    }

    [Fact]
    public async Task Describe_gives_back_a_spec_that_plans_nothing()
    {
        await world.ApplyAsync(Family, Spec(description: "Permit stages"));

        var described = BpfPlanner.Describe(Flow);
        Assert.Equal("active", described["state"]);
        Assert.Equal($"new_bpf_{Flow.Id:N}", described["progressTable"]);
        var json = JsonSerializer.Serialize(described);
        var spec = JsonSerializer.Deserialize<BpfApplySpec>(json.Replace("\"name\":\"Permit review\"", "\"solution\":\"Core\",\"name\":\"Permit review\""), JsonSerializerOptions.Web)!;

        Assert.Equal(3, spec.Stages!.Count);
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public void Process_apply_points_a_business_process_flow_to_bpf_apply()
    {
        var row = new Entity("workflow") { ["name"] = "Permit review", ["category"] = new OptionSetValue(4), ["primaryentity"] = "new_permit" };

        Assert.Contains("bpf_apply", (string)ProcessPlanner.Describe(row)["note"]!);
    }
}
