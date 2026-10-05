using System.Reflection;
using System.ServiceModel;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;
using PowerTools.API.Tools.BulkWorkflowExecution;
using Xunit;

namespace PowerTools.API.BulkWorkflowExecution.Tests;

public sealed class BulkWorkflowFetchXmlTests
{
    [Fact]
    public void Id_query_strips_attributes_and_orders_everywhere_and_orders_on_the_primary_id()
    {
        const string fetch = """
            <fetch page="3" count="50" paging-cookie="x" returntotalrecordcount="true">
              <entity name="account">
                <attribute name="name" />
                <all-attributes />
                <order attribute="name" descending="true" />
                <filter><condition attribute="statecode" operator="eq" value="0" /></filter>
                <link-entity name="contact" from="contactid" to="primarycontactid" alias="c">
                  <attribute name="fullname" />
                  <order attribute="fullname" />
                </link-entity>
              </entity>
            </fetch>
            """;

        var query = BulkWorkflowFetchXml.ToIdQuery(fetch, "account", "accountid");

        var root = XElement.Parse(query.FetchXml);
        Assert.Null(root.Attribute("page"));
        Assert.Null(root.Attribute("count"));
        Assert.Null(root.Attribute("paging-cookie"));
        Assert.Null(root.Attribute("returntotalrecordcount"));
        Assert.Equal("true", root.Attribute("distinct")?.Value);
        var entity = root.Element("entity")!;
        Assert.Equal(["accountid"], entity.Elements("attribute").Select(e => e.Attribute("name")!.Value).ToArray());
        Assert.Equal(["accountid"], entity.Elements("order").Select(e => e.Attribute("attribute")!.Value).ToArray());
        Assert.Empty(entity.Element("link-entity")!.Descendants("attribute"));
        Assert.Empty(entity.Element("link-entity")!.Descendants("order"));
        Assert.Empty(root.Descendants("all-attributes"));
        Assert.NotNull(entity.Element("filter"));
        Assert.Null(query.Top);
    }

    [Fact]
    public void Id_query_without_link_entities_does_not_add_distinct()
    {
        var query = BulkWorkflowFetchXml.ToIdQuery(
            "<fetch><entity name='email'><attribute name='subject'/></entity></fetch>",
            "email",
            "activityid");

        var root = XElement.Parse(query.FetchXml);
        Assert.Null(root.Attribute("distinct"));
        Assert.Equal("activityid", root.Element("entity")!.Element("attribute")!.Attribute("name")!.Value);
    }

    [Theory]
    [InlineData("<fetch aggregate='true'><entity name='account'><attribute name='accountid' aggregate='count' alias='n'/></entity></fetch>")]
    [InlineData("<fetch><entity name='account'><attribute name='name' groupby='true' alias='g'/></entity></fetch>")]
    public void Aggregate_queries_are_rejected(string fetch)
    {
        var check = BulkWorkflowFetchXml.Check(fetch, "account");

        Assert.Equal("AggregateNotSupported", check.Problem?.Code);
        Assert.Equal(400, check.Problem?.Status);
    }

