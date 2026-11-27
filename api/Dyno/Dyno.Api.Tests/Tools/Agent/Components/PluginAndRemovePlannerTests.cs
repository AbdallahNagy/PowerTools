using System.IO.Compression;
using System.Text;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Plugins;
using Dyno.Api.Tools.Agent.Components.Remove;
using Dyno.Api.Tools.Agent.Components.Shared;
using Dyno.Api.Tools.Agent.Kernel;
using Dyno.Api.Tools.PluginRegistration;
using Dyno.Api.Tools.SolutionLayers;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class PluginStepPlannerTests
{
    private readonly RowWorld world = new();
    private readonly Entity type;
    private static readonly IApplyFamily Family = new ApplyFamily<PluginStepApplySpec>(PluginStepPlanner.Family, new PluginStepPlanner());

    public PluginStepPlannerTests()
    {
        type = world.Add(new Entity("plugintype") { ["typename"] = "Contoso.Plugins.AccountPlugin" });
        var update = world.Add(new Entity("sdkmessage") { ["name"] = "Update" });
        var retrieve = world.Add(new Entity("sdkmessage") { ["name"] = "Retrieve" });
        world.Add(new Entity("sdkmessagefilter") { ["sdkmessageid"] = retrieve.ToEntityReference(), ["primaryobjecttypecode"] = "account" });
        world.Add(new Entity("sdkmessagefilter") { ["sdkmessageid"] = update.ToEntityReference(), ["primaryobjecttypecode"] = "account" });
    }

    private Task<Plan> PlanAsync(PluginStepApplySpec spec) => new PluginStepPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private static PluginStepApplySpec Spec(Action<StepDefinitionBuilder>? change = null)
    {
        var builder = new StepDefinitionBuilder();
        change?.Invoke(builder);
        return new PluginStepApplySpec { Solution = "Core", Steps = [builder.Build()] };
    }

    internal sealed class StepDefinitionBuilder
    {
        public StepStage Stage = StepStage.PostOperation;
        public StepMode? Mode;
        public string Message = "Update";
        public List<string>? Filtering = ["name", "Telephone1"];
        public List<ImageDefinition>? Images = [new() { Name = "pre", Type = ImageType.Pre, Attributes = ["name"] }];
        public bool? Enabled;

        public StepDefinition Build() => new()
        {
            Name = "Account update",
            PluginType = "Contoso.Plugins.AccountPlugin",
            Message = Message,
            Table = "account",
            Stage = Stage,
            Mode = Mode,
            FilteringAttributes = Filtering,
            Images = Images,
            Enabled = Enabled,
        };
    }

    private Entity Step => world.Table("sdkmessageprocessingstep").Single();

    [Fact]
    public async Task A_new_step_and_its_image_are_registered_in_the_solution_then_nothing_is_planned()
    {
        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["createStep", "createImage"], result.Steps.Select(s => s.Op));
        Assert.Equal(type.Id, Step.GetAttributeValue<EntityReference>("eventhandler").Id);
        Assert.Equal("name,telephone1", Step["filteringattributes"]);
        var image = world.Table("sdkmessageprocessingstepimage").Single();
        Assert.Equal("Target", image["messagepropertyname"]);
        Assert.Equal(Step.Id, image.GetAttributeValue<EntityReference>("sdkmessageprocessingstepid").Id);
        Assert.Contains(world.Writes.OfType<AddSolutionComponentRequest>(), r => r.ComponentId == Step.Id && r.ComponentType == ComponentKinds.StepType);
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task A_changed_stage_and_image_columns_plan_updates_only()
    {
        await world.ApplyAsync(Family, Spec());

        var plan = await PlanAsync(Spec(s =>
        {
            s.Stage = StepStage.PreOperation;
            s.Images = [new() { Name = "pre", Type = ImageType.Pre, Attributes = ["name", "telephone1"] }];
        }));

        Assert.Equal(["updateStep", "updateImage"], plan.Steps.Select(s => s.Op));
        Assert.Equal("stage → 20", plan.Steps[0].Detail);
    }

    [Fact]
    public async Task Enabled_false_disables_the_step_and_true_enables_it_again()
    {
        await world.ApplyAsync(Family, Spec());

        await world.ApplyAsync(Family, Spec(s => s.Enabled = false));
        var disabled = Step.GetAttributeValue<OptionSetValue>("statecode").Value;
        var enable = await PlanAsync(Spec());

        Assert.Equal(1, disabled);
        Assert.Equal("enableStep", Assert.Single(enable.Steps).Op);
    }

    [Fact]
    public async Task Rules_that_dataverse_enforces_are_refused_before_planning()
    {
        var async = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(s => { s.Mode = StepMode.Async; s.Stage = StepStage.PreOperation; })));
        var filtering = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(s => { s.Message = "Retrieve"; s.Images = null; })));
        var table = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new PluginStepApplySpec
        {
            Solution = "Core",
            Steps = [new() { Name = "x", PluginType = "Contoso.Plugins.AccountPlugin", Message = "Update", Table = "contact", Stage = StepStage.PostOperation }],
        }));

        Assert.Contains("postOperation", async.Problem.Message);
        Assert.Contains("filteringAttributes", filtering.Problem.Message);
        Assert.Contains("contact", table.Problem.Message);
    }
}

