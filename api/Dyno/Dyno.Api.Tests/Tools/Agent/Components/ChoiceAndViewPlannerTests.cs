using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Choices;
using Dyno.Api.Tools.Agent.Components.Views;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class ChoicePlannerTests
{
    private readonly RowWorld world = new();
    private static readonly IApplyFamily Family = new ApplyFamily<ChoiceApplySpec>(ChoicePlanner.Family, new ChoicePlanner());

    private Task<Plan> PlanAsync(ChoiceApplySpec spec) => new ChoicePlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private static ChoiceApplySpec Priority(params ChoiceOption[] options) => new()
    {
        Solution = "Core",
        Name = "new_priority",
        DisplayName = "Priority",
        Options = [.. options],
    };

    [Fact]
    public async Task A_new_choice_takes_values_from_the_publisher_prefix_and_plans_nothing_after_apply()
    {
        var spec = Priority(new() { Label = "Low" }, new() { Label = "High", Color = "#FF0000" });

        var plan = await PlanAsync(spec);
        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal("createChoice", Assert.Single(plan.Steps).Op);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var set = world.Schema.GlobalChoices["new_priority"];
        Assert.Equal([100_000_000, 100_000_001], set.Options.Select(o => o.Value!.Value));
        Assert.Equal("#FF0000", set.Options[1].Color);
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_new_choice_needs_the_solution_prefix_and_a_display_name()
    {
        var wrongPrefix = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ChoiceApplySpec { Solution = "Core", Name = "fab_priority", DisplayName = "P" }));
        var noLabel = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ChoiceApplySpec { Solution = "Core", Name = "new_priority" }));

        Assert.Contains("new_", wrongPrefix.Problem.Message);
        Assert.Contains("displayName", noLabel.Problem.Message);
    }

    [Fact]
    public async Task Options_are_matched_by_label_and_only_differences_are_planned()
    {
        await world.ApplyAsync(Family, Priority(new() { Label = "Low" }, new() { Label = "High" }));

        var plan = await PlanAsync(Priority(
            new() { Label = "Low" },
            new() { Value = 100_000_001, Label = "Urgent", Color = "#AA0000" },
            new() { Label = "Medium" }));

        Assert.Equal(["updateOption", "addOption"], plan.Steps.Select(s => s.Op));
        Assert.Contains("label High → Urgent", plan.Steps[0].Detail);
        Assert.Contains("color none → #AA0000", plan.Steps[0].Detail);
        Assert.Equal("new_priority 100000002", plan.Steps[1].Target);
    }

    [Fact]
    public async Task Ordered_moves_listed_options_first_and_then_plans_nothing()
    {
        await world.ApplyAsync(Family, Priority(new() { Label = "Low" }, new() { Label = "Medium" }, new() { Label = "High" }));
        var spec = Priority(new() { Label = "High" }, new() { Label = "Low" });
        var ordered = new ChoiceApplySpec { Solution = "Core", Name = "new_priority", Ordered = true, Options = spec.Options };

        var result = await world.ApplyAsync(Family, ordered);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["High", "Low", "Medium"], world.Schema.GlobalChoices["new_priority"].Options.Select(o => o.Label.UserLocalizedLabel?.Label ?? o.Label.LocalizedLabels[0].Label));
        Assert.Empty((await PlanAsync(ordered)).Steps);
    }

    [Fact]
    public async Task A_managed_choice_that_is_not_customizable_is_blocked()
    {
        var set = new OptionSetMetadata { Name = "new_priority", IsGlobal = true, IsCustomizable = new BooleanManagedProperty(false) };
        world.Schema.GlobalChoices["new_priority"] = set;

        var plan = await PlanAsync(Priority(new ChoiceOption { Label = "Low" }));

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task A_bad_color_is_refused()
    {
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Priority(new ChoiceOption { Label = "Low", Color = "red" })));

        Assert.Contains("#1A2B3C", error.Problem.Message);
    }
}

public sealed class ViewPlannerTests
{
    private readonly RowWorld world = new();
    private static readonly IApplyFamily Family = new ApplyFamily<ViewApplySpec>(ViewPlanner.Family, new ViewPlanner());