    [Fact]
    public void A_root_entity_that_is_not_the_workflow_entity_is_rejected()
    {
        var check = BulkWorkflowFetchXml.Check("<fetch><entity name='contact'/></fetch>", "account");

        Assert.Equal("EntityMismatch", check.Problem?.Code);
        Assert.Contains("contact", check.Problem!.Message);
        Assert.Contains("account", check.Problem.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("<fetch><entity name='account'>")]
    [InlineData("<!DOCTYPE fetch [<!ENTITY x 'y'>]><fetch><entity name='account'/></fetch>")]
    [InlineData("<query><entity name='account'/></query>")]
    [InlineData("<fetch><entity name='account'/><entity name='account'/></fetch>")]
    public void Malformed_fetch_xml_is_rejected(string fetch)
    {
        var check = BulkWorkflowFetchXml.Check(fetch, "account");

        Assert.Equal("InvalidFetchXml", check.Problem?.Code);
    }

    [Fact]
    public void Top_is_a_cap_and_is_never_paged()
    {
        const string fetch = "<fetch top='10'><entity name='account'/></fetch>";
        Assert.Null(BulkWorkflowFetchXml.Check(fetch, "account").Problem);

        var query = BulkWorkflowFetchXml.ToIdQuery(fetch, "account", "accountid");
        var page = XElement.Parse(BulkWorkflowFetchXml.ForPage(query, 1, 5000, null));

        Assert.Equal(10, query.Top);
        Assert.Equal("10", page.Attribute("top")?.Value);
        Assert.Null(page.Attribute("page"));
        Assert.Null(page.Attribute("count"));
    }

    [Fact]
    public void Top_above_the_platform_maximum_is_rejected()
    {
        var check = BulkWorkflowFetchXml.Check("<fetch top='5001'><entity name='account'/></fetch>", "account");

        Assert.Equal("TopTooLarge", check.Problem?.Code);
    }

    [Fact]
    public void Pages_carry_page_count_and_cookie()
    {
        var query = BulkWorkflowFetchXml.ToIdQuery("<fetch><entity name='account'/></fetch>", "account", "accountid");

        var page = XElement.Parse(BulkWorkflowFetchXml.ForPage(query, 2, 500, "<cookie/>"));

        Assert.Equal("2", page.Attribute("page")?.Value);
        Assert.Equal("500", page.Attribute("count")?.Value);
        Assert.Equal("<cookie/>", page.Attribute("paging-cookie")?.Value);
    }
}

public sealed class BulkWorkflowExecutionServiceTests
{
    internal static readonly Guid WorkflowId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");

    [Fact]
    public async Task Workflows_are_activated_on_demand_classic_definitions_with_mode_and_run_as()
    {
        var realtime = Workflow(WorkflowId, "Approve", "account", mode: 1, runAs: 1, scope: 4);
        realtime["ismanaged"] = true;
        realtime["asyncautodelete"] = true;
        var fake = new FakeClient { OnQuery = _ => Page(false, null, realtime) };

        var result = await new BulkWorkflowExecutionService(fake).GetWorkflowsAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        var query = Assert.IsType<QueryExpression>(Assert.Single(fake.Queries));
        Assert.Equal("workflow", query.EntityName);
        AssertCondition(query, "category", ConditionOperator.Equal, 0);
        AssertCondition(query, "type", ConditionOperator.Equal, 1);
        AssertCondition(query, "statecode", ConditionOperator.Equal, 1);
        AssertCondition(query, "ondemand", ConditionOperator.Equal, true);
        AssertCondition(query, "primaryentity", ConditionOperator.NotEqual, "none");
        Assert.Contains("mode", query.ColumnSet.Columns);
        Assert.Contains("runas", query.ColumnSet.Columns);
        Assert.Equal("name", query.Orders[0].AttributeName);

        var row = Assert.Single(result.Value!.Workflows);
        Assert.Equal("realtime", row.Mode);
        Assert.Equal("callingUser", row.RunAs);
        Assert.Equal("organization", row.Scope);
        Assert.True(row.IsManaged);
        Assert.True(row.AsyncAutoDelete);
        Assert.Equal("account", row.PrimaryEntity);
    }

