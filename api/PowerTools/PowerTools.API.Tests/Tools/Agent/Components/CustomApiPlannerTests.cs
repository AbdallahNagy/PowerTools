using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.CustomApis;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class CustomApiPlannerTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<CustomApiApplySpec>(CustomApiPlanner.Family, new CustomApiPlanner());
    private readonly RowWorld world = new();
    private readonly Entity pluginType;

    public CustomApiPlannerTests()
    {
        world.Features.Add("customapi");
        world.Schema.AddTable("account", "Account", "Accounts", primary: "name");
        pluginType = world.Add(new Entity("plugintype") { ["typename"] = "Contoso.Plugins.CloseAccount" });
    }

    private static CustomApiApplySpec Spec(bool? isFunction = null, CustomApiType reasonType = CustomApiType.String, string? display = null) => new()
    {
        Solution = "Core",
        UniqueName = "new_CloseAccount",
        DisplayName = display,
        Binding = CustomApiBinding.Entity,
        BoundTable = "account",
        IsFunction = isFunction,
        PluginType = "Contoso.Plugins.CloseAccount",
        RequestParameters = [new CustomApiField { UniqueName = "Reason", Type = reasonType, Optional = true }],
        ResponseProperties = [new CustomApiField { UniqueName = "Closed", Type = CustomApiType.Boolean }],
    };

    private Task<Plan> PlanAsync(CustomApiApplySpec spec) => new CustomApiPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Api => world.Table("customapi").Single();

    [Fact]
    public async Task Creates_the_api_its_parameter_and_property_and_a_second_run_plans_nothing()
    {
        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["createCustomApi", "createParameter", "createProperty"], result.Steps.Select(s => s.Op));
        Assert.Equal(1, Api.GetAttributeValue<OptionSetValue>("bindingtype").Value);
        Assert.Equal("account", Api["boundentitylogicalname"]);
        Assert.Equal(pluginType.Id, Api.GetAttributeValue<EntityReference>("plugintypeid").Id);
        var parameter = world.Table("customapirequestparameter").Single();
        Assert.Equal("new_CloseAccount.Reason", parameter["name"]);
        Assert.Equal(true, parameter["isoptional"]);
        Assert.Equal(Api.Id, parameter.GetAttributeValue<EntityReference>("customapiid").Id);
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task A_display_name_is_an_update_but_a_fixed_field_recreates_the_api_as_a_destructive_step()
    {
        await world.ApplyAsync(Family, Spec());

        var rename = await PlanAsync(Spec(display: "Close account"));
        Assert.Equal("updateCustomApi", Assert.Single(rename.Steps).Op);
        Assert.Equal(PlanEffect.Change, rename.Effect);

        var recreate = await PlanAsync(Spec(isFunction: true));
        Assert.Equal(PlanEffect.Destructive, recreate.Effect);
        Assert.Equal(["deleteCustomApi", "createCustomApi", "createParameter", "createProperty"], recreate.Steps.Select(s => s.Op));
        Assert.Contains("function → True", recreate.Steps[0].Detail);
    }

    [Fact]
    public async Task Recreating_the_api_keeps_the_parameters_and_properties_the_spec_leaves_out()
    {
        await world.ApplyAsync(Family, Spec());
        var spec = Spec(isFunction: true);
        spec = new CustomApiApplySpec
        {
            Solution = spec.Solution,
            UniqueName = spec.UniqueName,
            Binding = spec.Binding,
            BoundTable = spec.BoundTable,
            IsFunction = true,
            PluginType = spec.PluginType,
        };

        var plan = await PlanAsync(spec);

        Assert.Equal(["deleteCustomApi", "createCustomApi", "createParameter", "createProperty"], plan.Steps.Select(s => s.Op));
        Assert.Contains("created again as they are: Reason", plan.Steps[0].Detail);
        Assert.Contains("optional", plan.Steps[2].Detail);
        var result = await world.ApplyAsync(Family, spec);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var parameter = world.Table("customapirequestparameter").Single(p => p.GetAttributeValue<EntityReference>("customapiid").Id == Api.Id);
        Assert.Equal(true, parameter["isoptional"]);
    }

    [Fact]
    public async Task A_parameter_type_change_recreates_only_the_parameter()
    {
        await world.ApplyAsync(Family, Spec());

        var plan = await PlanAsync(Spec(reasonType: CustomApiType.Integer));

        Assert.Equal(["deleteParameter", "createParameter"], plan.Steps.Select(s => s.Op));
        Assert.Equal(PlanEffect.Destructive, plan.Steps[0].Effect);
        await world.ApplyAsync(Family, Spec(reasonType: CustomApiType.Integer));
        Assert.Equal(7, world.Table("customapirequestparameter").Single().GetAttributeValue<OptionSetValue>("type").Value);
        Assert.Empty((await PlanAsync(Spec(reasonType: CustomApiType.Integer))).Steps);
    }

    [Fact]
    public async Task Without_custom_apis_the_plan_is_unsupported_and_names_the_route()
    {
        world.Features.Remove("customapi");

        var step = Assert.Single((await PlanAsync(Spec())).Steps);

        Assert.Equal(PlanStepKind.Unsupported, step.Kind);
        Assert.Contains("solution_import", step.Route);
    }

    [Fact]
    public async Task A_missing_plugin_type_or_prefix_is_refused()
    {
        var noType = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new CustomApiApplySpec { Solution = "Core", UniqueName = "new_X", PluginType = "Nope" }));
        Assert.Contains("plugin_deploy", noType.Problem.Message);
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new CustomApiApplySpec { Solution = "Core", UniqueName = "other_X" }));
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new CustomApiApplySpec { Solution = "Core", UniqueName = "new_X", Binding = CustomApiBinding.Entity }));
    }

    [Fact]
    public async Task Parameters_left_out_are_kept_with_a_warning()
    {
        await world.ApplyAsync(Family, Spec());

        var plan = await PlanAsync(new CustomApiApplySpec { Solution = "Core", UniqueName = "new_CloseAccount", RequestParameters = [] });

        Assert.Empty(plan.Steps);
        Assert.Contains(plan.Warnings, w => w.Contains("Reason"));
        Assert.DoesNotContain(world.Writes, r => r is DeleteRequest);
    }
}
