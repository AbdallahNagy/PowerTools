using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentEnvVarsServiceTests
{
    private static readonly Guid UrlId = Guid.Parse("a1111111-0000-0000-0000-000000000001");
    private static readonly Guid UrlValueId = Guid.Parse("b1111111-0000-0000-0000-000000000001");
    private static readonly Guid FlagId = Guid.Parse("a1111111-0000-0000-0000-000000000002");
    private static readonly Guid SecretId = Guid.Parse("a1111111-0000-0000-0000-000000000003");
    private static readonly Guid CreatedId = Guid.Parse("c1111111-0000-0000-0000-000000000001");
    private static readonly Guid DependentId = Guid.Parse("d1111111-0000-0000-0000-000000000001");

    private static Entity Definition(Guid id, string schema, int type, string? defaultValue = null) =>
        new("environmentvariabledefinition", id)
        {
            ["schemaname"] = schema,
            ["displayname"] = schema + " name",
            ["type"] = new OptionSetValue(type),
            ["defaultvalue"] = defaultValue,
            ["statecode"] = new OptionSetValue(0),
            ["ismanaged"] = false,
            ["iscustomizable"] = new BooleanManagedProperty(true),
        };

    private static (AgentEnvVarsService Service, FakeAgentClient Client) Make(bool dependencies = false)
    {
        var client = Data.Client();
        client.ByEntity["environmentvariabledefinition"] =
        [
            Definition(UrlId, "new_ApiUrl", 100000000, "https://default"),
            Definition(FlagId, "new_Flag", 100000002),
            Definition(SecretId, "new_Key", 100000005, "/subscriptions/x/default"),
        ];
        client.ByEntity["environmentvariablevalue"] =
        [
            new Entity("environmentvariablevalue", UrlValueId)
            {
                ["environmentvariabledefinitionid"] = new EntityReference("environmentvariabledefinition", UrlId),
                ["value"] = "https://current",
                ["ismanaged"] = false,
            },
            new Entity("environmentvariablevalue", Guid.NewGuid())
            {
                ["environmentvariabledefinitionid"] = new EntityReference("environmentvariabledefinition", SecretId),
                ["value"] = "/subscriptions/x/secret-value",
                ["ismanaged"] = false,
            },
        ];
        client.OnCreate = _ => CreatedId;
        client.OnExecute = request => request switch
        {
            CreateRequest => Responses.Of<CreateResponse>(("id", CreatedId)),
            RetrieveDependenciesForDeleteRequest => Responses.Of<RetrieveDependenciesForDeleteResponse>(
                ("EntityCollection", new EntityCollection(dependencies
                    ? [new Entity("dependency") { ["dependentcomponenttype"] = new OptionSetValue(29), ["dependentcomponentobjectid"] = DependentId }]
                    : []))),
            _ => new OrganizationResponse(),
        };
        return (new AgentEnvVarsService(client, onPremises: false), client);
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_returns_variables_by_schema_name_without_ids()
    {
        var (service, _) = Make();

        var result = await service.ListAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        var url = result.Value!.Single(v => v.SchemaName == "new_ApiUrl");
        Assert.Equal(("https://default", "https://current", true, "Text"), (url.DefaultValue, url.CurrentValue, url.HasCurrentValue, url.Type));
        var flag = result.Value!.Single(v => v.SchemaName == "new_Flag");
        Assert.False(flag.HasCurrentValue);
        Assert.Null(flag.CurrentValue);
    }

    [Fact]
    public async Task List_never_returns_the_values_of_a_secret()
    {
        var (service, _) = Make();

        var result = await service.ListAsync(CancellationToken.None);

        var secret = result.Value!.Single(v => v.SchemaName == "new_Key");
        Assert.Null(secret.DefaultValue);
        Assert.Null(secret.CurrentValue);
        Assert.True(secret.HasCurrentValue);
        Assert.DoesNotContain("secret-value", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    // ── Create definition ────────────────────────────────────────────────────

    [Fact]
    public async Task Create_definition_runs_the_service_rules_and_puts_it_in_the_solution()
    {
        var (service, client) = Make();
        client.Solutions.Clear();
        var solution = Data.Solution("Core", Data.ContosoPublisherId);
        solution["pub.customizationprefix"] = new AliasedValue("publisher", "customizationprefix", "new");
        client.Solutions.Add(solution);

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody
        {
            SchemaName = "new_Timeout", DisplayName = "Timeout", Type = "number", DefaultValue = "30", Description = "Seconds", Solution = "Core",
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_Timeout", result.Value!.SchemaName);
        var create = Assert.IsType<CreateRequest>(Assert.Single(client.Executed));
        Assert.Equal("Core", create["SolutionUniqueName"]);
        Assert.Equal("new_Timeout", create.Target["schemaname"]);
        Assert.Equal(100000001, create.Target.GetAttributeValue<OptionSetValue>("type").Value);
        Assert.Equal("30", create.Target["defaultvalue"]);
    }

    [Fact]
    public async Task Create_definition_with_neither_solution_nor_publisher_needs_a_publisher_and_writes_nothing()
    {
        var (service, client) = Make();

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody { SchemaName = "new_X", DisplayName = "X", Type = "string" }, CancellationToken.None);

        Assert.Equal("PublisherRequired", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_definition_checks_the_prefix_against_the_publisher_before_writing()
    {
        var (service, client) = Make();

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody { SchemaName = "fab_X", DisplayName = "X", Type = "string", Publisher = "new" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_definition_with_only_a_publisher_adds_no_solution()
    {
        var (service, client) = Make();

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody { SchemaName = "new_X", DisplayName = "X", Type = "string", Publisher = "contoso" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var create = Assert.IsType<CreateRequest>(Assert.Single(client.Executed));
        Assert.False(create.Parameters.ContainsKey("SolutionUniqueName"));
    }

    [Theory]
    [InlineData("nonsense", "new_X", "string")]
    [InlineData(null, "new_X", "string")]
    [InlineData("datasource", "new_X", "string")]
    public async Task Create_definition_refuses_an_unknown_or_unsupported_type(string? type, string schema, string _)
    {
        var (service, client) = Make();

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody { SchemaName = schema, DisplayName = "X", Type = type, Publisher = "new" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_definition_reports_the_services_value_checks_as_invalid_requests()
    {
        var (service, client) = Make();

        var result = await service.CreateDefinitionAsync(new CreateEnvVarDefinitionBody
        {
            SchemaName = "new_N", DisplayName = "N", Type = "number", DefaultValue = "not a number", Publisher = "new",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    // ── Values ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Set_value_updates_the_existing_value_row()
    {
        var (service, client) = Make();

        var result = await service.SetValueAsync(new SetEnvVarValueBody { Definition = "NEW_APIURL", Value = "https://new" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("Value updated.", result.Value!.Note);
        var update = Assert.IsType<UpdateRequest>(Assert.Single(client.Executed));
        Assert.Equal(UrlValueId, update.Target.Id);
        Assert.Equal("https://new", update.Target["value"]);
    }

    [Fact]
    public async Task Set_value_creates_a_value_row_when_there_is_none()
    {
        var (service, client) = Make();

        var result = await service.SetValueAsync(new SetEnvVarValueBody { Definition = "new_Flag", Value = "yes" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("Value created.", result.Value!.Note);
        var create = Assert.IsType<CreateRequest>(Assert.Single(client.Executed));
        Assert.Equal("environmentvariablevalue", create.Target.LogicalName);
        Assert.Equal("yes", create.Target["value"]);
        Assert.Equal(FlagId, create.Target.GetAttributeValue<EntityReference>("environmentvariabledefinitionid").Id);
    }

    [Fact]
    public async Task Set_value_checks_the_value_against_the_type_and_the_definition_exists()
    {
        var (service, client) = Make();

        var bad = await service.SetValueAsync(new SetEnvVarValueBody { Definition = "new_Flag", Value = "maybe" }, CancellationToken.None);
        var unknown = await service.SetValueAsync(new SetEnvVarValueBody { Definition = "new_Nope", Value = "x" }, CancellationToken.None);
        var missing = await service.SetValueAsync(new SetEnvVarValueBody { Definition = "new_Flag" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", bad.Problem!.Code);
        Assert.Equal("NotFound", unknown.Problem!.Code);
        Assert.Equal("InvalidRequest", missing.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_definition_deletes_a_variable_nothing_depends_on()
    {
        var (service, client) = Make();

        var result = await service.DeleteAsync(new DeleteEnvVarBody { Kind = "definition", SchemaName = "new_Flag" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var delete = client.Executed.OfType<DeleteRequest>().Single();
        Assert.Equal(("environmentvariabledefinition", FlagId), (delete.Target.LogicalName, delete.Target.Id));
    }

    [Fact]
    public async Task Delete_definition_with_dependents_is_refused_and_deletes_nothing()
    {
        var (service, client) = Make(dependencies: true);

        var result = await service.DeleteAsync(new DeleteEnvVarBody { Kind = "definition", SchemaName = "new_Flag" }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("depend on this variable", result.Problem.Message);
        Assert.DoesNotContain(client.Executed, request => request is DeleteRequest);
    }

    [Fact]
    public async Task Delete_value_deletes_only_the_current_value()
    {
        var (service, client) = Make();

        var result = await service.DeleteAsync(new DeleteEnvVarBody { Kind = "value", SchemaName = "new_ApiUrl" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var delete = client.Executed.OfType<DeleteRequest>().Single();
        Assert.Equal(("environmentvariablevalue", UrlValueId), (delete.Target.LogicalName, delete.Target.Id));
    }

    [Fact]
    public async Task Delete_value_of_a_variable_with_no_value_is_not_found()
    {
        var (service, client) = Make();

        var result = await service.DeleteAsync(new DeleteEnvVarBody { Kind = "value", SchemaName = "new_Flag" }, CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Empty(client.Executed.OfType<DeleteRequest>());
    }

    [Theory]
    [InlineData("nonsense", "new_Flag", "InvalidRequest")]
    [InlineData("definition", "new_Nope", "NotFound")]
    [InlineData("definition", "", "InvalidRequest")]
    public async Task Delete_refuses_a_bad_kind_or_an_unknown_or_missing_name(string kind, string name, string code)
    {
        var (service, client) = Make();

        var result = await service.DeleteAsync(new DeleteEnvVarBody { Kind = kind, SchemaName = name }, CancellationToken.None);

        Assert.Equal(code, result.Problem!.Code);
        Assert.Empty(client.Executed.OfType<DeleteRequest>());
    }
}
