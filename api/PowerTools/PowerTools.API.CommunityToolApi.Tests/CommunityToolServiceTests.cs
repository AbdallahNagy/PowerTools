using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.CommunityToolApi;
using Xunit;

namespace PowerTools.API.CommunityToolApi.Tests;

public sealed class CommunityToolServiceTests
{
    private static readonly CancellationToken None = CancellationToken.None;

    // ── data/retrieve ────────────────────────────────────────────────────────

    [Fact]
    public async Task Retrieve_returns_a_data_record_with_tagged_values_and_formatted_values()
    {
        var id = Guid.Parse("6F1C2B1E-0A4D-4C58-9B3E-2F6A7D8E9C10");
        var fake = new FakeCommunityToolClient
        {
            RetrieveResult = new Entity("account", id)
            {
                ["name"] = "Contoso",
                ["statecode"] = new OptionSetValue(0),
            },
        };
        fake.RetrieveResult.FormattedValues["statecode"] = "Active";

        var result = await new CommunityToolService(fake).RetrieveAsync(
            Json.Body<RetrieveRecordRequest>($$$"""{"table":"account","id":"{{{id}}}","columns":["name","statecode"]}"""),
            None);

        Assert.Null(result.Problem);
        Assert.Equal(("account", id), (fake.LastRetrieve!.Value.Table, fake.LastRetrieve.Value.Id));
        Assert.Equal(["name", "statecode"], fake.LastRetrieve.Value.Columns.Columns);
        Assert.Equal(
            """{"logicalName":"account","id":"6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10","values":{"name":"Contoso","statecode":{"$type":"OptionSetValue","value":0}},"formatted":{"statecode":"Active"}}""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Retrieve_with_no_columns_is_bad_input()
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).RetrieveAsync(
            Json.Body<RetrieveRecordRequest>($$$"""{"table":"account","id":"{{{Guid.NewGuid()}}}","columns":[]}"""),
            None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "columns must list at least one column");
        Assert.Empty(fake.Calls);
    }

    [Theory]
    [InlineData("""{"table":"","id":"6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10","columns":["name"]}""", "table")]
    [InlineData("""{"table":"account","id":"nope","columns":["name"]}""", "id")]
    public async Task Retrieve_rejects_missing_table_and_bad_id(string body, string mentioned)
    {
        var result = await new CommunityToolService(new FakeCommunityToolClient()).RetrieveAsync(
            Json.Body<RetrieveRecordRequest>(body), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", mentioned);
    }

    [Fact]
    public async Task Retrieve_of_a_missing_record_is_404()
    {
        var result = await new CommunityToolService(new FakeCommunityToolClient()).RetrieveAsync(
            Json.Body<RetrieveRecordRequest>($$$"""{"table":"account","id":"{{{Guid.NewGuid()}}}","columns":["name"]}"""),
            None);

        AssertProblem(result.Problem, 404, "DataverseFault", "Not found.");
        Assert.Equal(CommunityToolFaults.ObjectDoesNotExist, result.Problem!.DataverseCode);
    }

    // ── data/fetch ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Fetch_with_more_records_returns_the_cookie_and_page()
    {
        var fake = new FakeCommunityToolClient
        {
            FetchResult = new EntityCollection([new Entity("account", Guid.NewGuid()) { ["name"] = "Contoso" }])
            {
                MoreRecords = true,
                PagingCookie = "<cookie page=\"2\" />",
            },
        };

        var result = await new CommunityToolService(fake).FetchAsync(
            Json.Body<FetchRecordsRequest>("""{"fetchXml":"<fetch><entity name='account'><attribute name='name'/></entity></fetch>","page":2,"pagingCookie":"<cookie page=\"1\" />"}"""),
            None);

        Assert.Null(result.Problem);
        Assert.True(result.Value!.MoreRecords);
        Assert.Equal("<cookie page=\"2\" />", result.Value.PagingCookie);
        Assert.Equal(2, result.Value.Page);
        Assert.Equal("Contoso", Assert.Single(result.Value.Records).Values["name"]);
        Assert.Contains("page=\"2\"", fake.LastFetchXml);
        Assert.Contains("count=\"500\"", fake.LastFetchXml);
        Assert.Contains("paging-cookie=\"&lt;cookie page=&quot;1&quot; /&gt;\"", fake.LastFetchXml);
    }

    [Fact]
    public async Task Fetch_page_defaults_to_one_and_no_more_records_returns_a_null_cookie()
    {
        var fake = new FakeCommunityToolClient { FetchResult = new EntityCollection { MoreRecords = false, PagingCookie = "<cookie />" } };

        var result = await new CommunityToolService(fake).FetchAsync(
            Json.Body<FetchRecordsRequest>("""{"fetchXml":"<fetch><entity name='account'/></fetch>"}"""), None);

        Assert.Equal(1, result.Value!.Page);
        Assert.False(result.Value.MoreRecords);
        Assert.Null(result.Value.PagingCookie);
        Assert.Contains("page=\"1\"", fake.LastFetchXml);
    }

    [Fact]
    public async Task Fetch_page_size_is_capped_at_5000()
    {
        var fake = new FakeCommunityToolClient();

        await new CommunityToolService(fake).FetchAsync(
            Json.Body<FetchRecordsRequest>("""{"fetchXml":"<fetch><entity name='account'/></fetch>","pageSize":9000}"""), None);

        Assert.Contains("count=\"5000\"", fake.LastFetchXml);
    }

    [Fact]
    public async Task Fetch_with_top_is_sent_without_paging()
    {
        var fake = new FakeCommunityToolClient();

        await new CommunityToolService(fake).FetchAsync(
            Json.Body<FetchRecordsRequest>("""{"fetchXml":"<fetch top='5'><entity name='account'/></fetch>"}"""), None);

        Assert.DoesNotContain("count=", fake.LastFetchXml);
        Assert.DoesNotContain("page=", fake.LastFetchXml);
    }

    [Theory]
    [InlineData("""{"fetchXml":"<fetch>"}""", "FetchXML")]
    [InlineData("""{"fetchXml":"<query/>"}""", "<fetch>")]
    [InlineData("""{"fetchXml":"<fetch/>"}""", "<entity>")]
    [InlineData("""{"fetchXml":"<fetch><entity name='a'/></fetch>","page":0}""", "page")]
    [InlineData("""{"fetchXml":"<fetch><entity name='a'/></fetch>","pageSize":0}""", "pageSize")]
    public async Task Fetch_rejects_bad_input(string body, string mentioned)
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).FetchAsync(Json.Body<FetchRecordsRequest>(body), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", mentioned);
        Assert.Empty(fake.Calls);
    }

    // ── data/create, update, delete ──────────────────────────────────────────

    [Fact]
    public async Task Create_decodes_values_and_returns_the_lowercase_id()
    {
        var parent = Guid.NewGuid();
        var fake = new FakeCommunityToolClient { CreatedId = Guid.Parse("ABCDEF00-0000-0000-0000-000000000001") };

        var result = await new CommunityToolService(fake).CreateAsync(
            Json.Body<CreateRecordRequest>($$$$"""
            {"table":"account","values":{"name":"Contoso","parentaccountid":{"$type":"EntityReference","logicalName":"account","id":"{{{{parent}}}}"}}}
            """),
            None);

        Assert.Equal("""{"id":"abcdef00-0000-0000-0000-000000000001"}""", Json.Serialize(result.Value));
        Assert.Equal("account", fake.LastCreate!.LogicalName);
        Assert.Equal("Contoso", fake.LastCreate["name"]);
        Assert.Equal(parent, fake.LastCreate.GetAttributeValue<EntityReference>("parentaccountid").Id);
    }

    [Fact]
    public async Task Unknown_type_tag_is_bad_input_naming_the_type()
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).CreateAsync(
            Json.Body<CreateRecordRequest>("""{"table":"account","values":{"x":{"$type":"Mystery","value":1}}}"""), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "Mystery");
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task Update_sends_the_id_and_values_and_returns_an_empty_object()
    {
        var id = Guid.NewGuid();
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).UpdateAsync(
            Json.Body<UpdateRecordRequest>($$$"""{"table":"account","id":"{{{id}}}","values":{"name":null}}"""), None);

        Assert.Equal("{}", Json.Serialize(result.Value));
        Assert.Equal(id, fake.LastUpdate!.Id);
        Assert.True(fake.LastUpdate.Contains("name"));
        Assert.Null(fake.LastUpdate["name"]);
    }

    [Fact]
    public async Task Delete_sends_the_table_and_id()
    {
        var id = Guid.NewGuid();
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).DeleteAsync(
            Json.Body<DeleteRecordRequest>($$$"""{"table":"account","id":"{{{id}}}"}"""), None);

        Assert.Null(result.Problem);
        Assert.Equal(("account", id), fake.LastDelete);
    }

    // ── faults ───────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(-2147015902)]
    [InlineData(-2147015903)]
    [InlineData(-2147015898)]
    public async Task Service_protection_faults_map_to_throttled(int code)
    {
        var fake = new FakeCommunityToolClient { Throw = FakeCommunityToolClient.Fault(code, "Slow down.") };

        var result = await new CommunityToolService(fake).DeleteAsync(
            Json.Body<DeleteRecordRequest>($$$"""{"table":"account","id":"{{{Guid.NewGuid()}}}"}"""), None);

        AssertProblem(result.Problem, 429, "Throttled", "Slow down.");
        Assert.Equal(code, result.Problem!.DataverseCode);
    }

    [Fact]
    public async Task Other_faults_map_to_dataverse_fault_502()
    {
        var fake = new FakeCommunityToolClient { Throw = FakeCommunityToolClient.Fault(-2147220891, "Bad attribute.") };

        var result = await new CommunityToolService(fake).DeleteAsync(
            Json.Body<DeleteRecordRequest>($$$"""{"table":"account","id":"{{{Guid.NewGuid()}}}"}"""), None);

        AssertProblem(result.Problem, 502, "DataverseFault", "Bad attribute.");
        Assert.Equal(-2147220891, result.Problem!.DataverseCode);
    }

    [Fact]
    public void Error_body_omits_a_missing_dataverse_code()
    {
        Assert.Equal(
            """{"code":"InvalidRequest","message":"m"}""",
            Json.Serialize(CommunityToolFaults.InvalidRequest("m").ToError()));
        Assert.Equal(
            """{"code":"Throttled","message":"m","dataverseCode":-2147015902}""",
            Json.Serialize(new CommunityToolProblem(429, "Throttled", "m", -2147015902).ToError()));
    }

    // ── data/associate, disassociate ─────────────────────────────────────────

    [Fact]
    public async Task Associate_sends_the_relationship_and_related_references()
    {
        var id = Guid.NewGuid();
        var related = Guid.NewGuid();
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).AssociateAsync(
            Json.Body<RelateRecordsRequest>($$$"""
            {"table":"account","id":"{{{id}}}","relationship":"account_contacts","related":[{"logicalName":"contact","id":"{{{related}}}"}]}
            """),
            None);

        Assert.Null(result.Problem);
        Assert.Equal(nameof(FakeCommunityToolClient.AssociateAsync), Assert.Single(fake.Calls));
        Assert.Equal("account_contacts", fake.LastRelate!.Value.Relationship.SchemaName);
        Assert.Equal(("contact", related), (fake.LastRelate.Value.Related[0].LogicalName, fake.LastRelate.Value.Related[0].Id));
    }

    [Fact]
    public async Task Disassociate_requires_related_records()
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).DisassociateAsync(
            Json.Body<RelateRecordsRequest>($$$"""{"table":"account","id":"{{{Guid.NewGuid()}}}","relationship":"r","related":[]}"""),
            None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "related");
        Assert.Empty(fake.Calls);
    }

    // ── data/execute ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("""{"message":"","parameters":{}}""")]
    [InlineData("""{"message":"   ","parameters":{}}""")]
    [InlineData("""{"parameters":{}}""")]
    [InlineData("""{"message":"Who Am I","parameters":{}}""")]
    [InlineData("""{"message":"1WhoAmI","parameters":{}}""")]
    [InlineData("""{"message":"WhoAmI;drop","parameters":{}}""")]
    public async Task Execute_with_an_empty_or_malformed_message_is_bad_input(string body)
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).ExecuteAsync(Json.Body<ExecuteMessageRequest>(body), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "message");
        Assert.Empty(fake.Calls);
    }

    [Theory]
    [InlineData("ExecuteMultiple")]
    [InlineData("ExecuteTransaction")]
    [InlineData("ExecuteAsync")]
    public async Task Execute_refuses_wrapper_messages(string message)
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).ExecuteAsync(
            Json.Body<ExecuteMessageRequest>($$$"""{"message":"{{{message}}}","parameters":{}}"""), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", message);
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task Execute_decodes_parameters_and_encodes_results()
    {
        var userId = Guid.NewGuid();
        var fake = new FakeCommunityToolClient
        {
            OnExecute = _ =>
            {
                var response = new OrganizationResponse();
                response.Results["UserId"] = userId;
                response.Results["Count"] = 3;
                response.Results["Target"] = new EntityReference("systemuser", userId) { Name = "Ada" };
                response.Results["Raw"] = new object();
                return response;
            },
        };

        var result = await new CommunityToolService(fake).ExecuteAsync(
            Json.Body<ExecuteMessageRequest>($$$"""
            {"message":"new_DoThing","parameters":{
              "Target":{"$type":"Entity","logicalName":"account","values":{"name":"Contoso"}},
              "Flag":true}}
            """),
            None);

        Assert.Null(result.Problem);
        var request = fake.LastExecute!;
        Assert.Equal("new_DoThing", request.RequestName);
        Assert.Equal("Contoso", Assert.IsType<Entity>(request.Parameters["Target"])["name"]);
        Assert.Equal(true, request.Parameters["Flag"]);
        Assert.Equal(
            $$$"""{"results":{"UserId":{"$type":"Guid","value":"{{{userId}}}"},"Count":3,"Target":{"$type":"EntityReference","logicalName":"systemuser","id":"{{{userId}}}","name":"Ada"},"Raw":"System.Object"}}""",
            Json.Serialize(result.Value));
    }

    // ── data/batch ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Batch_of_201_operations_is_bad_input()
    {
        var fake = new FakeCommunityToolClient();
        var operations = string.Join(",", Enumerable.Repeat("""{"op":"create","table":"account","values":{}}""", 201));

        var result = await new CommunityToolService(fake).BatchAsync(
            Json.Body<BatchRequest>($$$"""{"operations":[{{{operations}}}],"continueOnError":false}"""), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "200");
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task Batch_responses_line_up_with_operations_when_one_fails()
    {
        var created = Guid.NewGuid();
        var fake = new FakeCommunityToolClient
        {
            OnExecute = _ => BatchResponse(
                new ExecuteMultipleResponseItem { RequestIndex = 2, Response = new DeleteResponse() },
                new ExecuteMultipleResponseItem
                {
                    RequestIndex = 1,
                    Fault = new OrganizationServiceFault { ErrorCode = CommunityToolFaults.ObjectDoesNotExist, Message = "Gone." },
                },
                new ExecuteMultipleResponseItem { RequestIndex = 0, Response = CreateResponse(created) }),
        };

        var result = await new CommunityToolService(fake).BatchAsync(
            Json.Body<BatchRequest>($$$"""
            {"continueOnError":true,"operations":[
              {"op":"create","table":"account","values":{"name":"A"}},
              {"op":"update","table":"account","id":"{{{Guid.NewGuid()}}}","values":{"name":"B"}},
              {"op":"delete","table":"account","id":"{{{Guid.NewGuid()}}}"}
            ]}
            """),
            None);

        Assert.Null(result.Problem);
        var request = Assert.IsType<ExecuteMultipleRequest>(fake.LastExecute);
        Assert.True(request.Settings.ContinueOnError);
        Assert.True(request.Settings.ReturnResponses);
        Assert.IsType<CreateRequest>(request.Requests[0]);
        Assert.IsType<UpdateRequest>(request.Requests[1]);
        Assert.IsType<DeleteRequest>(request.Requests[2]);
        Assert.Equal(
            $$$"""{"responses":[{"ok":true,"id":"{{{created}}}"},{"ok":false,"error":{"code":"DataverseFault","message":"Gone. (0x80040217)","dataverseCode":-2147220969}},{"ok":true}]}""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Batch_operations_after_a_stopping_failure_are_reported_as_not_run()
    {
        var fake = new FakeCommunityToolClient
        {
            OnExecute = _ => BatchResponse(new ExecuteMultipleResponseItem
            {
                RequestIndex = 0,
                Fault = new OrganizationServiceFault { ErrorCode = -2147015902, Message = "Slow down." },
            }),
        };

        var result = await new CommunityToolService(fake).BatchAsync(
            Json.Body<BatchRequest>($$$"""
            {"continueOnError":false,"operations":[
              {"op":"delete","table":"account","id":"{{{Guid.NewGuid()}}}"},
              {"op":"delete","table":"account","id":"{{{Guid.NewGuid()}}}"}
            ]}
            """),
            None);

        Assert.Equal(2, result.Value!.Responses.Count);
        Assert.Equal("Throttled", result.Value.Responses[0].Error!.Code);
        Assert.False(result.Value.Responses[1].Ok);
        Assert.Equal("Cancelled", result.Value.Responses[1].Error!.Code);
    }

    [Theory]
    [InlineData("""{"operations":[],"continueOnError":false}""", "operations")]
    [InlineData("""{"operations":[{"op":"upsert","table":"account"}],"continueOnError":false}""", "operations[0]")]
    [InlineData("""{"operations":[{"op":"delete","table":"account","id":"x"}],"continueOnError":false}""", "operations[0]")]
    public async Task Batch_rejects_bad_operations(string body, string mentioned)
    {
        var fake = new FakeCommunityToolClient();

        var result = await new CommunityToolService(fake).BatchAsync(Json.Body<BatchRequest>(body), None);

        AssertProblem(result.Problem, 400, "InvalidRequest", mentioned);
        Assert.Empty(fake.Calls);
    }

    // ── metadata ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Tables_list_the_public_tables()
    {
        var fake = new FakeCommunityToolClient();
        fake.Tables.Add(Builders.Table("account", "Account"));
        var hidden = Builders.Table("hidden");
        Builders.SetInternal(hidden, nameof(EntityMetadata.IsPrivate), true);
        fake.Tables.Add(hidden);

        var result = await new CommunityToolService(fake).GetTablesAsync(None);

        Assert.Equal(
            """[{"logicalName":"account","displayName":"Account","entitySetName":"accounts","primaryIdAttribute":"accountid","primaryNameAttribute":"name","isCustom":false}]""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Missing_table_is_404()
    {
        var result = await new CommunityToolService(new FakeCommunityToolClient()).GetTableAsync("nope", None);

        Assert.Equal(404, result.Problem!.Status);
    }

    [Fact]
    public async Task Columns_report_type_requirement_and_lookup_targets()
    {
        var fake = new FakeCommunityToolClient();
        var table = Builders.Table("contact");
        var lookup = Builders.Attribute(new LookupAttributeMetadata { Targets = ["account", "contact"] }, "parentcustomerid", "Company");
        lookup.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.ApplicationRequired);
        var name = Builders.Attribute(new StringAttributeMetadata(), "fullname", "Full Name");
        Builders.SetInternal(name, nameof(AttributeMetadata.IsCustomAttribute), true);
        Builders.SetInternal(table, nameof(EntityMetadata.Attributes), new AttributeMetadata[] { lookup, name });
        fake.ByName["contact"] = table;

        var result = await new CommunityToolService(fake).GetColumnsAsync("contact", None);

        Assert.Equal(EntityFilters.Attributes, fake.LastFilters);
        Assert.Equal(
            """[{"logicalName":"parentcustomerid","displayName":"Company","type":"Lookup","isCustom":false,"requiredLevel":"ApplicationRequired","targets":["account","contact"]},{"logicalName":"fullname","displayName":"Full Name","type":"String","isCustom":true,"requiredLevel":"None","targets":[]}]""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Relationships_report_each_kind()
    {
        var fake = new FakeCommunityToolClient();
        var table = Builders.Table("account");
        var oneToMany = new OneToManyRelationshipMetadata { SchemaName = "account_contacts" };
        SetRelationship(oneToMany, referenced: "account", referencing: "contact", column: "parentcustomerid");
        var manyToOne = new OneToManyRelationshipMetadata { SchemaName = "account_primarycontact" };
        SetRelationship(manyToOne, referenced: "contact", referencing: "account", column: "primarycontactid");
        var manyToMany = new ManyToManyRelationshipMetadata { SchemaName = "accountleads_association", Entity1LogicalName = "account", Entity2LogicalName = "lead" };
        Builders.SetInternal(table, nameof(EntityMetadata.OneToManyRelationships), new[] { oneToMany });
        Builders.SetInternal(table, nameof(EntityMetadata.ManyToOneRelationships), new[] { manyToOne });
        Builders.SetInternal(table, nameof(EntityMetadata.ManyToManyRelationships), new[] { manyToMany });
        fake.ByName["account"] = table;

        var result = await new CommunityToolService(fake).GetRelationshipsAsync("account", None);

        Assert.Equal(EntityFilters.Relationships, fake.LastFilters);
        Assert.Equal(
            """[{"schemaName":"account_contacts","kind":"1:N","referencedTable":"account","referencingTable":"contact","referencingColumn":"parentcustomerid"},{"schemaName":"account_primarycontact","kind":"N:1","referencedTable":"contact","referencingTable":"account","referencingColumn":"primarycontactid"},{"schemaName":"accountleads_association","kind":"N:N","referencedTable":"lead","referencingTable":"account","referencingColumn":null}]""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Choices_list_option_values_and_labels()
    {
        var fake = new FakeCommunityToolClient();
        var picklist = Builders.Attribute(new PicklistAttributeMetadata(), "industrycode");
        picklist.OptionSet = new OptionSetMetadata([
            new OptionMetadata(Builders.Text("Accounting"), 1),
            new OptionMetadata(Builders.Text("Agriculture"), 2),
        ]);
        fake.Columns["account.industrycode"] = picklist;

        var result = await new CommunityToolService(fake).GetChoicesAsync("account", "industrycode", None);

        Assert.Equal(
            """[{"value":1,"label":"Accounting"},{"value":2,"label":"Agriculture"}]""",
            Json.Serialize(result.Value));
    }

    [Fact]
    public async Task Choices_of_a_column_that_is_not_a_choice_is_bad_input()
    {
        var fake = new FakeCommunityToolClient();
        fake.Columns["account.name"] = Builders.Attribute(new StringAttributeMetadata(), "name");

        var result = await new CommunityToolService(fake).GetChoicesAsync("account", "name", None);

        AssertProblem(result.Problem, 400, "InvalidRequest", "name");
    }

    [Fact]
    public async Task Choices_of_a_missing_column_is_404()
    {
        var result = await new CommunityToolService(new FakeCommunityToolClient()).GetChoicesAsync("account", "nope", None);

        Assert.Equal(404, result.Problem!.Status);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static void AssertProblem(CommunityToolProblem? problem, int status, string code, string mentioned)
    {
        Assert.NotNull(problem);
        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Code);
        Assert.Contains(mentioned, problem.Message);
    }

    private static void SetRelationship(OneToManyRelationshipMetadata relationship, string referenced, string referencing, string column)
    {
        Builders.SetInternal(relationship, nameof(OneToManyRelationshipMetadata.ReferencedEntity), referenced);
        Builders.SetInternal(relationship, nameof(OneToManyRelationshipMetadata.ReferencingEntity), referencing);
        Builders.SetInternal(relationship, nameof(OneToManyRelationshipMetadata.ReferencingAttribute), column);
    }

    private static CreateResponse CreateResponse(Guid id)
    {
        var response = new CreateResponse();
        response.Results["id"] = id;
        return response;
    }

    private static ExecuteMultipleResponse BatchResponse(params ExecuteMultipleResponseItem[] items)
    {
        var collection = new ExecuteMultipleResponseItemCollection();
        collection.AddRange(items);
        var response = new ExecuteMultipleResponse();
        response.Results["Responses"] = collection;
        response.Results["IsFaulted"] = items.Any(item => item.Fault is not null);
        return response;
    }
}
