using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Forms;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class FormPlannerTests
{
    private readonly RowWorld world = new();
    private readonly Entity form;
    private static readonly IApplyFamily Family = new ApplyFamily<FormApplySpec>(FormPlanner.Family, new FormPlanner());

    public FormPlannerTests()
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
        world.Add(new Entity("savedquery") { ["name"] = "Active Contacts", ["returnedtypecode"] = "contact", ["querytype"] = 0, ["isdefault"] = true });
    }

    private static FormApplySpec Spec(params FormOperation[] operations) =>
        new() { Solution = "Core", Table = "account", Form = "Information", Operations = [.. operations] };

    private Task<Plan> PlanAsync(FormApplySpec spec) => new FormPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private XDocument Xml => XDocument.Parse((string)world.Row("systemform", form.Id)["formxml"]);

    private static IEnumerable<string?> Fields(XElement section) =>
        section.Descendants("control").Select(c => (string?)c.Attribute("datafieldname") ?? (string?)c.Attribute("id"));

    private XElement Section(string name) => Xml.Descendants("section").Single(s => (string?)s.Attribute("name") == name);

    [Fact]
    public async Task Add_field_puts_the_column_in_the_section_with_its_control_and_adds_the_form_to_the_solution()
    {
        var spec = Spec(new FormOperation { Op = FormOp.AddField, Column = "description", Section = "Address" });

        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var control = Section("address").Descendants("control").Single();
        Assert.Equal("description", (string?)control.Attribute("datafieldname"));
        Assert.Equal(AgentFormXml.ClassId("memo"), (string?)control.Attribute("classid"));
        Assert.Contains(world.Writes.OfType<AddSolutionComponentRequest>(), r => r.ComponentId == form.Id && r.SolutionUniqueName == "Core");
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Move_field_places_it_after_the_named_column_and_is_idempotent()
    {
        var spec = Spec(new FormOperation { Op = FormOp.MoveField, Column = "name", Section = "notes", After = "telephone1" });

        await world.ApplyAsync(Family, spec);

        Assert.Equal(["telephone1", "name", "websiteurl"], Fields(Section("notes")));
        Assert.Empty(Fields(Section("summary")));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Remove_field_takes_out_its_row_and_a_second_time_plans_nothing()
    {
        var spec = Spec(new FormOperation { Op = FormOp.RemoveField, Column = "websiteurl" });

        await world.ApplyAsync(Family, spec);

        Assert.Equal(["telephone1"], Fields(Section("notes")));
        Assert.Single(Section("notes").Descendants("row"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task New_tab_and_section_then_a_field_in_it_plan_one_step_with_each_change()
    {
        var spec = Spec(
            new FormOperation { Op = FormOp.AddTab, Tab = "billing", Label = "Billing", After = "general" },
            new FormOperation { Op = FormOp.AddSection, Tab = "billing", Section = "invoices", Label = "Invoices" },
            new FormOperation { Op = FormOp.AddField, Column = "telephone1", Section = "invoices" });

        var plan = await PlanAsync(spec);
        await world.ApplyAsync(Family, spec);

        var step = Assert.Single(plan.Steps);
        Assert.Contains("add tab billing", step.Detail);
        Assert.Contains("add section invoices", step.Detail);
        Assert.DoesNotContain("telephone1", step.Detail); // already on the form, so addField skips it
        Assert.Equal(["general", "billing", "details_tab"], Xml.Descendants("tab").Select(t => (string?)t.Attribute("name")));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Labels_and_visibility_change_on_a_field_a_section_and_a_tab()
    {
        var spec = Spec(
            new FormOperation { Op = FormOp.SetLabel, Column = "telephone1", Label = "Main phone" },
            new FormOperation { Op = FormOp.SetVisible, Section = "Address", Visible = false },
            new FormOperation { Op = FormOp.SetLabel, Tab = "details_tab", Label = "More" });

        await world.ApplyAsync(Family, spec);

        var editor = new FormEditor(Xml, SchemaWorld.English);
        Assert.Equal("Main phone", editor.LabelOf(editor.FieldCells("telephone1")[0]));
        Assert.False(FormEditor.IsVisible(editor.Section("address", null)!));
        Assert.Equal("More", editor.LabelOf(editor.Tab("details_tab")!));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Add_subgrid_uses_the_default_view_of_the_listed_table()
    {
        var view = world.Table("savedquery").Single();
        var spec = Spec(new FormOperation { Op = FormOp.AddSubgrid, Name = "Contacts", SubgridTable = "contact", Relationship = "contact_customer_accounts", Section = "address" });

        await world.ApplyAsync(Family, spec);

        var control = Section("address").Descendants("control").Single();
        Assert.Equal(FormEditor.SubgridClassId, (string?)control.Attribute("classid"));
        Assert.Equal($"{{{view.Id.ToString().ToUpperInvariant()}}}", control.Element("parameters")!.Element("ViewId")!.Value);
        Assert.Equal("contact_customer_accounts", control.Element("parameters")!.Element("RelationshipName")!.Value);
        Assert.Equal(4, Section("address").Element("rows")!.Elements("row").Count());
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task A_column_the_table_lacks_or_a_missing_section_is_refused()
    {
        var column = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(new FormOperation { Op = FormOp.AddField, Column = "new_missing", Section = "address" })));
        var section = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec(new FormOperation { Op = FormOp.AddField, Column = "description", Section = "nowhere" })));

        Assert.Contains("table_apply", column.Problem.Message);
        Assert.Contains("nowhere", section.Problem.Message);
    }

    [Fact]
    public async Task A_form_that_is_not_customizable_is_blocked()
    {
        form["iscustomizable"] = new BooleanManagedProperty(false);

        var plan = await PlanAsync(Spec(new FormOperation { Op = FormOp.RemoveField, Column = "name" }));

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
    }

    [Fact]
    public async Task A_form_changed_after_approval_is_refused()
    {
        var spec = Spec(new FormOperation { Op = FormOp.RemoveField, Column = "websiteurl" });
        var kernel = world.Kernel(Family);
        var preview = await kernel.PlanAsync(spec, CancellationToken.None);
        form["formxml"] = AgentFormXmlTests.Form.Replace("Summary", "Overview");

        var result = await kernel.ApplyAsync(spec, preview.Hash, CancellationToken.None);

        Assert.Equal(ApplyOutcome.Refused, result.Outcome);
        Assert.Equal(ApplyResult.PlanChangedCode, result.Code);
    }
}
