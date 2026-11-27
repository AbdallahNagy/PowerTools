using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Forms;
using Dyno.Api.Tools.Agent.Components.Inspect;
using Dyno.Api.Tools.Agent.Components.Plugins;
using Dyno.Api.Tools.Agent.Components.Views;
using Dyno.Api.Tools.Agent.Kernel;
using Dyno.Api.Tools.SolutionLayers;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

/// <summary>The inspectors describe components in the shapes the apply tools take, so a description sent back plans nothing.</summary>
public sealed class UiAndSolutionInspectorTests
{
    private readonly RowWorld world = new();

    private UiInspector Ui => new(world, world.Capabilities());

    private SolutionInspector Solutions => new(world, world.Capabilities(), new SolutionLayersCache(), "test");

    [Fact]
    public async Task A_form_lists_its_tabs_sections_fields_and_subgrids_by_the_names_form_apply_takes()
    {
        world.Schema.AddTable("account", "Account", "Accounts", primary: "name");
        world.Add(new Entity("systemform") { ["name"] = "Information", ["objecttypecode"] = "account", ["type"] = new OptionSetValue(2), ["formxml"] = AgentFormXmlTests.Form });

        var result = await Ui.InspectAsync(new InspectBody { Kind = "form", Table = "account", Name = "Information" }, CancellationToken.None);

        var form = Assert.IsType<FormDescription>(result.Value);
        Assert.Equal("main", form.Type);
        Assert.Equal(["general", "details_tab"], form.Tabs.Select(t => t.Name));
        var summary = form.Tabs[0].Sections.Single(s => s.Name == "summary");
        Assert.Equal("Summary", summary.Label);
        Assert.Equal("name", Assert.Single(summary.Fields).Column);
    }

    [Fact]
    public async Task A_list_cut_to_top_reports_the_total_of_every_match_not_the_page_size()
    {
        foreach (var name in new[] { "new_A", "new_B", "new_C" })
            world.Add(new Entity("environmentvariabledefinition") { ["schemaname"] = name, ["type"] = new OptionSetValue(100000000) });

        var cut = Assert.IsType<InspectListDto>((await Solutions.InspectAsync(new InspectBody { Kind = "envvar", Top = 2 }, CancellationToken.None)).Value);
        var all = Assert.IsType<InspectListDto>((await Solutions.InspectAsync(new InspectBody { Kind = "envvar" }, CancellationToken.None)).Value);

        Assert.Equal((3, 2, true), (cut.Total, cut.Items.Count, cut.Truncated));
        Assert.Equal((3, 3, false), (all.Total, all.Items.Count, all.Truncated));
    }

