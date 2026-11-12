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
    public async Task Update_column_sets_the_given_fields_and_merges_labels()
    {
        var (service, client) = Make(Text());

        var result = await service.UpdateColumnAsync(new UpdateColumnBody
        {
            Table = "account", Column = "new_title", DisplayName = "Title", Description = "The title", RequiredLevel = "recommended", MaxLength = 300,
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_title", result.Value!.LogicalName);
        var request = Assert.Single(client.Executed.OfType<UpdateAttributeRequest>());
        Assert.True(request.MergeLabels);
        Assert.Equal("account", request.EntityName);
        var attribute = Assert.IsType<StringAttributeMetadata>(request.Attribute);
        Assert.Equal(300, attribute.MaxLength);
        Assert.Equal("Title", attribute.DisplayName.LocalizedLabels.Single().Label);
        Assert.Equal(1033, attribute.DisplayName.LocalizedLabels.Single().LanguageCode);
        Assert.Equal("The title", attribute.Description.LocalizedLabels.Single().Label);
        Assert.Equal(AttributeRequiredLevel.Recommended, attribute.RequiredLevel.Value);
    }

    [Fact]
    public async Task Update_column_leaves_untouched_fields_alone_and_adds_the_column_to_the_solution()
    {
        var (service, client) = Make(Text(200));

        await service.UpdateColumnAsync(new UpdateColumnBody { Table = "account", Column = "new_title", DisplayName = "Title", Solution = "Core" }, CancellationToken.None);

        var request = Assert.Single(client.Executed.OfType<UpdateAttributeRequest>());
        Assert.Equal(200, ((StringAttributeMetadata)request.Attribute).MaxLength);
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
