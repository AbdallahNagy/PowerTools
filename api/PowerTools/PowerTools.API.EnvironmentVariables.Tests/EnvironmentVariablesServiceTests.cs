using System.ServiceModel;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.EnvironmentVariables;
using Xunit;
using static PowerTools.API.Tools.EnvironmentVariables.EnvironmentVariablesQueries;

namespace PowerTools.API.EnvironmentVariables.Tests;

/// <summary>An in-memory stand-in for the organization service.</summary>
public sealed class FakeEnvironmentVariablesClient : IEnvironmentVariablesClient
{
    public List<QueryExpression> Queries { get; } = [];
    public List<OrganizationRequest> Requests { get; } = [];
    public Func<QueryExpression, EntityCollection>? OnRetrieve { get; set; }
    public Func<OrganizationRequest, OrganizationResponse>? OnExecute { get; set; }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        var expression = Assert.IsType<QueryExpression>(query);
        Queries.Add(expression);
        return Task.FromResult(OnRetrieve?.Invoke(expression) ?? new EntityCollection());
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        if (OnExecute is not null) return Task.FromResult(OnExecute(request));
        return Task.FromResult<OrganizationResponse>(request switch
        {
            CreateRequest => new CreateResponse { Results = { ["id"] = Guid.NewGuid() } },
            RetrieveDependenciesForDeleteRequest => new RetrieveDependenciesForDeleteResponse
            {
                Results = { ["EntityCollection"] = new EntityCollection() },
            },
            _ => new OrganizationResponse(),
        });
    }
}

public sealed class EnvironmentVariablesServiceTests
{
    private static readonly Guid ApiUrlId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid RetriesId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ValueId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static EnvironmentVariablesService Service(FakeEnvironmentVariablesClient client, bool onPremises = false) =>
        new(client, onPremises);

    private static Entity Definition(
        Guid id,
        string schemaName,
        EnvironmentVariableType type,
        bool managed = false,
        bool customizable = true,
        int? secretStore = null)
    {
        var entity = new Entity(DefinitionTable, id)
        {
            ["schemaname"] = schemaName,
            ["displayname"] = schemaName,
            ["type"] = new OptionSetValue((int)type),
            ["statecode"] = new OptionSetValue(0),
            ["ismanaged"] = managed,
            ["iscustomizable"] = new BooleanManagedProperty(customizable),
        };
        if (secretStore is int store) entity["secretstore"] = new OptionSetValue(store);
        return entity;
    }

    private static Entity Value(Guid id, Guid definitionId, string value, bool managed = false) =>
        new(ValueTable, id)
        {
            [EnvironmentVariablesQueries.DefinitionId] = new EntityReference(DefinitionTable, definitionId),
            ["value"] = value,
            ["ismanaged"] = managed,
        };

    private static Entity Solution(string uniqueName, string prefix) =>
        new("solution", Guid.NewGuid())
        {
            ["uniquename"] = uniqueName,
            ["friendlyname"] = uniqueName,
            ["pub.customizationprefix"] = new AliasedValue("publisher", "customizationprefix", prefix),
        };

    private static FaultException<OrganizationServiceFault> Fault(int code, string message) =>
        new(new OrganizationServiceFault { ErrorCode = code, Message = message }, new FaultReason(message));

    private static Guid? ConditionGuid(QueryExpression query, string attribute) =>
        query.Criteria.Conditions.FirstOrDefault(c => c.AttributeName == attribute)?.Values.FirstOrDefault() as Guid?;

    // ── Queries ──────────────────────────────────────────────────────────────

    [Fact]
    public void Definition_query_pages_the_table_alone_in_a_stable_order()
    {
        var query = Definitions(2, "<cookie/>");

        Assert.Equal(DefinitionTable, query.EntityName);
        Assert.Empty(query.LinkEntities);
        Assert.Equal(5000, query.PageInfo.Count);
        Assert.Equal(2, query.PageInfo.PageNumber);
        Assert.Equal("<cookie/>", query.PageInfo.PagingCookie);
        Assert.Equal(["displayname", DefinitionId], query.Orders.Select(order => order.AttributeName));
        Assert.Contains("iscustomizable", query.ColumnSet.Columns);
        Assert.Contains("secretstore", query.ColumnSet.Columns);
    }