    [Fact]
    public async Task A_view_described_and_sent_back_to_view_apply_plans_nothing()
    {
        world.Schema.AddTable("new_project", primary: "new_name");
        world.Schema.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 20 });
        var family = new ApplyFamily<ViewApplySpec>(ViewPlanner.Family, new ViewPlanner());
        await world.ApplyAsync(family, new ViewApplySpec
        {
            Solution = "Core",
            Table = "new_project",
            Name = "Coded",
            Columns = [new() { Name = "new_name" }, new() { Name = "new_code", Width = 90 }],
            Filter = new() { Conditions = [new() { Column = "new_code", Operator = "not-null" }] },
            Sort = [new() { Column = "new_code", Descending = true }],
        });

        var described = Assert.IsType<ViewApplySpec>((await Ui.InspectAsync(new InspectBody { Kind = "view", Table = "new_project", Name = "Coded" }, CancellationToken.None)).Value);
        var again = await new ViewPlanner().PlanAsync(new ViewApplySpec
        {
            Solution = "Core",
            Table = described.Table,
            Type = described.Type,
            Name = described.Name,
            Columns = described.Columns,
            Filter = described.Filter,
            Sort = described.Sort,
        }, world.Context(), CancellationToken.None);

        Assert.Equal(90, described.Columns!.Single(c => c.Name == "new_code").Width);
        Assert.Empty(again.Steps);
    }

    [Fact]
    public async Task Commands_are_not_supported_where_the_environment_has_no_modern_commands()
    {
        var result = await Ui.InspectAsync(new InspectBody { Kind = "command" }, CancellationToken.None);

        Assert.Equal(ApplyResult.NotSupportedCode, result.Problem!.Code);
    }

    [Fact]
    public async Task A_text_web_resource_comes_back_with_its_content()
    {
        world.Add(new Entity("webresource")
        {
            ["name"] = "new_/main.js",
            ["webresourcetype"] = new OptionSetValue(3),
            ["content"] = Convert.ToBase64String("alert(1);"u8.ToArray()),
        });

        var result = await Ui.InspectAsync(new InspectBody { Kind = "webresource", Name = "new_/main.js" }, CancellationToken.None);

        var row = Assert.IsType<Dictionary<string, object?>>(result.Value);
        Assert.Equal("alert(1);", row["content"]);
    }

    [Fact]
    public async Task A_plugin_step_described_and_sent_back_to_plugin_step_apply_plans_nothing()
    {
        world.Add(new Entity("plugintype") { ["typename"] = "Contoso.Plugins.AccountPlugin" });
        var update = world.Add(new Entity("sdkmessage") { ["name"] = "Update" });
        world.Add(new Entity("sdkmessagefilter") { ["sdkmessageid"] = update.ToEntityReference(), ["primaryobjecttypecode"] = "account" });
        var family = new ApplyFamily<PluginStepApplySpec>(PluginStepPlanner.Family, new PluginStepPlanner());
        await world.ApplyAsync(family, new PluginStepApplySpec
        {
            Solution = "Core",
            Steps =
            [
                new()
                {
                    Name = "Account update", PluginType = "Contoso.Plugins.AccountPlugin", Message = "Update", Table = "account",
                    Stage = StepStage.PreOperation, FilteringAttributes = ["name"], Images = [new() { Name = "pre", Type = ImageType.Pre }],
                },
            ],
        });

        var described = Assert.IsType<StepDefinition>((await Solutions.InspectAsync(new InspectBody { Kind = "pluginstep", Name = "Account update" }, CancellationToken.None)).Value);
        var again = await new PluginStepPlanner().PlanAsync(new PluginStepApplySpec { Solution = "Core", Steps = [described] }, world.Context(), CancellationToken.None);

        Assert.Equal("account", described.Table);
        Assert.Equal(StepStage.PreOperation, described.Stage);
        Assert.Empty(again.Steps);
    }

    [Fact]
    public async Task An_environment_variable_shows_its_value_but_a_secret_does_not()
    {
        var plain = world.Add(new Entity("environmentvariabledefinition") { ["schemaname"] = "new_Url", ["type"] = new OptionSetValue(100000000) });
        var secret = world.Add(new Entity("environmentvariabledefinition") { ["schemaname"] = "new_Key", ["type"] = new OptionSetValue(100000005) });
        world.Add(new Entity("environmentvariablevalue") { ["environmentvariabledefinitionid"] = plain.ToEntityReference(), ["value"] = "https://x" });
        world.Add(new Entity("environmentvariablevalue") { ["environmentvariabledefinitionid"] = secret.ToEntityReference(), ["value"] = "vault-ref" });

        var url = Assert.IsType<Dictionary<string, object?>>(Assert.Single(await EnvVars("new_Url")));
        var key = Assert.IsType<Dictionary<string, object?>>(Assert.Single(await EnvVars("new_Key")));

        Assert.Equal("https://x", url["value"]);
        Assert.Null(key["value"]);
    }

    [Fact]
    public async Task An_unknown_kind_names_the_kinds()
    {
        var result = await Solutions.InspectAsync(new InspectBody { Kind = "widget" }, CancellationToken.None);

        Assert.Contains("pluginstep", result.Problem!.Message);
    }

    private async Task<IEnumerable<object>> EnvVars(string name)
    {
        var value = (await Solutions.InspectAsync(new InspectBody { Kind = "envvar", Name = name }, CancellationToken.None)).Value;
        return value switch
        {
            IEnumerable<object> many => many,
            InspectListDto list => list.Items,
            var one => [one!],
        };
    }
}