public sealed class PluginDeployPlannerTests : IDisposable
{
    private readonly RowWorld world = new();
    private readonly FakeInspector inspector = new();
    private readonly string folder = Directory.CreateTempSubdirectory("plugin-deploy-").FullName;

    public void Dispose() => Directory.Delete(folder, recursive: true);

    private Task<Plan> PlanAsync(string path, IsolationMode? isolation = null) =>
        new PluginDeployPlanner(inspector).PlanAsync(new PluginDeploySpec { Solution = "Core", Path = path, IsolationMode = isolation }, world.Context(), CancellationToken.None);

    private string Dll(byte[]? bytes = null)
    {
        var path = Path.Combine(folder, "Contoso.Plugins.dll");
        File.WriteAllBytes(path, bytes ?? [0x4D, 0x5A, 1, 2, 3]);
        return path;
    }

    private string Nupkg(string version)
    {
        var path = Path.Combine(folder, "Contoso.Plugins.nupkg");
        using (var zip = ZipFile.Open(path, ZipArchiveMode.Create))
        using (var writer = new StreamWriter(zip.CreateEntry("Contoso.Plugins.nuspec").Open(), Encoding.UTF8))
            writer.Write($"""<?xml version="1.0"?><package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd"><metadata><id>Contoso.Plugins</id><version>{version}</version></metadata></package>""");
        return path;
    }

    [Fact]
    public async Task A_new_assembly_is_registered_with_its_types()
    {
        var plan = await PlanAsync(Dll());

        var step = Assert.Single(plan.Steps);
        Assert.Equal("registerAssembly", step.Op);
        Assert.Contains("Contoso.Plugins.AccountPlugin", step.Detail);
        Assert.Contains("sandbox", step.Detail);
    }

