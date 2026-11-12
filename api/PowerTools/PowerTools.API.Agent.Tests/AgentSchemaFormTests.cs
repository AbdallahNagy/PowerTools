using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentSchemaFormTests
{
    private static readonly Guid FormId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid ViewId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");

    private static (AgentSchemaService Service, FakeAgentClient Client) Make(AttributeMetadata? column = null, int formType = 2, string formTable = "account")
    {
        var client = Data.Client();
        var attribute = column ?? new MoneyAttributeMetadata { LogicalName = "new_amount", DisplayName = new Label("Amount", 1033) };
        client.OnExecute = request => request is RetrieveAttributeRequest
            ? Responses.Of<RetrieveAttributeResponse>(("AttributeMetadata", attribute))
            : new OrganizationResponse();
        client.Records[("systemform", FormId)] = new Entity("systemform", FormId)
        {
            ["objecttypecode"] = formTable,
            ["type"] = formType,
            ["formxml"] = AgentFormXmlTests.Form,
        };
        client.Records[("savedquery", ViewId)] = new Entity("savedquery", ViewId)
        {
            ["returnedtypecode"] = "account",
            ["layoutxml"] = AgentViewXmlTests.Layout,
            ["fetchxml"] = AgentViewXmlTests.Fetch,
        };
        return (new AgentSchemaService(client), client);
    }

    [Fact]
    public async Task Add_column_to_form_updates_formxml_with_the_right_control_and_adds_the_form_to_the_solution()
    {
        var (service, client) = Make();

        var result = await service.AddColumnToFormAsync(new AddFormColumnBody
        {
            Table = "account", FormId = FormId.ToString(), Column = "new_amount", Tab = "details_tab", Section = "notes", Solution = "Core",
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        var update = Assert.Single(client.Updated);
        Assert.Equal("systemform", update.LogicalName);
        Assert.Equal(FormId, update.Id);
        var xml = update.GetAttributeValue<string>("formxml");
        Assert.Contains("classid=\"{533B9E00-756B-4312-95A0-DC888637AC78}\" datafieldname=\"new_amount\"", xml);
        Assert.Contains("<label description=\"Amount\" languagecode=\"1033\"/>", xml);
        var add = Assert.Single(client.Executed.OfType<AddSolutionComponentRequest>());
        Assert.Equal((FormId, 60, "Core"), (add.ComponentId, add.ComponentType, add.SolutionUniqueName));
    }

    [Fact]
    public async Task A_form_of_another_table_or_type_is_refused_without_an_update()
    {
        var (otherTable, client1) = Make(formTable: "contact");
        var (dashboard, client2) = Make(formType: 0);
        var body = new AddFormColumnBody { Table = "account", FormId = FormId.ToString(), Column = "new_amount" };

        var a = await otherTable.AddColumnToFormAsync(body, CancellationToken.None);
        var b = await dashboard.AddColumnToFormAsync(body, CancellationToken.None);

        Assert.Equal("InvalidRequest", a.Problem!.Code);
        Assert.Equal("InvalidRequest", b.Problem!.Code);
        Assert.Empty(client1.Updated);
        Assert.Empty(client2.Updated);
    }

    [Fact]
    public async Task A_duplicate_column_or_unknown_section_stops_before_any_update()
    {
        var (service, client) = Make(new StringAttributeMetadata { LogicalName = "telephone1" });

        var duplicate = await service.AddColumnToFormAsync(new AddFormColumnBody { Table = "account", FormId = FormId.ToString(), Column = "telephone1" }, CancellationToken.None);
        var unknown = await service.AddColumnToFormAsync(new AddFormColumnBody { Table = "account", FormId = FormId.ToString(), Column = "new_x", Section = "nope" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", duplicate.Problem!.Code);
        Assert.Equal("InvalidRequest", unknown.Problem!.Code);
        Assert.Empty(client.Updated);
    }

    [Fact]
    public async Task A_missing_form_is_not_found_and_a_bad_id_is_invalid()
    {
        var (service, _) = Make();

        var missing = await service.AddColumnToFormAsync(new AddFormColumnBody { Table = "account", FormId = Guid.NewGuid().ToString(), Column = "new_amount" }, CancellationToken.None);
        var bad = await service.AddColumnToFormAsync(new AddFormColumnBody { Table = "account", FormId = "nope", Column = "new_amount" }, CancellationToken.None);

        Assert.Equal("NotFound", missing.Problem!.Code);
        Assert.Equal("InvalidRequest", bad.Problem!.Code);
    }

    [Fact]
    public async Task List_forms_reads_main_and_quick_create_forms_with_their_tabs()
    {
        var (service, client) = Make();
        client.SystemForms.Add(new Entity("systemform", FormId) { ["name"] = "Information", ["type"] = 2, ["formxml"] = AgentFormXmlTests.Form });

        var result = await service.ListFormsAsync("account", CancellationToken.None);

        var form = Assert.Single(result.Value!);
        Assert.Equal("Information", form.Name);
        Assert.Equal(2, form.Type);
        Assert.Equal(["general", "details_tab"], form.Tabs.Select(t => t.Name));
        var condition = AgentSchemaService.FormsQuery("account").Criteria.Conditions.Single(c => c.AttributeName == "type");
        Assert.Equal([2, 7], condition.Values.Cast<int>());
    }

    [Fact]
    public async Task Add_column_to_view_updates_both_xml_columns_and_defaults_the_width_to_150()
    {
        var (service, client) = Make(new StringAttributeMetadata { LogicalName = "new_rating" });

        var result = await service.AddColumnToViewAsync(new AddViewColumnBody { Table = "account", ViewId = ViewId.ToString(), Column = "new_rating", Solution = "Core" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var update = Assert.Single(client.Updated);
        Assert.Equal("savedquery", update.LogicalName);
        Assert.Contains("<cell name=\"new_rating\" width=\"150\"/>", update.GetAttributeValue<string>("layoutxml"));
        Assert.Contains("<attribute name=\"new_rating\"/>", update.GetAttributeValue<string>("fetchxml"));
        var add = Assert.Single(client.Executed.OfType<AddSolutionComponentRequest>());
        Assert.Equal((ViewId, 26), (add.ComponentId, add.ComponentType));
    }

    [Fact]
    public async Task A_duplicate_column_in_the_view_is_invalid_and_nothing_is_updated()
    {
        var (service, client) = Make(new StringAttributeMetadata { LogicalName = "name" });

        var result = await service.AddColumnToViewAsync(new AddViewColumnBody { Table = "account", ViewId = ViewId.ToString(), Column = "name" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Updated);
    }

    [Fact]
    public async Task A_view_of_another_table_is_refused()
    {
        var (service, client) = Make(new StringAttributeMetadata { LogicalName = "new_rating" });

        var result = await service.AddColumnToViewAsync(new AddViewColumnBody { Table = "contact", ViewId = ViewId.ToString(), Column = "new_rating" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Updated);
    }

    [Fact]
    public async Task List_views_returns_system_views_with_their_columns()
    {
        var (service, client) = Make();
        client.SavedQueries.Add(new Entity("savedquery", ViewId)
        {
            ["name"] = "Active Accounts",
            ["isdefault"] = true,
            ["layoutxml"] = AgentViewXmlTests.Layout,
            ["fetchxml"] = AgentViewXmlTests.Fetch,
        });

        var result = await service.ListViewsAsync("account", CancellationToken.None);

        var view = Assert.Single(result.Value!);
        Assert.Equal("Active Accounts", view.Name);
        Assert.True(view.IsDefault);
        Assert.Equal(["name", "telephone1"], view.Columns);
    }
}