    [Fact]
    public void Managed_value_solution_query_filters_component_type_and_managed_solutions()
    {
        var query = ManagedValueSolutions([ValueId]);

        var componentType = Assert.Single(query.Criteria.Conditions, c => c.AttributeName == "componenttype");
        Assert.Equal(381, componentType.Values.Single());
        var link = Assert.Single(query.LinkEntities);
        Assert.Equal("solution", link.LinkToEntityName);
        Assert.Equal(JoinOperator.Inner, link.JoinOperator);
        var managed = Assert.Single(link.LinkCriteria.Conditions);
        Assert.Equal(("ismanaged", true), (managed.AttributeName, managed.Values.Single()));
    }

    [Fact]
    public void Solution_query_returns_unmanaged_visible_solutions_with_prefix()
    {
        var query = Solutions(1, null);

        var conditions = query.Criteria.Conditions.Select(c => (c.AttributeName, c.Operator, c.Values.Single())).ToList();
        Assert.Contains(("ismanaged", ConditionOperator.Equal, (object)false), conditions);
        Assert.Contains(("isvisible", ConditionOperator.Equal, (object)true), conditions);
        Assert.Contains(("uniquename", ConditionOperator.NotEqual, (object)"Default"), conditions);
        Assert.Equal("publisher", Assert.Single(query.LinkEntities).LinkToEntityName);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(EnvironmentVariableType.Number, "42", true)]
    [InlineData(EnvironmentVariableType.Number, "-3.5", true)]
    [InlineData(EnvironmentVariableType.Number, "3,5", false)]
    [InlineData(EnvironmentVariableType.Number, "abc", false)]
    [InlineData(EnvironmentVariableType.Boolean, "yes", true)]
    [InlineData(EnvironmentVariableType.Boolean, "no", true)]
    [InlineData(EnvironmentVariableType.Boolean, "Yes", false)]
    [InlineData(EnvironmentVariableType.Boolean, "true", false)]
    [InlineData(EnvironmentVariableType.Json, "{\"a\":1}", true)]
    [InlineData(EnvironmentVariableType.Json, "{a:1}", false)]
    [InlineData(EnvironmentVariableType.Secret, "/subscriptions/s1/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv/secrets/pw", true)]
    [InlineData(EnvironmentVariableType.Secret, "/subscriptions/s1/resourceGroups/rg/vaults/kv/secrets/pw", false)]
    [InlineData(EnvironmentVariableType.String, "anything", true)]
    [InlineData(EnvironmentVariableType.DataSource, "https://contoso.sharepoint.com/sites/x", true)]
    public void Values_are_validated_by_type(EnvironmentVariableType type, string value, bool valid)
    {
        Assert.Equal(valid, EnvironmentVariablesRules.ValidateValue((int)type, value, required: true) is null);
    }

    [Fact]
    public void Values_and_names_respect_lengths_and_reserved_words()
    {
        Assert.NotNull(EnvironmentVariablesRules.ValidateValue((int)EnvironmentVariableType.String, new string('x', 2001), true));
        Assert.NotNull(EnvironmentVariablesRules.ValidateValue((int)EnvironmentVariableType.String, "", true));
        Assert.Null(EnvironmentVariablesRules.ValidateValue((int)EnvironmentVariableType.String, "", false));
        Assert.NotNull(EnvironmentVariablesRules.ValidateDisplayName("$connection"));
        Assert.NotNull(EnvironmentVariablesRules.ValidateDisplayName(new string('x', 101)));
        Assert.Null(EnvironmentVariablesRules.ValidateSchemaName("contoso_ApiUrl", "contoso"));
        Assert.NotNull(EnvironmentVariablesRules.ValidateSchemaName("fabrikam_ApiUrl", "contoso"));
        Assert.NotNull(EnvironmentVariablesRules.ValidateSchemaName("ApiUrl", null));
        Assert.NotNull(EnvironmentVariablesRules.ValidateSchemaName("contoso_" + new string('x', 100), null));
    }

