using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentSchemaChangeTests
{
    private static readonly Guid ColumnId = Guid.Parse("44444444-4444-4444-4444-444444444444");

    private static (AgentSchemaService Service, FakeAgentClient Client) Make(AttributeMetadata? column)
    {
        var client = Data.Client();
        client.OnExecute = request => request switch
        {
            RetrieveAttributeRequest when column is null => throw FakeAgentClient.Fault(unchecked((int)0x80040217), "Could not find attribute."),
            RetrieveAttributeRequest => Responses.Of<RetrieveAttributeResponse>(("AttributeMetadata", column!)),
            _ => new OrganizationResponse(),
        };
        return (new AgentSchemaService(client), client);
    }

    private static StringAttributeMetadata Text(int maxLength = 200) =>
        new() { LogicalName = "new_title", SchemaName = "new_Title", MaxLength = maxLength, MetadataId = ColumnId };

    [Fact]
    public async Task Update_column_without_a_required_level_sends_only_the_changed_fields_through_the_sdk()
    {
        var column = Text();
        column.DisplayName = new Label("Old", 1033);
        var (service, client) = Make(column);

        var result = await service.UpdateColumnAsync(new UpdateColumnBody
        {
            Table = "account", Column = "new_title", DisplayName = "Title", Description = "The title", MaxLength = 300,
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_title", result.Value!.LogicalName);
        var request = Assert.Single(client.Executed.OfType<UpdateAttributeRequest>());
        Assert.True(request.MergeLabels);
        Assert.Equal("account", request.EntityName);
        var sent = Assert.IsType<StringAttributeMetadata>(request.Attribute);
        Assert.NotSame(column, sent);
        Assert.Equal((ColumnId, "new_title", "new_Title"), (sent.MetadataId!.Value, sent.LogicalName, sent.SchemaName));
        Assert.Equal(300, sent.MaxLength);
        Assert.Equal("Title", sent.DisplayName.LocalizedLabels.Single().Label);
        Assert.Equal("The title", sent.Description.LocalizedLabels.Single().Label);
        Assert.Null(sent.RequiredLevel);
        Assert.Empty(client.WebCalls);
    }

    [Fact]
    public async Task Update_column_changes_the_required_level_with_a_web_api_put_of_the_whole_definition()
    {
        var column = Text(200);
        column.DisplayName = new Label("Unpublished title", 1033);
        column.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None);
        var (service, client) = Make(column);
        client.OnWebApi = (method, _, _) => method == HttpMethod.Get
            ? """{"@odata.context":"x","LogicalName":"new_title","MaxLength":100,"RequiredLevel":{"Value":"None","CanBeChanged":true,"ManagedPropertyLogicalName":"canmodifyrequirementlevelsettings"},"DisplayName":{"LocalizedLabels":[{"Label":"Published title","LanguageCode":1033}],"UserLocalizedLabel":{"Label":"Published title","LanguageCode":1033}},"Description":{"LocalizedLabels":[]}}"""
            : "";

        var result = await service.UpdateColumnAsync(
            new UpdateColumnBody { Table = "account", Column = "new_title", RequiredLevel = "required", Description = "Why", Solution = "Core" },
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(client.Executed.OfType<UpdateAttributeRequest>());
        Assert.Equal(2, client.WebCalls.Count);
        var get = client.WebCalls[0];
        Assert.Equal((HttpMethod.Get, "EntityDefinitions(LogicalName='account')/Attributes(LogicalName='new_title')/Microsoft.Dynamics.CRM.StringAttributeMetadata"), (get.Method, get.Path));
        var put = client.WebCalls[1];
        Assert.Equal((HttpMethod.Put, "EntityDefinitions(LogicalName='account')/Attributes(LogicalName='new_title')"), (put.Method, put.Path));
        Assert.Equal("true", put.Headers!["MSCRM.MergeLabels"]);
        Assert.Equal("Core", put.Headers!["MSCRM.SolutionUniqueName"]);
        var body = System.Text.Json.Nodes.JsonNode.Parse(put.Body!)!.AsObject();
        Assert.False(body.ContainsKey("@odata.context"));
        Assert.Equal("#Microsoft.Dynamics.CRM.StringAttributeMetadata", (string?)body["@odata.type"]);
        Assert.Equal("ApplicationRequired", (string?)body["RequiredLevel"]!["Value"]);
        Assert.Equal("Unpublished title", (string?)body["DisplayName"]!["LocalizedLabels"]![0]!["Label"]);
        Assert.Equal("Why", (string?)body["Description"]!["LocalizedLabels"]![0]!["Label"]);
        Assert.Equal(200, (int?)body["MaxLength"]);
        Assert.Single(client.Executed.OfType<AddSolutionComponentRequest>());
    }

    [Fact]
    public async Task Update_column_to_the_same_required_level_changes_nothing()
    {
        var column = Text();
        column.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.Recommended);
        var (service, client) = Make(column);

        var result = await service.UpdateColumnAsync(
            new UpdateColumnBody { Table = "account", Column = "new_title", RequiredLevel = "recommended" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(client.WebCalls);
        Assert.Empty(client.Executed.OfType<UpdateAttributeRequest>());
    }

    [Fact]
    public async Task Update_column_refuses_a_required_level_the_column_does_not_allow_to_change()
    {
        var column = Text();
        column.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) { CanBeChanged = false };
        var (service, client) = Make(column);

        var result = await service.UpdateColumnAsync(
            new UpdateColumnBody { Table = "account", Column = "new_title", RequiredLevel = "required" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed.OfType<UpdateAttributeRequest>());
    }

    [Fact]
    public async Task Update_column_leaves_untouched_fields_alone_and_adds_the_column_to_the_solution()
    {
        var (service, client) = Make(Text(200));

        await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_title", DisplayName = "Title", Solution = "Core" }, CancellationToken.None);

        var request = Assert.Single(client.Executed.OfType<UpdateAttributeRequest>());
        Assert.Null(((StringAttributeMetadata)request.Attribute).MaxLength);
        Assert.Equal("Core", request.SolutionUniqueName);
        var add = Assert.Single(client.Executed.OfType<AddSolutionComponentRequest>());
        Assert.Equal(ColumnId, add.ComponentId);
        Assert.Equal(2, add.ComponentType);
        Assert.Equal("Core", add.SolutionUniqueName);
        Assert.False(add.AddRequiredComponents);
    }

    [Fact]
    public async Task Update_column_without_a_solution_adds_nothing()
    {
        var (service, client) = Make(Text());

        await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_title", Description = "d" }, CancellationToken.None);

        Assert.Empty(client.Executed.OfType<AddSolutionComponentRequest>());
    }

    [Fact]
    public async Task Update_column_needs_something_to_change()
    {
        var (service, client) = Make(Text());

        var result = await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_title" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Max_length_only_applies_to_text_and_memo_columns()
    {
        var (service, client) = Make(new IntegerAttributeMetadata { LogicalName = "new_n", MetadataId = ColumnId });

        var result = await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_n", MaxLength = 10 }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed.OfType<UpdateAttributeRequest>());
    }

    [Fact]
    public async Task A_missing_column_is_not_found()
    {
        var (service, _) = Make(null);

        var result = await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_gone", DisplayName = "x" }, CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
    }

    [Fact]
    public async Task Column_info_gives_the_type_and_max_length()
    {
        var (service, _) = Make(Text(120));
        var info = await service.GetColumnInfoAsync("account", "new_title", CancellationToken.None);
        Assert.Equal(120, info.Value!.MaxLength);

        var (numeric, _) = Make(new IntegerAttributeMetadata { LogicalName = "new_n" });
        var number = await numeric.GetColumnInfoAsync("account", "new_n", CancellationToken.None);
        Assert.Null(number.Value!.MaxLength);
    }

    [Fact]
    public async Task Publish_with_no_tables_publishes_everything()
    {
        var (service, client) = Make(null);

        var result = await service.PublishAsync(new PublishBody(), CancellationToken.None);

        Assert.Equal("all", result.Value!.Published);
        Assert.IsType<PublishAllXmlRequest>(Assert.Single(client.Executed));
    }

    [Fact]
    public async Task Publish_lists_the_tables_in_the_request_xml()
    {
        var (service, client) = Make(null);

        var result = await service.PublishAsync(new PublishBody { Tables = ["Account", "new_project", "account"] }, CancellationToken.None);

        Assert.Equal(["account", "new_project"], result.Value!.Tables);
        var request = Assert.IsType<PublishXmlRequest>(Assert.Single(client.Executed));
        Assert.Equal("<importexportxml><entities><entity>account</entity><entity>new_project</entity></entities></importexportxml>", request.ParameterXml);
    }

    [Fact]
    public async Task Publish_refuses_a_name_that_could_break_the_xml()
    {
        var (service, client) = Make(null);

        var result = await service.PublishAsync(new PublishBody { Tables = ["a</entity><x>"] }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }
}