    [Fact]
    public async Task Views_read_system_and_personal_views_with_name_and_fetch_xml_only()
    {
        var fake = new FakeClient
        {
            OnQuery = query =>
            {
                var expression = (QueryExpression)query;
                var view = new Entity(expression.EntityName, Guid.NewGuid())
                {
                    ["name"] = expression.EntityName == "savedquery" ? "Active Accounts" : "My Accounts",
                    ["fetchxml"] = "<fetch><entity name='account'/></fetch>",
                };
                return Page(false, null, view);
            },
        };

        var result = await new BulkWorkflowExecutionService(fake).GetViewsAsync("account", CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(["savedquery", "userquery"], fake.Queries.Select(q => ((QueryExpression)q).EntityName).ToArray());
        foreach (var query in fake.Queries.Cast<QueryExpression>())
        {
            Assert.Equal(["fetchxml", "name"], query.ColumnSet.Columns.OrderBy(c => c).ToArray());
            AssertCondition(query, "querytype", ConditionOperator.Equal, 0);
            AssertCondition(query, "statecode", ConditionOperator.Equal, 0);
            AssertCondition(query, "returnedtypecode", ConditionOperator.Equal, "account");
            Assert.Equal("name", query.Orders[0].AttributeName);
        }

        Assert.Equal(["system", "personal"], result.Value!.Views.Select(v => v.Kind).ToArray());
    }

    [Fact]
    public async Task Views_reject_an_invalid_entity_name_without_a_server_call()
    {
        var fake = new FakeClient();

        var result = await new BulkWorkflowExecutionService(fake).GetViewsAsync("account'; drop", CancellationToken.None);

        Assert.Equal("InvalidEntity", result.Problem?.Code);
        Assert.Empty(fake.Queries);
    }

    [Fact]
    public async Task Count_follows_paging_cookies_and_counts_distinct_ids()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var fake = Counting("account", "accountid", tableType: "Standard", pages:
        [
            Page(true, "<cookie page='1'/>", Row("account", a), Row("account", b)),
            Page(false, null, Row("account", b)),
        ]);

        var result = await new BulkWorkflowExecutionService(fake).CountAsync(
            new CountBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='account'/></fetch>" },
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal("account", result.Value.Entity);
        var fetches = fake.Queries.OfType<FetchExpression>().Select(f => XElement.Parse(f.Query)).ToList();
        Assert.Equal(2, fetches.Count);
        Assert.Equal("5000", fetches[0].Attribute("count")?.Value);
        Assert.Equal("2", fetches[1].Attribute("page")?.Value);
        Assert.Equal("<cookie page='1'/>", fetches[1].Attribute("paging-cookie")?.Value);
    }

    [Fact]
    public async Task Count_pages_elastic_tables_at_500()
    {
        var fake = Counting("audit_log", "audit_logid", tableType: "Elastic", pages: [Page(false, null)]);

        var result = await new BulkWorkflowExecutionService(fake).CountAsync(
            new CountBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='audit_log'/></fetch>" },
            CancellationToken.None);

        Assert.Null(result.Problem);
        var fetch = XElement.Parse(fake.Queries.OfType<FetchExpression>().Single().Query);
        Assert.Equal("500", fetch.Attribute("count")?.Value);
    }

    [Fact]
    public async Task Count_fails_instead_of_truncating_when_no_paging_cookie_comes_back()
    {
        var fake = Counting("account", "accountid", tableType: null, pages:
        [
            Page(true, null, Row("account", Guid.NewGuid())),
        ]);

        var result = await new BulkWorkflowExecutionService(fake).CountAsync(
            new CountBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='account'/></fetch>" },
            CancellationToken.None);

        Assert.Equal("PagingCookieMissing", result.Problem?.Code);
    }

    [Fact]
    public async Task Count_rejects_a_workflow_that_is_not_an_activated_on_demand_workflow()
    {
        var fake = new FakeClient { OnQuery = _ => Page(false, null) };

        var result = await new BulkWorkflowExecutionService(fake).CountAsync(
            new CountBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='account'/></fetch>" },
            CancellationToken.None);

        Assert.Equal("WorkflowNotAvailable", result.Problem?.Code);
    }

    [Fact]
    public async Task Count_rejects_an_entity_mismatch_before_reading_metadata()
    {
        var fake = Counting("account", "accountid", tableType: null, pages: []);

        var result = await new BulkWorkflowExecutionService(fake).CountAsync(
            new CountBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='contact'/></fetch>" },
            CancellationToken.None);

        Assert.Equal("EntityMismatch", result.Problem?.Code);
        Assert.Empty(fake.Executes);
    }

    [Theory]
    [InlineData(0, 0, "InvalidBatchSize")]
    [InlineData(1001, 0, "InvalidBatchSize")]
    [InlineData(10, -1, "InvalidDelay")]
    [InlineData(10, 301, "InvalidDelay")]
    public async Task Runs_reject_settings_out_of_range(int batchSize, int delay, string code)
    {
        var fake = new FakeClient();

        var result = await new BulkWorkflowExecutionService(fake).PrepareRunAsync(
            new StartRunBody
            {
                WorkflowId = WorkflowId.ToString(),
                FetchXml = "<fetch><entity name='account'/></fetch>",
                BatchSize = batchSize,
                DelaySeconds = delay,
            },
            CancellationToken.None);

        Assert.Equal(code, result.Problem?.Code);
        Assert.Empty(fake.Queries);
    }

    [Fact]
    public async Task Runs_default_to_batches_of_100_and_no_delay()
    {
        var fake = Counting("account", "accountid", tableType: null, pages: []);

        var result = await new BulkWorkflowExecutionService(fake).PrepareRunAsync(
            new StartRunBody { WorkflowId = WorkflowId.ToString(), FetchXml = "<fetch><entity name='account'/></fetch>" },
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(100, result.Value!.BatchSize);
        Assert.Equal(0, result.Value.DelaySeconds);
        Assert.Equal(WorkflowId, result.Value.WorkflowId);
    }

    internal static FakeClient Counting(string entity, string primaryId, string? tableType, EntityCollection[] pages)
    {
        var index = 0;
        return new FakeClient
        {
            OnQuery = query => query switch
            {
                QueryExpression { EntityName: "workflow" } => Page(false, null, Workflow(WorkflowId, "Run", entity)),
                FetchExpression => pages[index++],
                _ => throw new InvalidOperationException("Unexpected query"),
            },
            OnExecute = request =>
            {
                var metadata = new EntityMetadata { LogicalName = entity };
                SetProperty(metadata, nameof(EntityMetadata.PrimaryIdAttribute), primaryId);
                if (tableType is not null) SetProperty(metadata, nameof(EntityMetadata.TableType), tableType);
                var response = new RetrieveEntityResponse();
                response.Results["EntityMetadata"] = metadata;
                Assert.Equal(entity, ((RetrieveEntityRequest)request).LogicalName);
                return response;
            },
        };
    }

    internal static Entity Workflow(Guid id, string name, string entity, int mode = 0, int runAs = 0, int scope = 1) =>
        new("workflow", id)
        {
            ["name"] = name,
            ["primaryentity"] = entity,
            ["mode"] = new OptionSetValue(mode),
            ["runas"] = new OptionSetValue(runAs),
            ["scope"] = new OptionSetValue(scope),
        };

    internal static Entity Row(string entity, Guid id) => new(entity, id);

    internal static EntityCollection Page(bool more, string? cookie, params Entity[] rows) =>
        new(rows.ToList()) { MoreRecords = more, PagingCookie = cookie };

    private static void AssertCondition(QueryExpression query, string attribute, ConditionOperator op, object value)
    {
        var condition = Assert.Single(query.Criteria.Conditions, c => c.AttributeName == attribute);
        Assert.Equal(op, condition.Operator);
        Assert.Equal(value, condition.Values[0]);
    }

    private static void SetProperty(object target, string name, object value)
    {
        var property = target.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        property.SetValue(target, value);
    }
}

public sealed class BulkWorkflowRunExecutorTests
{
    private static readonly Guid WorkflowId = BulkWorkflowExecutionServiceTests.WorkflowId;

    [Fact]
    public async Task An_exact_multiple_of_the_batch_size_sends_no_empty_batch()
    {
        var ids = Ids(4);
        var fake = Running(ids, _ => Faults());
        var job = Job(batchSize: 2);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        var batches = fake.Executes.OfType<ExecuteMultipleRequest>().ToList();
        Assert.Equal([2, 2], batches.Select(b => b.Requests.Count).ToArray());
        Assert.All(batches, b =>
        {
            Assert.True(b.Settings.ContinueOnError);
            Assert.False(b.Settings.ReturnResponses);
        });
        var first = Assert.IsType<ExecuteWorkflowRequest>(batches[0].Requests[0]);
        Assert.Equal(WorkflowId, first.WorkflowId);
        Assert.Equal(ids[0], first.EntityId);
        var dto = job.ToDto();
        Assert.Equal("completed", dto.Status);
        Assert.Equal(4, dto.Total);
        Assert.Equal(4, dto.Processed);
        Assert.Equal(4, dto.Succeeded);
        Assert.Equal(0, dto.Failed);
    }

    [Fact]
    public async Task Faults_map_to_their_record_by_request_index()
    {
        var ids = Ids(3);
        var fake = Running(ids, _ => Faults((2, unchecked((int)0x80040220), "Missing privilege")));
        var job = Job(batchSize: 10);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(2, dto.Succeeded);
        Assert.Equal(1, dto.Failed);
        var error = Assert.Single(dto.Errors);
        Assert.Equal(ids[2].ToString(), error.RecordId);
        Assert.Equal("Missing privilege (0x80040220)", error.Message);
    }

    [Fact]
    public async Task Stop_takes_effect_after_the_batch_in_flight()
    {
        var ids = Ids(5);
        var job = Job(batchSize: 2);
        var fake = Running(ids, _ =>
        {
            job.RequestCancel();
            Assert.Equal("cancelling", job.ToDto().Status);
            return Faults();
        });

        await Executor(fake).RunAsync(job, CancellationToken.None);

        Assert.Single(fake.Executes.OfType<ExecuteMultipleRequest>());
        var dto = job.ToDto();
        Assert.Equal("cancelled", dto.Status);
        Assert.Equal(2, dto.Processed);
        Assert.Equal(5, dto.Total);
    }

    [Fact]
    public async Task The_delay_runs_between_batches_only()
    {
        var delay = new FakeDelay();
        var fake = Running(Ids(5), _ => Faults());
        var job = Job(batchSize: 2, delaySeconds: 7);

        await new BulkWorkflowRunExecutor(fake, delay, TimeProvider.System).RunAsync(job, CancellationToken.None);

        Assert.Equal([TimeSpan.FromSeconds(7), TimeSpan.FromSeconds(7)], delay.Waits);
    }

    [Fact]
    public async Task A_max_batch_size_fault_shrinks_and_resends_the_same_records()
    {
        var ids = Ids(3);
        var calls = 0;
        var fake = Running(ids, request =>
        {
            calls++;
            if (calls == 1)
            {
                var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x8004428C), Message = "Too many" };
                fault.ErrorDetails["MaxBatchSize"] = 2;
                throw new FaultException<OrganizationServiceFault>(fault, "Too many");
            }

            return Faults();
        });
        var job = Job(batchSize: 3);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        var sizes = fake.Executes.OfType<ExecuteMultipleRequest>().Select(b => b.Requests.Count).ToArray();
        Assert.Equal([3, 2, 1], sizes);
        Assert.Equal(3, job.ToDto().Succeeded);
        Assert.Equal("completed", job.ToDto().Status);
    }

