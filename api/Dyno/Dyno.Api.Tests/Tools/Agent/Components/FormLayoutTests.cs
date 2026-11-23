using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Forms;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class FormLayoutTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<FormApplySpec>(FormPlanner.Family, new FormPlanner());
    private readonly RowWorld world = new();
    private readonly Entity form;

    public FormLayoutTests()
    {
        world.Schema.AddTable("account", "Account", "Accounts", primary: "name");
        world.Schema.AddColumn("account", new StringAttributeMetadata { SchemaName = "telephone1", DisplayName = new Label("Phone", SchemaWorld.English) });
        world.Schema.AddColumn("account", new StringAttributeMetadata { SchemaName = "websiteurl" });
        world.Schema.AddColumn("account", new MemoAttributeMetadata { SchemaName = "description", DisplayName = new Label("Description", SchemaWorld.English) });
        form = world.Add(new Entity("systemform")
        {
            ["name"] = "Information",
            ["objecttypecode"] = "account",
            ["type"] = new OptionSetValue(2),
            ["formxml"] = AgentFormXmlTests.Form,
        });
        world.Add(new Entity("webresource") { ["name"] = "new_/account.js", ["webresourcetype"] = new OptionSetValue(3) });
        world.Add(new Entity("savedquery") { ["name"] = "Active Accounts", ["returnedtypecode"] = "account", ["querytype"] = 0, ["isdefault"] = true });
        world.Add(new Entity("savedqueryvisualization") { ["name"] = "Accounts by Owner", ["primaryentitytypecode"] = "account" });
    }

    private Task<Plan> PlanAsync(FormApplySpec spec) => new FormPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private XDocument Xml(Guid id) => XDocument.Parse((string)world.Row("systemform", id)["formxml"]);

    private static FormLayout Layout(params LayoutTab[] tabs) => new() { Tabs = [.. tabs] };

    private static IEnumerable<string?> Controls(XElement section) =>
        section.Descendants("control").Select(c => (string?)c.Attribute("datafieldname") ?? (string?)c.Attribute("id"));

    [Fact]
    public async Task A_whole_layout_reuses_existing_cells_drops_what_is_left_out_and_plans_nothing_the_second_time()
    {
        var spec = new FormApplySpec
        {
            Solution = "Core",
            Table = "account",
            Form = "Information",
            Layout = Layout(new LayoutTab
            {
                Name = "general",
                Sections =
                [
                    new LayoutSection { Name = "summary", Fields = ["name", "telephone1"] },
                    new LayoutSection { Name = "more", Label = "More", Column = 2, Fields = ["description"] },
                ],
            }),
        };

        var plan = await PlanAsync(spec);
        var step = Assert.Single(plan.Steps);
        Assert.Contains("add description", step.Detail);
        Assert.Contains("take off websiteurl", step.Detail);
        await world.ApplyAsync(Family, spec);

        var xml = Xml(form.Id);
        var tab = Assert.Single(xml.Descendants("tab"));
        Assert.Equal(["50%", "50%"], tab.Descendants("column").Select(c => (string?)c.Attribute("width")));
        var summary = xml.Descendants("section").Single(s => (string?)s.Attribute("name") == "summary");
        Assert.Equal(["name", "telephone1"], Controls(summary));
        Assert.Equal("{33333333-3333-3333-3333-333333333333}", (string?)summary.Descendants("cell").First().Attribute("id"));
        Assert.Equal("{22222222-2222-2222-2222-222222222222}", (string?)summary.Attribute("id"));
        Assert.Equal(AgentFormXml.ClassId("memo"), (string?)xml.Descendants("control").Single(c => (string?)c.Attribute("id") == "description").Attribute("classid"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_layout_for_a_form_that_does_not_exist_creates_it()
    {
        var spec = new FormApplySpec
        {
            Solution = "Core",
            Table = "account",
            Form = "Quick account",
            FormType = FormKind.QuickCreate,
            Layout = Layout(new LayoutTab { Name = "tab_1", Sections = [new LayoutSection { Name = "main", Fields = ["name", "telephone1"] }] }),
        };

        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var created = world.Table("systemform").Single(f => (string)f["name"] == "Quick account");
        Assert.Equal(7, created.GetAttributeValue<OptionSetValue>("type").Value);
        Assert.Equal(["name", "telephone1"], Controls(Xml(created.Id).Descendants("section").Single()));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Subgrids_in_a_kept_section_stay_after_its_fields()
    {
        await world.ApplyAsync(Family, new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.AddSubgrid, Name = "contacts", SubgridTable = "account", Section = "notes" }],
        });
        var spec = new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Layout = Layout(new LayoutTab { Name = "details_tab", Sections = [new LayoutSection { Name = "notes", Fields = ["websiteurl"] }] }),
        };

        await world.ApplyAsync(Family, spec);

        Assert.Equal(["websiteurl", "contacts"], Controls(Xml(form.Id).Descendants("section").Single()));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_layout_that_leaves_out_a_section_with_a_subgrid_names_it_and_is_destructive()
    {
        await world.ApplyAsync(Family, new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.AddSubgrid, Name = "contacts", SubgridTable = "account", Section = "notes" }],
        });
        var spec = new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Layout = Layout(new LayoutTab { Name = "general", Sections = [new LayoutSection { Name = "summary", Fields = ["name"] }] }),
        };

        var step = Assert.Single((await PlanAsync(spec)).Steps);

        Assert.Equal(PlanEffect.Destructive, step.Effect);
        Assert.Contains("take off tab(s) details_tab", step.Detail);
        Assert.Contains("take off section(s) address, notes", step.Detail);
        Assert.Contains("cannot put back: contacts", step.Detail);
    }

    [Fact]
    public async Task A_field_that_shares_a_row_with_a_subgrid_is_not_placed_twice()
    {
        await world.ApplyAsync(Family, new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.AddSubgrid, Name = "contacts", SubgridTable = "account", Section = "notes" }],
        });
        var stored = Xml(form.Id);
        var grid = stored.Descendants("control").Single(c => (string?)c.Attribute("id") == "contacts").Parent!;
        var field = stored.Descendants("control").Single(c => (string?)c.Attribute("datafieldname") == "websiteurl").Parent!;
        field.Remove();
        grid.AddBeforeSelf(field);
        world.Row("systemform", form.Id)["formxml"] = stored.Root!.ToString(SaveOptions.DisableFormatting);
        var spec = new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Layout = Layout(new LayoutTab { Name = "details_tab", Sections = [new LayoutSection { Name = "notes", Fields = ["websiteurl"] }] }),
        };

        await world.ApplyAsync(Family, spec);

        Assert.Equal(["websiteurl", "contacts"], Controls(Xml(form.Id).Descendants("section").Single()));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_handler_adds_its_library_and_a_second_run_changes_nothing()
    {
        var spec = new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations =
            [
                new FormOperation { Op = FormOp.AddHandler, Event = FormEventName.OnLoad, Library = "new_/account.js", Function = "Account.onLoad" },
                new FormOperation { Op = FormOp.AddHandler, Event = FormEventName.OnChange, Column = "telephone1", Library = "new_/account.js", Function = "Account.onPhone", PassContext = false },
            ],
        };

        await world.ApplyAsync(Family, spec);

        var xml = Xml(form.Id);
        Assert.Equal("new_/account.js", (string?)xml.Root!.Element("formLibraries")!.Element("Library")!.Attribute("name"));
        var onload = xml.Root.Element("events")!.Elements("event").Single(e => (string?)e.Attribute("name") == "onload");
        Assert.Equal("Account.onLoad", (string?)onload.Descendants("Handler").Single().Attribute("functionName"));
        var onchange = xml.Root.Element("events")!.Elements("event").Single(e => (string?)e.Attribute("name") == "onchange");
        Assert.Equal("telephone1", (string?)onchange.Attribute("attribute"));
        Assert.Equal("false", (string?)onchange.Descendants("Handler").Single().Attribute("passExecutionContext"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Removing_a_library_takes_its_handlers_with_it()
    {
        await world.ApplyAsync(Family, new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.AddHandler, Event = FormEventName.OnSave, Library = "new_/account.js", Function = "Account.onSave" }],
        });
        var spec = new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.RemoveLibrary, Library = "new_/account.js" }],
        };

        var plan = await PlanAsync(spec);
        Assert.Contains("and its 1 handler(s)", Assert.Single(plan.Steps).Detail);
        await world.ApplyAsync(Family, spec);

        Assert.Null(Xml(form.Id).Root!.Element("formLibraries"));
        Assert.Empty(Xml(form.Id).Descendants("Handler"));
    }

    [Fact]
    public async Task A_handler_needs_a_javascript_web_resource_that_exists()
    {
        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "Information",
            Operations = [new FormOperation { Op = FormOp.AddHandler, Event = FormEventName.OnLoad, Library = "new_/missing.js", Function = "f" }],
        }));

        Assert.Contains("webresource_apply", problem.Problem.Message);
    }

    [Fact]
    public async Task A_dashboard_is_created_with_a_list_and_a_chart_and_published_as_a_dashboard()
    {
        var spec = new FormApplySpec
        {
            Solution = "Core",
            Form = "Accounts overview",
            FormType = FormKind.Dashboard,
            Layout = Layout(new LayoutTab
            {
                Name = "tab_0",
                Sections =
                [
                    new LayoutSection { Name = "left", Components = [new DashboardComponent { Name = "list", Table = "account" }] },
                    new LayoutSection { Name = "right", Column = 2, Components = [new DashboardComponent { Name = "chart", Table = "account", Chart = "Accounts by Owner", Label = "By owner" }] },
                ],
            }),
        };

        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var dashboard = world.Table("systemform").Single(f => (string)f["name"] == "Accounts overview");
        Assert.Equal(0, dashboard.GetAttributeValue<OptionSetValue>("type").Value);
        Assert.Equal("none", dashboard["objecttypecode"]);
        var parameters = Xml(dashboard.Id).Descendants("control").Single(c => (string?)c.Attribute("id") == "chart").Element("parameters")!;
        Assert.Equal("Chart", (string?)parameters.Element("ChartGridMode"));
        Assert.Contains(world.Writes.OfType<PublishXmlRequest>(), p => p.ParameterXml.Contains($"<dashboard>{dashboard.Id:D}</dashboard>"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_dashboard_takes_no_table_and_no_field_operations()
    {
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new FormApplySpec
        {
            Solution = "Core", Table = "account", Form = "x", FormType = FormKind.Dashboard,
            Layout = Layout(new LayoutTab { Name = "t", Sections = [] }),
        }));
        await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new FormApplySpec
        {
            Solution = "Core", Form = "x", FormType = FormKind.Dashboard,
            Layout = Layout(new LayoutTab { Name = "t", Sections = [new LayoutSection { Name = "s", Fields = ["name"] }] }),
        }));
    }
}