    [Fact]
    public void Data_source_and_on_premises_secrets_are_not_offered_on_create()
    {
        Assert.False(EnvironmentVariablesRules.CanCreate((int)EnvironmentVariableType.DataSource, onPremises: false));
        Assert.True(EnvironmentVariablesRules.CanCreate((int)EnvironmentVariableType.Secret, onPremises: false));
        Assert.False(EnvironmentVariablesRules.CanCreate((int)EnvironmentVariableType.Secret, onPremises: true));
        Assert.Equal("Data Source", EnvironmentVariablesRules.TypeLabel(100000004));
    }

    // ── List ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_reads_every_page_and_joins_values_in_memory()
    {
        var conflictId = Guid.NewGuid();
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName switch
            {
                DefinitionTable when query.PageInfo.PageNumber == 1 => new EntityCollection(
                    [Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String)])
                {
                    MoreRecords = true,
                    PagingCookie = "<cookie page=\"1\"/>",
                },
                DefinitionTable => new EntityCollection(
                [
                    Definition(RetriesId, "contoso_Retries", EnvironmentVariableType.Number),
                    Definition(conflictId, "contoso_Twice", EnvironmentVariableType.String),
                ]),
                ValueTable => new EntityCollection(
                [
                    Value(ValueId, ApiUrlId, "https://api.example.test", managed: true),
                    Value(Guid.NewGuid(), conflictId, "a"),
                    Value(Guid.NewGuid(), conflictId, "b"),
                ]),
                "solutioncomponent" => new EntityCollection(
                [
                    new Entity("solutioncomponent", Guid.NewGuid())
                    {
                        ["objectid"] = ValueId,
                        ["sol.friendlyname"] = new AliasedValue("solution", "friendlyname", "Contoso Core"),
                    },
                ]),
                _ => new EntityCollection(),
            },
        };

        var result = await Service(client).ListAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        var list = result.Value!;
        Assert.Equal(["contoso_ApiUrl", "contoso_Retries", "contoso_Twice"], list.Select(v => v.SchemaName));
        var second = client.Queries.Where(q => q.EntityName == DefinitionTable).ElementAt(1);
        Assert.Equal("<cookie page=\"1\"/>", second.PageInfo.PagingCookie);

        var apiUrl = list[0];
        Assert.Equal(ValueId.ToString("D"), apiUrl.ValueId);
        Assert.Equal("https://api.example.test", apiUrl.CurrentValue);
        Assert.True(apiUrl.ValueIsManaged);
        Assert.Equal(["Contoso Core"], apiUrl.ManagedValueSolutions);
        Assert.Equal("Text", apiUrl.TypeLabel);

        Assert.Null(list[1].ValueId);
        Assert.Empty(list[1].ConflictingValues);

        var twice = list[2];
        Assert.Null(twice.ValueId);
        Assert.Null(twice.CurrentValue);
        Assert.Equal(2, twice.ConflictingValues.Count);
    }

    [Fact]
    public async Task List_reports_missing_tables_as_not_available()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = _ => throw Fault(EnvironmentVariablesFaults.QueryBuilderNoEntity, "No entity"),
        };

        var result = await Service(client).ListAsync(CancellationToken.None);

        Assert.Equal(501, result.Problem!.Status);
        Assert.Equal(EnvironmentVariablesFaults.NotAvailableCode, result.Problem.Code);
    }

    // ── Save values ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Save_creates_a_missing_value_updates_an_existing_one_and_reports_each_row()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName switch
            {
                DefinitionTable => new EntityCollection(
                [
                    Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String),
                    Definition(RetriesId, "contoso_Retries", EnvironmentVariableType.Number),
                ]),
                ValueTable when ConditionGuid(query, EnvironmentVariablesQueries.DefinitionId) == ApiUrlId =>
                    new EntityCollection([Value(ValueId, ApiUrlId, "old")]),
                _ => new EntityCollection(),
            },
        };

        var result = await Service(client).SaveValuesAsync(
            new SaveValuesBody(
            [
                new SaveValueItem(ApiUrlId.ToString(), ValueId.ToString(), "https://new.example.test"),
                new SaveValueItem(RetriesId.ToString(), null, "not a number"),
                new SaveValueItem(RetriesId.ToString(), null, "-3"),
            ]),
            CancellationToken.None);

        var rows = result.Value!.Results;
        Assert.Equal([true, false, true], rows.Select(r => r.Ok));
        Assert.Equal("Enter a decimal number.", rows[1].Error);
        Assert.Equal(ValueId.ToString("D"), rows[0].ValueId);
        Assert.NotNull(rows[2].ValueId);

        var update = Assert.Single(client.Requests.OfType<UpdateRequest>());
        Assert.Equal(ValueId, update.Target.Id);
        Assert.Equal("https://new.example.test", update.Target["value"]);
        var create = Assert.Single(client.Requests.OfType<CreateRequest>());
        Assert.Equal("contoso_Retries", create.Target["schemaname"]);
        Assert.Equal(RetriesId, ((EntityReference)create.Target[EnvironmentVariablesQueries.DefinitionId]).Id);
        Assert.False(create.Parameters.ContainsKey(EnvironmentVariablesService.SolutionUniqueNameParameter));
    }

    [Fact]
    public async Task Save_refuses_to_pick_between_two_value_rows_and_keeps_going_after_a_fault()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName switch
            {
                DefinitionTable => new EntityCollection(
                [
                    Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String),
                    Definition(RetriesId, "contoso_Retries", EnvironmentVariableType.String),
                ]),
                ValueTable when ConditionGuid(query, EnvironmentVariablesQueries.DefinitionId) == ApiUrlId =>
                    new EntityCollection([Value(Guid.NewGuid(), ApiUrlId, "a"), Value(Guid.NewGuid(), ApiUrlId, "b")]),
                _ => new EntityCollection(),
            },
            OnExecute = _ => throw Fault(EnvironmentVariablesFaults.PrivilegeDenied, "Principal user is missing prvCreate"),
        };

        var result = await Service(client).SaveValuesAsync(
            new SaveValuesBody(
            [
                new SaveValueItem(ApiUrlId.ToString(), null, "x"),
                new SaveValueItem(RetriesId.ToString(), null, "y"),
                new SaveValueItem(Guid.NewGuid().ToString(), null, "z"),
            ]),
            CancellationToken.None);

        var rows = result.Value!.Results;
        Assert.All(rows, row => Assert.False(row.Ok));
        Assert.Contains("2 value rows", rows[0].Error);
        Assert.Contains("prvCreate", rows[1].Error);
        Assert.Contains("no longer exists", rows[2].Error);
        Assert.Single(client.Requests);
    }

    [Fact]
    public async Task Save_rejects_dataverse_secret_store_values()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(ApiUrlId, "contoso_Pw", EnvironmentVariableType.Secret, secretStore: SecretStore.Dataverse)])
                : new EntityCollection(),
        };

        var result = await Service(client).SaveValuesAsync(
            new SaveValuesBody([new SaveValueItem(ApiUrlId.ToString(), null, "x")]),
            CancellationToken.None);

        Assert.Contains("read-only", result.Value!.Results.Single().Error);
        Assert.Empty(client.Requests);
    }

    // ── Definitions ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_puts_the_definition_in_the_solution_and_the_initial_value_outside_it()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == "solution"
                ? new EntityCollection([Solution("ContosoCore", "contoso")])
                : new EntityCollection(),
        };

        var result = await Service(client).CreateDefinitionAsync(
            new CreateDefinitionBody(
                "contoso_VaultPassword",
                "Vault password",
                null,
                (int)EnvironmentVariableType.Secret,
                null,
                "/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv/secrets/pw",
                "ContosoCore"),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Null(result.Value!.ValueError);
        var creates = client.Requests.OfType<CreateRequest>().ToList();
        Assert.Equal(2, creates.Count);
        Assert.Equal(DefinitionTable, creates[0].Target.LogicalName);
        Assert.Equal("ContosoCore", creates[0][EnvironmentVariablesService.SolutionUniqueNameParameter]);
        Assert.Equal(SecretStore.AzureKeyVault, ((OptionSetValue)creates[0].Target["secretstore"]).Value);
        Assert.Equal(ValueTable, creates[1].Target.LogicalName);
        Assert.False(creates[1].Parameters.ContainsKey(EnvironmentVariablesService.SolutionUniqueNameParameter));
        Assert.Equal("contoso_VaultPassword", creates[1].Target["schemaname"]);
    }

    [Fact]
    public async Task Create_rejects_data_source_wrong_prefix_and_on_premises_secrets()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == "solution"
                ? new EntityCollection([Solution("ContosoCore", "contoso")])
                : new EntityCollection(),
        };

        var dataSource = await Service(client).CreateDefinitionAsync(
            new CreateDefinitionBody("contoso_Site", "Site", null, (int)EnvironmentVariableType.DataSource, null, null, null),
            CancellationToken.None);
        var prefix = await Service(client).CreateDefinitionAsync(
            new CreateDefinitionBody("fabrikam_Url", "Url", null, (int)EnvironmentVariableType.String, null, null, "ContosoCore"),
            CancellationToken.None);
        var secret = await Service(client, onPremises: true).CreateDefinitionAsync(
            new CreateDefinitionBody("contoso_Pw", "Pw", null, (int)EnvironmentVariableType.Secret, null, null, null),
            CancellationToken.None);
        var badDefault = await Service(client).CreateDefinitionAsync(
            new CreateDefinitionBody("contoso_On", "On", null, (int)EnvironmentVariableType.Boolean, "true", null, null),
            CancellationToken.None);

        Assert.Equal("UnsupportedType", dataSource.Problem!.Code);
        Assert.Contains("contoso_", prefix.Problem!.Message);
        Assert.Equal("UnsupportedType", secret.Problem!.Code);
        Assert.Equal("Default value: Enter yes or no.", badDefault.Problem!.Message);
        Assert.Empty(client.Requests);
    }

    [Fact]
    public async Task Update_rejects_locked_fields_and_non_customizable_managed_definitions()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String, managed: true, customizable: false)])
                : new EntityCollection(),
        };

        var locked = await Service(client).UpdateDefinitionAsync(
            ApiUrlId.ToString(),
            new UpdateDefinitionBody("Name", null, null, "contoso_Other", null, null),
            CancellationToken.None);
        var managed = await Service(client).UpdateDefinitionAsync(
            ApiUrlId.ToString(),
            new UpdateDefinitionBody("Name", null, null, null, null, null),
            CancellationToken.None);

        Assert.Equal("LockedField", locked.Problem!.Code);
        Assert.Equal("NotCustomizable", managed.Problem!.Code);
        Assert.Empty(client.Requests);
    }

    [Fact]
    public async Task Update_writes_only_the_sent_fields()
    {
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(RetriesId, "contoso_Retries", EnvironmentVariableType.Number)])
                : new EntityCollection(),
        };

        var result = await Service(client).UpdateDefinitionAsync(
            RetriesId.ToString(),
            new UpdateDefinitionBody("Retries", null, "", null, null, "ContosoCore"),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var update = Assert.Single(client.Requests.OfType<UpdateRequest>());
        Assert.Equal("Retries", update.Target["displayname"]);
        Assert.Null(update.Target["defaultvalue"]);
        Assert.False(update.Target.Contains("description"));
        Assert.Equal("ContosoCore", update[EnvironmentVariablesService.SolutionUniqueNameParameter]);
    }

    [Fact]
    public async Task Delete_definition_checks_managed_state_and_dependencies_first()
    {
        var managedClient = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String, managed: true)])
                : new EntityCollection(),
        };
        var managed = await Service(managedClient).DeleteDefinitionAsync(ApiUrlId.ToString(), CancellationToken.None);
        Assert.Equal("ManagedDefinition", managed.Problem!.Code);
        Assert.Empty(managedClient.Requests);

        var flowId = Guid.NewGuid();
        var dependentClient = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String)])
                : new EntityCollection(),
            OnExecute = request => request is RetrieveDependenciesForDeleteRequest
                ? new RetrieveDependenciesForDeleteResponse
                {
                    Results =
                    {
                        ["EntityCollection"] = new EntityCollection(
                        [
                            new Entity("dependency", Guid.NewGuid())
                            {
                                ["dependentcomponenttype"] = new OptionSetValue(29),
                                ["dependentcomponentobjectid"] = flowId,
                            },
                        ]),
                    },
                }
                : throw new InvalidOperationException("Delete must not run."),
        };
        var dependent = await Service(dependentClient).DeleteDefinitionAsync(ApiUrlId.ToString(), CancellationToken.None);
        Assert.Equal(409, dependent.Problem!.Status);
        Assert.Equal("HasDependencies", dependent.Problem.Code);
        Assert.Equal(flowId.ToString("D"), Assert.Single(dependent.Problem.Dependencies!).ObjectId);
        var check = Assert.IsType<RetrieveDependenciesForDeleteRequest>(Assert.Single(dependentClient.Requests));
        Assert.Equal(380, check.ComponentType);
    }

    [Fact]
    public async Task Delete_definition_reports_value_rows_left_behind()
    {
        var leftover = Guid.NewGuid();
        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = query => query.EntityName == DefinitionTable
                ? new EntityCollection([Definition(ApiUrlId, "contoso_ApiUrl", EnvironmentVariableType.String)])
                : new EntityCollection([Value(leftover, ApiUrlId, "x")]),
        };

        var result = await Service(client).DeleteDefinitionAsync(ApiUrlId.ToString(), CancellationToken.None);

        Assert.Equal([leftover.ToString("D")], result.Value!.RemainingValueIds);
        var delete = Assert.Single(client.Requests.OfType<DeleteRequest>());
        Assert.Equal(DefinitionTable, delete.Target.LogicalName);
    }

    [Fact]
    public async Task Delete_value_refuses_managed_values_and_checks_dependencies_as_381()
    {
        var managedClient = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = _ => new EntityCollection([Value(ValueId, ApiUrlId, "x", managed: true)]),
        };
        var managed = await Service(managedClient).DeleteValueAsync(ValueId.ToString(), CancellationToken.None);
        Assert.Equal("ManagedValue", managed.Problem!.Code);
        Assert.Empty(managedClient.Requests);

        var client = new FakeEnvironmentVariablesClient
        {
            OnRetrieve = _ => new EntityCollection([Value(ValueId, ApiUrlId, "x")]),
        };
        var result = await Service(client).DeleteValueAsync(ValueId.ToString(), CancellationToken.None);
        Assert.Null(result.Problem);
        Assert.Equal(381, Assert.IsType<RetrieveDependenciesForDeleteRequest>(client.Requests[0]).ComponentType);
        Assert.Equal(ValueTable, Assert.IsType<DeleteRequest>(client.Requests[1]).Target.LogicalName);
    }

    [Fact]
    public void Faults_map_to_typed_problems()
    {
        Assert.Equal(403, EnvironmentVariablesFaults.From(Fault(EnvironmentVariablesFaults.PrivilegeDenied, "no")).Status);
        Assert.Equal(409, EnvironmentVariablesFaults.From(Fault(EnvironmentVariablesFaults.DuplicateRecord, "dup")).Status);
        Assert.Equal(429, EnvironmentVariablesFaults.From(Fault(EnvironmentVariablesFaults.NumberOfRequestsLimitExceeded, "slow")).Status);
        Assert.Equal(422, EnvironmentVariablesFaults.From(new InvalidOperationException("boom")).Status);
    }
}