    [Fact]
    public async Task A_batch_that_did_not_finish_is_not_resent_and_its_records_are_outcome_unknown()
    {
        var ids = Ids(4);
        var fake = Running(ids, _ => throw new TimeoutException("The request timed out."));
        var job = Job(batchSize: 2);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        Assert.Single(fake.Executes.OfType<ExecuteMultipleRequest>());
        var dto = job.ToDto();
        Assert.Equal("failed", dto.Status);
        Assert.Equal(2, dto.Processed);
        Assert.Equal(2, dto.Failed);
        Assert.All(dto.Errors, e => Assert.Equal(BulkWorkflowRunExecutor.UnknownOutcomeMessage, e.Message));
        Assert.Contains("unknown outcome", dto.Message);
    }

    [Fact]
    public async Task Service_protection_after_retries_stops_the_run_without_counting_the_batch()
    {
        var fake = Running(Ids(2), _ =>
        {
            var fault = new OrganizationServiceFault { ErrorCode = BulkWorkflowFaults.NumberOfRequestsLimitExceeded, Message = "Limit" };
            throw new FaultException<OrganizationServiceFault>(fault, "Limit");
        });
        var job = Job(batchSize: 2);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal("failed", dto.Status);
        Assert.Equal(0, dto.Processed);
        Assert.Contains("service protection", dto.Message);
    }

