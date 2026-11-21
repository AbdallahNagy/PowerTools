using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Config;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Components.Solutions;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class SolutionPlannerTests
{
    private readonly RowWorld world = new();
    private static readonly IApplyFamily Family = new ApplyFamily<SolutionApplySpec>(SolutionPlanner.Family, new SolutionPlanner());

    private Task<Plan> PlanAsync(SolutionApplySpec spec) => new SolutionPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Solution(string name) => world.Table("solution").Single(s => s.GetAttributeValue<string>("uniquename") == name);

    [Fact]
    public async Task A_new_publisher_and_solution_are_created_in_order_and_a_second_plan_is_empty()
    {
        var spec = new SolutionApplySpec
        {
            Publisher = new() { UniqueName = "litware", DisplayName = "Litware", Prefix = "LIT", OptionValuePrefix = 30000 },
            Solution = new() { UniqueName = "Sales", DisplayName = "Sales", Publisher = "litware" },
        };

        var plan = await PlanAsync(spec);
        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(["createPublisher", "createSolution"], plan.Steps.Select(s => s.Op));
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var publisher = world.Table("publisher").Single(p => p.GetAttributeValue<string>("uniquename") == "litware");
        Assert.Equal("lit", publisher["customizationprefix"]);
        var solution = Solution("Sales");
        Assert.Equal(publisher.Id, solution.GetAttributeValue<EntityReference>("publisherid").Id);
        Assert.Equal("1.0.0.0", solution["version"]);
        Assert.Equal(solution.Id.ToString("D"), Assert.Single(result.Steps[1].Ids!));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task An_existing_solution_only_plans_what_differs_and_cannot_change_publisher()
    {
        world.Row("solution", world.CoreSolutionId)["version"] = "1.0.0.0";

        var plan = await PlanAsync(new SolutionApplySpec { Solution = new() { UniqueName = "Core", Version = "1.1.0.0", Publisher = "fabrikam" } });

        Assert.Equal(["updateSolution", "updateSolution"], plan.Steps.Select(s => s.Op));
        Assert.Equal(PlanStepKind.Blocked, plan.Steps[0].Kind);
        Assert.Contains("version 1.0.0.0 → 1.1.0.0", plan.Steps[1].Detail);
    }

    [Fact]
    public async Task A_managed_solution_is_blocked()
    {
        var plan = await PlanAsync(new SolutionApplySpec { Solution = new() { UniqueName = "Managed1", Version = "2.0.0.0" } });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task Components_are_added_once_and_a_missing_one_is_blocked()
    {
        var resource = world.Add(new Entity("webresource") { ["name"] = "new_/scripts/main.js", ["ismanaged"] = false });
        var spec = new SolutionApplySpec
        {
            Solution = new() { UniqueName = "Core" },
            Components =
            [
                new() { Kind = ComponentKind.WebResource, Name = "new_/scripts/main.js" },
                new() { Kind = ComponentKind.WebResource, Name = "new_/scripts/missing.js" },
            ],
        };

        var plan = await PlanAsync(spec);
        await world.ApplyAsync(Family, new SolutionApplySpec { Solution = spec.Solution, Components = [spec.Components[0]] });
        var again = await PlanAsync(spec);

        Assert.Equal(["addComponent", "addComponent"], plan.Steps.Select(s => s.Op));
        Assert.Equal(PlanStepKind.Run, plan.Steps[0].Kind);
        Assert.Equal(PlanStepKind.Blocked, plan.Steps[1].Kind);
        var added = Assert.Single(world.Writes.OfType<AddSolutionComponentRequest>());
        Assert.Equal(resource.Id, added.ComponentId);
        Assert.Equal(ComponentKinds.WebResourceType, added.ComponentType);
        Assert.Equal(PlanStepKind.Blocked, Assert.Single(again.Steps).Kind);
    }

    [Fact]
    public async Task A_patch_is_created_once_and_rolling_up_merges_and_deletes_the_patches()
    {
        var patch = new SolutionApplySpec { Solution = new() { UniqueName = "Core" }, Patch = new() { Version = "1.0.1.0" } };

        var created = await world.ApplyAsync(Family, patch);
        var again = await PlanAsync(patch);

        Assert.Equal(ApplyOutcome.Applied, created.Outcome);
        Assert.Single(world.Table("solution"), s => s.GetAttributeValue<EntityReference>("parentsolutionid")?.Id == world.CoreSolutionId);
        Assert.Empty(again.Steps);

        var rollUp = new SolutionApplySpec { Solution = new() { UniqueName = "Core" }, RollUp = new() { Version = "1.1.0.0" } };
        var plan = await PlanAsync(rollUp);
        var result = await world.ApplyAsync(Family, rollUp);

        Assert.Equal(PlanEffect.Destructive, Assert.Single(plan.Steps).Effect);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.DoesNotContain(world.Table("solution"), s => s.GetAttributeValue<EntityReference>("parentsolutionid") is not null);
        Assert.Equal("1.1.0.0", Solution("Core")["version"]);
    }

    [Fact]
    public async Task Microsoft_publisher_and_a_bad_version_are_refused()
    {
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new SolutionApplySpec
        {
            Publisher = new() { UniqueName = "MicrosoftCorporation", DisplayName = "x" },
            Solution = new() { UniqueName = "Core" },
        }));
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new SolutionApplySpec { Solution = new() { UniqueName = "Core", Version = "1.0" } }));
    }
}