    [Fact]
    public async Task Isolation_none_is_blocked_where_plugins_run_only_in_the_sandbox()
    {
        world.Features.Add(PluginDeployPlanner.PackageTable);

        var plan = await PlanAsync(Dll(), IsolationMode.None);

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task The_same_file_already_in_the_solution_plans_nothing_and_a_new_build_updates()
    {
        byte[] bytes = [0x4D, 0x5A, 9, 9];
        var assembly = world.Add(new Entity("pluginassembly") { ["name"] = "Contoso.Plugins", ["version"] = "1.2.3.4", ["content"] = Convert.ToBase64String(bytes) });
        world.Add(new Entity("plugintype") { ["typename"] = "Contoso.Plugins.AccountPlugin", ["pluginassemblyid"] = assembly.ToEntityReference() });
        world.Add(new Entity("solutioncomponent") { ["solutionid"] = world.CoreSolutionId, ["objectid"] = assembly.Id, ["componenttype"] = new OptionSetValue(91) });

        var same = await PlanAsync(Dll(bytes));
        var changed = await PlanAsync(Dll([0x4D, 0x5A, 7]));

        Assert.Empty(same.Steps);
        Assert.Equal("updateAssembly", Assert.Single(changed.Steps).Op);
    }

    [Fact]
    public async Task A_build_that_drops_a_registered_type_is_blocked()
    {
        var assembly = world.Add(new Entity("pluginassembly") { ["name"] = "Contoso.Plugins", ["content"] = Convert.ToBase64String([1]) });
        world.Add(new Entity("plugintype") { ["typename"] = "Contoso.Plugins.OldPlugin", ["pluginassemblyid"] = assembly.ToEntityReference() });

        var plan = await PlanAsync(Dll());

        var step = plan.Steps.Single(s => s.Op == "updateAssembly");
        Assert.Equal(PlanStepKind.Blocked, step.Kind);
        Assert.Contains("Contoso.Plugins.OldPlugin", step.Reason);
    }

    [Fact]
    public async Task A_package_is_unsupported_without_plugin_packages_and_created_with_the_prefix_where_they_exist()
    {
        var path = Nupkg("1.0.0");

        var without = await PlanAsync(path);
        world.Features.Add(PluginDeployPlanner.PackageTable);
        var with = await PlanAsync(path);

        Assert.Equal(PlanStepKind.Unsupported, Assert.Single(without.Steps).Kind);
        Assert.NotNull(without.Steps[0].Route);
        var create = (CreateRequest)Assert.Single(with.Steps).Request!;
        Assert.Equal("new_Contoso.Plugins", create.Target["uniquename"]);
    }

    [Fact]
    public async Task A_package_with_the_same_version_plans_nothing_and_says_why()
    {
        world.Features.Add(PluginDeployPlanner.PackageTable);
        world.Add(new Entity("pluginpackage") { ["name"] = "Contoso.Plugins", ["version"] = "1.0.0" });

        var plan = await PlanAsync(Nupkg("1.0.0"));

        Assert.Empty(plan.Steps);
        Assert.Contains("Raise the package version", Assert.Single(plan.Warnings));
    }

    [Fact]
    public async Task A_relative_path_or_another_extension_is_refused()
    {
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync("Contoso.Plugins.dll"));
        var text = Path.Combine(folder, "notes.txt");
        await File.WriteAllTextAsync(text, "x");
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(text));
    }
}

public sealed class RemovePlannerTests
{
    private readonly RowWorld world = new();
    private static readonly IApplyFamily Family = new ApplyFamily<RemoveSpec>(RemovePlanner.Family, new RemovePlanner(new SolutionLayersCache()));

    private Task<Plan> PlanAsync(RemoveSpec spec) => new RemovePlanner(new SolutionLayersCache()).PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Resource() => world.Add(new Entity("webresource") { ["name"] = "new_/main.js", ["ismanaged"] = false });

    [Fact]
    public async Task A_component_is_deleted_and_then_a_second_plan_only_warns()
    {
        var resource = Resource();
        var spec = new RemoveSpec { Kind = RemoveKind.WebResource, Name = "new_/main.js" };

        var plan = await PlanAsync(spec);
        var result = await world.ApplyAsync(Family, spec);
        var again = await PlanAsync(spec);

        var step = Assert.Single(plan.Steps);
        Assert.Equal(PlanEffect.Destructive, step.Effect);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.DoesNotContain(world.Table("webresource"), r => r.Id == resource.Id);
        Assert.Empty(again.Steps);
        Assert.Contains("not found", Assert.Single(again.Warnings));
    }

    [Fact]
    public async Task Dependents_block_the_delete_and_name_what_depends()
    {
        var resource = Resource();
        world.Dependents[resource.Id] = 2;

        var plan = await PlanAsync(new RemoveSpec { Kind = RemoveKind.WebResource, Name = "new_/main.js" });

        var step = Assert.Single(plan.Steps);
        Assert.Equal(PlanStepKind.Blocked, step.Kind);
        Assert.Contains("2 component(s) depend", step.Reason);
        Assert.Equal(PlanEffect.Destructive, step.Effect);
    }