    [Fact]
    public async Task A_batch_where_every_record_says_not_on_demand_stops_the_run()
    {
        var ids = Ids(4);
        var fake = Running(ids, _ => Faults(
            (0, BulkWorkflowFaults.ExecuteNotOnDemandWorkflow, "x"),
            (1, BulkWorkflowFaults.ExecuteNotOnDemandWorkflow, "x")));
        var job = Job(batchSize: 2);

        await Executor(fake).RunAsync(job, CancellationToken.None);

        Assert.Single(fake.Executes.OfType<ExecuteMultipleRequest>());
        var dto = job.ToDto();
        Assert.Equal("failed", dto.Status);
        Assert.Equal(2, dto.Failed);
        Assert.StartsWith("The workflow is no longer activated or on-demand.", dto.Errors[0].Message);
    }

    [Fact]
    public void The_error_list_is_capped()
    {
        var job = Job(batchSize: 1000);
        job.MarkRunning(600);
        var errors = Enumerable.Range(0, 600).Select(i => new RunErrorDto { RecordId = i.ToString(), Message = "x" }).ToList();

        job.RecordBatch(600, errors, TimeSpan.FromSeconds(1));

        var dto = job.ToDto();
        Assert.Equal(BulkWorkflowLimits.MaxErrors, dto.Errors.Count);
        Assert.True(dto.ErrorsCapped);
        Assert.Equal(600, dto.Failed);
    }