public sealed class ConfigPlannerTests
{
    private readonly RowWorld world = new();
    private static readonly IApplyFamily Family = new ApplyFamily<ConfigApplySpec>(ConfigPlanner.Family, new ConfigPlanner());

    private Task<Plan> PlanAsync(ConfigApplySpec spec) => new ConfigPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private static ConfigApplySpec ApiUrl(string value, string? defaultValue = "https://default") => new()
    {
        Solution = "Core",
        EnvironmentVariables = [new() { SchemaName = "new_ApiUrl", DisplayName = "API URL", DefaultValue = defaultValue, Value = value }],
    };

    [Fact]
    public async Task A_new_variable_and_its_value_are_created_then_nothing_is_planned()
    {
        var result = await world.ApplyAsync(Family, ApiUrl("https://test"));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["createVariable", "createValue"], result.Steps.Select(s => s.Op));
        var definition = Assert.Single(world.Table("environmentvariabledefinition"));
        Assert.Equal(100000000, definition.GetAttributeValue<OptionSetValue>("type").Value);
        var value = Assert.Single(world.Table("environmentvariablevalue"));
        Assert.Equal("https://test", value["value"]);
        Assert.Equal(definition.Id, value.GetAttributeValue<EntityReference>("environmentvariabledefinitionid").Id);
        Assert.Empty((await PlanAsync(ApiUrl("https://test"))).Steps);
    }

    [Fact]
    public async Task A_changed_value_and_default_update_in_place()
    {
        await world.ApplyAsync(Family, ApiUrl("https://test"));

        var plan = await PlanAsync(ApiUrl("https://prod", "https://new-default"));

        Assert.Equal(["updateVariable", "updateValue"], plan.Steps.Select(s => s.Op));
        Assert.Contains("value https://test → https://prod", plan.Steps[1].Detail);
    }

    [Fact]
    public async Task The_type_of_a_variable_cannot_change()
    {
        await world.ApplyAsync(Family, ApiUrl("https://test"));

        var plan = await PlanAsync(new ConfigApplySpec { Solution = "Core", EnvironmentVariables = [new() { SchemaName = "new_ApiUrl", Type = EnvVarType.Number }] });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task A_name_without_the_publisher_prefix_is_refused()
    {
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ConfigApplySpec
        {
            Solution = "Core",
            EnvironmentVariables = [new() { SchemaName = "fab_ApiUrl", DisplayName = "API URL" }],
        }));
    }

    [Fact]
    public async Task Connection_references_are_unsupported_where_the_table_is_missing_and_created_where_it_exists()
    {
        var spec = new ConfigApplySpec
        {
            Solution = "Core",
            ConnectionReferences = [new() { LogicalName = "new_sharepoint", Connector = "shared_sharepointonline" }],
        };

        var without = await PlanAsync(spec);
        world.Features.Add(ConfigPlanner.ConnectionReferenceTable);
        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(PlanStepKind.Unsupported, Assert.Single(without.Steps).Kind);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal("/providers/Microsoft.PowerApps/apis/shared_sharepointonline", Assert.Single(world.Table("connectionreference"))["connectorid"]);
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task The_connector_of_a_reference_cannot_change()
    {
        world.Features.Add(ConfigPlanner.ConnectionReferenceTable);
        world.Add(new Entity("connectionreference") { ["connectionreferencelogicalname"] = "new_sharepoint", ["connectorid"] = "/providers/Microsoft.PowerApps/apis/shared_sql" });

        var plan = await PlanAsync(new ConfigApplySpec
        {
            Solution = "Core",
            ConnectionReferences = [new() { LogicalName = "new_sharepoint", Connector = "shared_sharepointonline" }],
        });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }
}
