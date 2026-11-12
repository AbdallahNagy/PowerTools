using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentSchemaDeleteTests
{
    private static (AgentSchemaService Service, FakeAgentClient Client) Make(bool custom = true)
    {
        var client = Data.Client();
        client.OnExecute = request =>
        {
            if (request is not RetrieveEntityRequest) return new OrganizationResponse();
            var entity = new EntityMetadata { LogicalName = "x" };
            Responses.SetInternal(entity, nameof(EntityMetadata.IsCustomEntity), custom);
            return Responses.Of<RetrieveEntityResponse>(("EntityMetadata", entity));
        };
        return (new AgentSchemaService(client), client);
    }

    [Fact]
    public async Task Delete_column_builds_a_delete_attribute_request()
    {
        var (service, client) = Make();

        var result = await service.DeleteColumnAsync(new DeleteColumnBody { Table = "Account", Column = "New_Rating" }, CancellationToken.None);

        Assert.Equal("account.new_rating", result.Value!.Name);
        var request = Assert.IsType<DeleteAttributeRequest>(Assert.Single(client.Executed));
        Assert.Equal("account", request.EntityLogicalName);
        Assert.Equal("new_rating", request.LogicalName);
    }

    [Fact]
    public async Task Delete_table_removes_a_custom_table()
    {
        var (service, client) = Make(custom: true);

        var result = await service.DeleteTableAsync(new DeleteTableBody { Table = "new_project" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.IsType<RetrieveEntityRequest>(client.Executed[0]);
        Assert.Equal("new_project", Assert.IsType<DeleteEntityRequest>(client.Executed[1]).LogicalName);
    }

    [Fact]
    public async Task Delete_table_refuses_a_system_table_without_deleting()
    {
        var (service, client) = Make(custom: false);

        var result = await service.DeleteTableAsync(new DeleteTableBody { Table = "account" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("not a custom table", result.Problem.Message);
        Assert.DoesNotContain(client.Executed, request => request is DeleteEntityRequest);
    }

    [Fact]
    public async Task Delete_relationship_builds_a_delete_relationship_request()
    {
        var (service, client) = Make();

        var result = await service.DeleteRelationshipAsync(new DeleteRelationshipBody { SchemaName = "new_account_contact_parent" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_account_contact_parent", Assert.IsType<DeleteRelationshipRequest>(Assert.Single(client.Executed)).Name);
    }

    [Theory]
    [InlineData("")]
    [InlineData("bad name")]
    [InlineData("a;drop")]
    public async Task Delete_relationship_refuses_a_bad_name(string name)
    {
        var (service, client) = Make();

        var result = await service.DeleteRelationshipAsync(new DeleteRelationshipBody { SchemaName = name }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task A_dataverse_fault_becomes_a_dataverse_fault_problem()
    {
        var (service, client) = Make();
        client.OnExecute = _ => throw FakeAgentClient.Fault(-2147220891, "Cannot delete: it is referenced.");

        var result = await service.DeleteColumnAsync(new DeleteColumnBody { Table = "account", Column = "new_x" }, CancellationToken.None);

        Assert.Equal("DataverseFault", result.Problem!.Code);
        Assert.Equal(-2147220891, result.Problem.DataverseCode);
    }
}