    [Fact]
    public void Cancel_before_the_snapshot_finishes_ends_cancelled()
    {
        var job = Job(batchSize: 10);
        job.RequestCancel();
        Assert.True(job.StopRequested);
        Assert.True(job.StopToken.IsCancellationRequested);

        job.Finish();

        Assert.Equal("cancelled", job.ToDto().Status);
    }

    [Theory]
    [InlineData(0, 10, 100, 10, 0, null)]
    [InlineData(2, 10, 0, 10, 0, 0)]
    [InlineData(2, 10, 30, 10, 0, 15)]
    [InlineData(1, 4, 25, 10, 2, 18)]
    public void Estimated_time_is_average_batch_time_plus_delay_times_remaining_batches(
        int completed, int batchSeconds, int remaining, int batchSize, int delay, int? expected)
    {
        Assert.Equal(
            expected,
            BulkWorkflowEstimate.SecondsRemaining(completed, TimeSpan.FromSeconds(batchSeconds), remaining, batchSize, delay));
    }

    private static List<Guid> Ids(int count) =>
        Enumerable.Range(1, count).Select(i => Guid.Parse($"bbbbbbbb-bbbb-bbbb-bbbb-{i:D12}")).ToList();

    private static BulkWorkflowJob Job(int batchSize, int delaySeconds = 0) =>
        new(
            new PreparedRun
            {
                WorkflowId = WorkflowId,
                Query = BulkWorkflowFetchXml.ToIdQuery("<fetch><entity name='account'/></fetch>", "account", "accountid"),
                PageSize = 5000,
                BatchSize = batchSize,
                DelaySeconds = delaySeconds,
            },
            new OnlineConnectionContext("https://dev.example.test", "token"),
            DateTimeOffset.UnixEpoch);

    private static BulkWorkflowRunExecutor Executor(FakeClient fake) =>
        new(fake, new FakeDelay(), TimeProvider.System);

    private static FakeClient Running(List<Guid> ids, Func<OrganizationRequest, OrganizationResponse> onExecute) =>
        new()
        {
            OnQuery = _ => BulkWorkflowExecutionServiceTests.Page(
                false,
                null,
                ids.Select(id => BulkWorkflowExecutionServiceTests.Row("account", id)).ToArray()),
            OnExecute = onExecute,
        };

    private static ExecuteMultipleResponse Faults(params (int Index, int Code, string Message)[] faults)
    {
        var items = new ExecuteMultipleResponseItemCollection();
        foreach (var (index, code, message) in faults)
        {
            items.Add(new ExecuteMultipleResponseItem
            {
                RequestIndex = index,
                Fault = new OrganizationServiceFault { ErrorCode = code, Message = message },
            });
        }

        var response = new ExecuteMultipleResponse();
        response.Results["Responses"] = items;
        response.Results["IsFaulted"] = faults.Length > 0;
        return response;
    }
}

internal sealed class FakeClient : IBulkWorkflowClient
{
    public Func<QueryBase, EntityCollection> OnQuery { get; init; } = _ => new EntityCollection();
    public Func<OrganizationRequest, OrganizationResponse> OnExecute { get; init; } =
        _ => throw new InvalidOperationException("Unexpected execute");
    public List<QueryBase> Queries { get; } = [];
    public List<OrganizationRequest> Executes { get; } = [];

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        Queries.Add(query);
        return Task.FromResult(OnQuery(query));
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Executes.Add(request);
        return Task.FromResult(OnExecute(request));
    }
}

internal sealed class FakeDelay : IBulkWorkflowDelay
{
    public List<TimeSpan> Waits { get; } = [];

    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        Waits.Add(delay);
        return Task.CompletedTask;
    }
}