    public ViewPlannerTests()
    {
        world.Schema.AddTable("new_project", primary: "new_name");
        world.Schema.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 20 });
        world.Schema.AddColumn("new_project", new IntegerAttributeMetadata { SchemaName = "new_Count" });
    }

    private Task<Plan> PlanAsync(ViewApplySpec spec) => new ViewPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private static ViewApplySpec Active() => new()
    {
        Solution = "Core",
        Table = "new_project",
        Name = "Active projects",
        Columns = [new() { Name = "new_name", Width = 200 }, new() { Name = "new_code" }],
        Filter = new() { Conditions = [new() { Column = "new_count", Operator = "gt", Value = "0" }] },
        Sort = [new() { Column = "new_name" }],
    };

    private Entity View(string name) => world.Table("savedquery").Single(v => (string)v["name"] == name);

    [Fact]
    public async Task A_new_public_view_writes_matching_fetch_and_layout_and_plans_nothing_after_apply()
    {
        var result = await world.ApplyAsync(Family, Active());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var view = View("Active projects");
        var fetch = XDocument.Parse((string)view["fetchxml"]);
        var layout = XDocument.Parse((string)view["layoutxml"]);
        var attributes = fetch.Descendants("attribute").Select(a => (string)a.Attribute("name")!).ToList();
        Assert.Contains("new_name", attributes);
        Assert.Contains("new_code", attributes);
        Assert.Equal(["new_name", "new_code"], layout.Descendants("cell").Select(c => (string)c.Attribute("name")!));
        Assert.Equal("200", (string?)layout.Descendants("cell").First().Attribute("width"));
        Assert.Single(fetch.Descendants("condition"), c => (string?)c.Attribute("attribute") == "new_count" && (string?)c.Attribute("operator") == "gt");
        Assert.Empty((await PlanAsync(Active())).Steps);
    }

    [Fact]
    public async Task Changing_columns_filter_and_sort_plans_one_update_that_names_each_change()
    {
        await world.ApplyAsync(Family, Active());
        var changed = new ViewApplySpec
        {
            Solution = "Core",
            Table = "new_project",
            Name = "Active projects",
            Columns = [new() { Name = "new_code" }],
            Filter = new() { Type = FilterType.Or, Conditions = [new() { Column = "new_code", Operator = "null" }] },
            Sort = [new() { Column = "new_code", Descending = true }],
        };

        var plan = await PlanAsync(changed);
        var result = await world.ApplyAsync(Family, changed);

        var step = Assert.Single(plan.Steps);
        Assert.Equal("updateView", step.Op);
        Assert.Contains("columns →", step.Detail);
        Assert.Contains("filter →", step.Detail);
        Assert.Contains("sort →", step.Detail);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty((await PlanAsync(changed)).Steps);
    }

    [Fact]
    public async Task The_quick_find_view_is_updated_but_never_created()
    {
        var spec = new ViewApplySpec { Solution = "Core", Table = "new_project", Type = ViewType.QuickFind, FindColumns = ["new_name", "new_code"] };

        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(spec));

        world.Add(new Entity("savedquery")
        {
            ["name"] = "Quick Find Active Projects",
            ["returnedtypecode"] = "new_project",
            ["querytype"] = 4,
            ["fetchxml"] = """<fetch><entity name="new_project"><attribute name="new_name"/><filter type="or" isquickfindfields="1"><condition attribute="new_name" operator="like" value="{0}"/></filter></entity></fetch>""",
            ["layoutxml"] = """<grid name="resultset" object="10000" jump="new_name" select="1" icon="1" preview="1"><row name="result" id="new_projectid"><cell name="new_name" width="300"/></row></grid>""",
        });
        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var fetch = XDocument.Parse((string)View("Quick Find Active Projects")["fetchxml"]);
        Assert.Equal(["new_name", "new_code"], fetch.Descendants("filter").Single(f => (string?)f.Attribute("isquickfindfields") == "1")
            .Elements("condition").Select(c => (string)c.Attribute("attribute")!));
    }

    [Fact]
    public async Task An_unknown_column_is_refused_with_its_name()
    {
        var spec = Active();
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ViewApplySpec
        {
            Solution = spec.Solution,
            Table = spec.Table,
            Name = spec.Name,
            Columns = [new() { Name = "new_missing" }],
        }));

        Assert.Contains("new_missing", error.Problem.Message);
    }

    [Fact]
    public async Task Find_columns_are_only_for_quick_find()
    {
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ViewApplySpec
        {
            Solution = "Core", Table = "new_project", Name = "Active projects", Columns = [new() { Name = "new_name" }], FindColumns = ["new_name"],
        }));

        Assert.Contains("quickFind", error.Problem.Message);
    }
}