    [Fact]
    public async Task A_dependent_is_named_by_kind_and_name_not_by_type_number_and_id()
    {
        var resource = Resource();
        var form = new Entity("systemform", Guid.NewGuid()) { ["name"] = "Information", ["objecttypecode"] = "account" };
        world.Add(form);
        world.DependentComponents[resource.Id] = [(60, form.Id)];

        var plan = await PlanAsync(new RemoveSpec { Kind = RemoveKind.WebResource, Name = "new_/main.js" });

        var reason = Assert.Single(plan.Steps).Reason;
        Assert.Contains("form \"Information\" on account", reason);
        Assert.DoesNotContain(form.Id.ToString("D"), reason);
    }

    [Fact]
    public async Task A_managed_component_is_blocked()
    {
        world.Add(new Entity("webresource") { ["name"] = "new_/managed.js", ["ismanaged"] = true });

        var plan = await PlanAsync(new RemoveSpec { Kind = RemoveKind.WebResource, Name = "new_/managed.js" });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task An_active_process_is_deactivated_before_it_is_deleted()
    {
        world.Add(new Entity("workflow") { ["name"] = "Notify owner", ["type"] = new OptionSetValue(1), ["category"] = new OptionSetValue(0), ["statecode"] = new OptionSetValue(1) });

        var result = await world.ApplyAsync(Family, new RemoveSpec { Kind = RemoveKind.Process, Name = "Notify owner" });

        Assert.Equal(["deactivate", "delete"], result.Steps.Select(s => s.Op));
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(world.Table("workflow"));
    }

    [Fact]
    public async Task An_environment_variable_loses_its_values_first()
    {
        var definition = world.Add(new Entity("environmentvariabledefinition") { ["schemaname"] = "new_ApiUrl" });
        world.Add(new Entity("environmentvariablevalue") { ["environmentvariabledefinitionid"] = definition.ToEntityReference(), ["value"] = "x" });

        var result = await world.ApplyAsync(Family, new RemoveSpec { Kind = RemoveKind.EnvVar, Name = "new_ApiUrl" });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(world.Table("environmentvariablevalue"));
        Assert.Empty(world.Table("environmentvariabledefinition"));
    }

    [Fact]
    public async Task A_global_choice_option_is_deleted_by_value()
    {
        world.Schema.GlobalChoices["new_priority"] = SchemaWorld.Options((1, "Low"), (2, "High"));
        world.Schema.GlobalChoices["new_priority"].Name = "new_priority";

        var result = await world.ApplyAsync(Family, new RemoveSpec { Kind = RemoveKind.ChoiceOption, Name = "new_priority", Value = 2 });
        var again = await PlanAsync(new RemoveSpec { Kind = RemoveKind.ChoiceOption, Name = "new_priority", Value = 2 });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal([1], world.Schema.GlobalChoices["new_priority"].Options.Select(o => o.Value!.Value));
        Assert.Empty(again.Steps);
    }

    [Fact]
    public async Task A_solution_component_leaves_the_solution_but_stays_in_the_environment()
    {
        var resource = Resource();
        world.Add(new Entity("solutioncomponent") { ["solutionid"] = world.CoreSolutionId, ["objectid"] = resource.Id, ["componenttype"] = new OptionSetValue(61) });
        var spec = new RemoveSpec { Kind = RemoveKind.SolutionComponent, Name = "new_/main.js", ComponentKind = ComponentKind.WebResource, Solution = "Core" };

        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(world.Table("solutioncomponent"));
        Assert.Single(world.Table("webresource"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_managed_solution_is_blocked_and_an_unmanaged_one_is_deleted()
    {
        var managed = await PlanAsync(new RemoveSpec { Kind = RemoveKind.Solution, Name = "Managed1" });
        var result = await world.ApplyAsync(Family, new RemoveSpec { Kind = RemoveKind.Solution, Name = "Core" });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(managed.Steps).Kind);
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.DoesNotContain(world.Table("solution"), s => s.GetAttributeValue<string>("uniquename") == "Core");
    }

    [Fact]
    public async Task Removing_the_active_layer_is_unsupported_without_solution_layers()
    {
        Resource();

        var plan = await PlanAsync(new RemoveSpec { Kind = RemoveKind.ActiveLayer, Name = "new_/main.js", ComponentKind = ComponentKind.WebResource });

        var step = Assert.Single(plan.Steps);
        Assert.Equal(PlanStepKind.Unsupported, step.Kind);
        Assert.Contains("solution_import", step.Route);
    }
}
