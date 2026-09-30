using System.ServiceModel;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.WorkflowActivities;
using Xunit;

namespace PowerTools.API.WorkflowActivities.Tests;

public sealed class FakeWorkflowActivitiesClient : IWorkflowActivitiesClient
{
    public List<QueryBase> Queries { get; } = [];
    public List<(string Entity, int Page, string? Cookie, int Count)> Pages { get; } = [];
    public Func<QueryBase, EntityCollection>? OnRetrieve { get; set; }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (query is QueryExpression expression)
        {
            Pages.Add((
                expression.EntityName,
                expression.PageInfo.PageNumber,
                expression.PageInfo.PagingCookie,
                expression.PageInfo.Count));
        }

        Queries.Add(query);
        if (OnRetrieve is null)
            return Task.FromResult(new EntityCollection());

        return Task.FromResult(OnRetrieve(query));
    }
}

public sealed class WorkflowActivitiesServiceTests
{
    private static readonly Guid AssemblyLow = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid AssemblyHigh = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid TypeLow = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    private static readonly Guid TypeHigh = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2");
    private static readonly Guid WorkflowId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1");

    [Fact]
    public async Task Activities_query_database_workflow_activities_in_small_pages()
    {
        var fake = new FakeWorkflowActivitiesClient();
        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        var query = Assert.IsType<QueryExpression>(Assert.Single(fake.Queries));
        Assert.Equal("plugintype", query.EntityName);
        Assert.InRange(WorkflowActivitiesLimits.ActivityPageSize, 1, 250);
        Assert.Equal(WorkflowActivitiesLimits.ActivityPageSize, query.PageInfo.Count);
        Assert.Contains("customworkflowactivityinfo", query.ColumnSet.Columns);
        Assert.DoesNotContain("xaml", query.ColumnSet.Columns);

        var workflowActivity = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "isworkflowactivity");
        Assert.Equal(ConditionOperator.Equal, workflowActivity.Operator);
        Assert.Equal(true, workflowActivity.Values[0]);
        var published = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "componentstate");
        Assert.Equal(0, published.Values[0]);
        Assert.Equal(
            new[] { "assemblyname", "plugintypeid" },
            query.Orders.Select(order => order.AttributeName).ToArray());

        var link = Assert.Single(query.LinkEntities);
        Assert.Equal("pluginassembly", link.LinkToEntityName);
        Assert.Equal(JoinOperator.Inner, link.JoinOperator);
        Assert.Empty(link.Columns.Columns);
        var source = Assert.Single(link.LinkCriteria.Conditions);
        Assert.Equal("sourcetype", source.AttributeName);
        Assert.Equal(ConditionOperator.Equal, source.Operator);
        Assert.Equal(0, source.Values[0]);
    }

    [Fact]
    public async Task Activities_follow_the_paging_cookie_until_more_records_is_false()
    {
        const string cookie = "cookie&lt;2&gt;";
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.PageInfo.PageNumber == 1)
                    return Page(true, cookie, Activity(TypeLow, AssemblyLow, "Zed activity", "Zed.Type", "Zed.Assembly"));

                return Page(false, null, Activity(TypeHigh, AssemblyHigh, "Alpha activity", "Alpha.Type", "Alpha.Assembly"));
            },
        };

        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal([(1, null, 250), (2, cookie, 250)], PagesOf(fake, "plugintype"));
        Assert.Equal(["Alpha.Assembly", "Zed.Assembly"], result.Value!.Assemblies.Select(group => group.Name).ToArray());
    }

    [Fact]
    public async Task Activities_group_by_assembly_id_when_names_match()
    {
        var first = Activity(TypeLow, AssemblyLow, "One", "Contoso.One", "Shared.Name");
        var second = Activity(TypeHigh, AssemblyHigh, "Two", "Contoso.Two", "Shared.Name");
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = _ => Page(false, null, second, first),
        };

        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(2, result.Value!.Assemblies.Count);
        Assert.All(result.Value.Assemblies, group => Assert.Equal("Shared.Name", group.Name));
        Assert.Equal(
            new[] { AssemblyLow.ToString("D"), AssemblyHigh.ToString("D") },
            result.Value.Assemblies.Select(group => group.AssemblyId).ToArray());
    }

    [Fact]
    public async Task Activities_keep_rows_when_name_date_or_lookup_name_is_missing()
    {
        var entity = new Entity("plugintype", TypeLow)
        {
            ["typename"] = "Contoso.Activities.AddNote",
            ["pluginassemblyid"] = new EntityReference("pluginassembly", AssemblyLow),
            ["createdby"] = new EntityReference("systemuser", Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc")),
            ["modifiedby"] = new EntityReference("systemuser", Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd")) { Name = null },
        };
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = _ => Page(false, null, entity),
        };

        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        var activity = Assert.Single(Assert.Single(result.Value!.Assemblies).Activities);
        Assert.Equal("", activity.Name);
        Assert.Null(activity.CreatedOn);
        Assert.Equal("", activity.CreatedBy);
        Assert.Null(activity.ModifiedOn);
        Assert.Equal("", activity.ModifiedBy);
        Assert.Equal("", result.Value.Assemblies[0].Name);
    }

    [Fact]
    public async Task Activities_parse_argument_names_independently_and_drop_raw_xml()
    {
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = _ => Page(
                false,
                null,
                Activity(TypeLow, AssemblyLow, "Inputs", "Contoso.Inputs", "Asm", InputsOnly("sandbox-info-marker")),
                Activity(TypeHigh, AssemblyLow, "Outputs", "Contoso.Outputs", "Asm", OutputsOnly),
                Activity(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"), AssemblyLow, "Both", "Contoso.Both", "Asm", BothArguments),
                Activity(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4"), AssemblyLow, "Broken", "Contoso.Broken", "Asm", "<Activity><Inputs>")),
        };

        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        var activities = Assert.Single(result.Value!.Assemblies).Activities;
        Assert.Equal(["Account"], activities[0].Inputs.Select(item => item.Name).ToArray());
        Assert.Empty(activities[0].Outputs);
        Assert.Empty(activities[1].Inputs);
        Assert.Equal(["Result"], activities[1].Outputs.Select(item => item.Name).ToArray());
        Assert.Equal(["In"], activities[2].Inputs.Select(item => item.Name).ToArray());
        Assert.Equal(["Out"], activities[2].Outputs.Select(item => item.Name).ToArray());
        Assert.Empty(activities[3].Inputs);
        Assert.Empty(activities[3].Outputs);
        var json = JsonSerializer.Serialize(result.Value);
        Assert.DoesNotContain("sandbox-info-marker", json, StringComparison.Ordinal);
        Assert.DoesNotContain("<Activity>", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Activities_return_a_dataverse_fault_instead_of_an_empty_list()
    {
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.PageInfo.PageNumber == 1)
                    return Page(true, "next", Activity(TypeLow, AssemblyLow, "Kept", "Contoso.Kept", "Asm"));

                throw Fault(unchecked((int)0x80040220), "Principal user is missing prvReadPluginType privilege.");
            },
        };

        var result = await new WorkflowActivitiesService(fake).GetActivitiesAsync(CancellationToken.None);

        Assert.Null(result.Value);
        Assert.Equal(400, result.Problem!.Status);
        Assert.Equal("DataverseFault", result.Problem.Code);
        Assert.Contains("prvReadPluginType", result.Problem.Message, StringComparison.Ordinal);
        Assert.Contains("0x80040220", result.Problem.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Processes_page_workflow_dialog_and_action_definitions_without_filtering_xaml()
    {
        var fake = HappyActivity();
        await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        var workflow = Assert.Single(fake.Queries.OfType<QueryExpression>(), query => query.EntityName == "workflow");
        Assert.InRange(WorkflowActivitiesLimits.ProcessPageSize, 1, 50);
        Assert.Equal(WorkflowActivitiesLimits.ProcessPageSize, workflow.PageInfo.Count);
        Assert.Contains("xaml", workflow.ColumnSet.Columns);
        Assert.DoesNotContain("subprocess", workflow.ColumnSet.Columns);
        Assert.Equal(
            new[] { "name", "workflowid" },
            workflow.Orders.Select(order => order.AttributeName).ToArray());

        var category = Assert.Single(workflow.Criteria.Conditions, condition => condition.AttributeName == "category");
        Assert.Equal(ConditionOperator.In, category.Operator);
        Assert.Equal(new[] { 0, 1, 3 }, category.Values.Cast<int>().ToArray());
        Assert.Equal(1, Assert.Single(workflow.Criteria.Conditions, condition => condition.AttributeName == "type").Values[0]);
        Assert.Equal(1, Assert.Single(workflow.Criteria.Conditions, condition => condition.AttributeName == "statecode").Values[0]);
        Assert.Equal(0, Assert.Single(workflow.Criteria.Conditions, condition => condition.AttributeName == "componentstate").Values[0]);
        Assert.Equal(
            ConditionOperator.Null,
            Assert.Single(workflow.Criteria.Conditions, condition => condition.AttributeName == "rendererobjecttypecode").Operator);
        Assert.DoesNotContain(workflow.Criteria.Conditions, condition => condition.AttributeName is "primaryentity" or "ownerid");
        Assert.DoesNotContain(workflow.Criteria.Conditions, condition => condition.Operator == ConditionOperator.Like);

        var activity = Assert.Single(fake.Queries.OfType<QueryExpression>(), query => query.EntityName == "plugintype");
        Assert.Contains(activity.Criteria.Conditions, condition =>
            condition.AttributeName == "plugintypeid" && Equals(condition.Values[0], TypeLow));
        Assert.Contains(activity.Criteria.Conditions, condition => condition.AttributeName == "isworkflowactivity");
        Assert.Contains(activity.LinkEntities, link => link.LinkToEntityName == "pluginassembly");
    }

    [Fact]
    public async Task Processes_match_the_clr_type_and_do_not_return_xaml()
    {
        const string marker = "xaml-only-marker";
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                {
                    return Page(false, null, Activity(
                        TypeLow,
                        AssemblyLow,
                        "Menu name",
                        "Contoso.Activities.AddNote, Contoso.Activities, Version=1.0.0.0, Culture=neutral",
                        "Asm"));
                }

                return Page(
                    false,
                    null,
                    Workflow(WorkflowId, "Menu only", $"<Activity>{marker} Menu name</Activity>", 0, "Workflow"),
                    Workflow(
                        Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"),
                        "Type match",
                        "<Activity>contoso.activities.addnote</Activity>",
                        3,
                        "Action"));
            },
        };

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.Null(result.Problem);
        var process = Assert.Single(result.Value!.Processes);
        Assert.Equal("Type match", process.Name);
        Assert.False(result.Value.Truncated);
        var json = JsonSerializer.Serialize(result.Value);
        Assert.DoesNotContain(marker, json, StringComparison.Ordinal);
        Assert.DoesNotContain("contoso.activities.addnote", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Processes_skip_null_or_missing_xaml_without_throwing()
    {
        var missing = Workflow(WorkflowId, "Missing", null, 0, "Workflow");
        missing.Attributes.Remove("xaml");
        var empty = Workflow(Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"), "Null xaml", null, 1, null);
        empty["xaml"] = null;
        var fake = ProcessesReturning(missing, empty);

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(result.Value!.Processes);
        Assert.False(result.Value.Truncated);
    }

    [Fact]
    public async Task Processes_include_global_actions_and_split_start_conditions()
    {
        var global = Workflow(
            WorkflowId,
            "Close anything",
            "<Activity>Contoso.Activities.AddNote</Activity>",
            3,
            null);
        global.Attributes.Remove("primaryentity");
        global["triggeronupdateattributelist"] = "statuscode, ownerid, ,";
        var fake = ProcessesReturning(global);

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        var process = Assert.Single(result.Value!.Processes);
        Assert.Equal("", process.PrimaryEntity);
        Assert.Equal(3, process.Category);
        Assert.Equal("", process.CategoryLabel);
        Assert.False(process.OnDemand);
        Assert.False(process.TriggerOnCreate);
        Assert.False(process.TriggerOnDelete);
        Assert.Equal(["statuscode", "ownerid"], process.TriggerOnUpdateAttributes);
    }

    [Fact]
    public async Task Processes_use_formatted_category_labels_and_do_not_invent_reserved()
    {
        var labeled = Workflow(
            WorkflowId,
            "Desktop",
            "<Activity>Contoso.Activities.AddNote</Activity>",
            6,
            "Desktop Flow");
        var unlabeled = Workflow(
            Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"),
            "Unknown category",
            "<Activity>Contoso.Activities.AddNote</Activity>",
            7,
            null);
        var fake = ProcessesReturning(labeled, unlabeled);

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.Equal((6, "Desktop Flow"), (result.Value!.Processes[0].Category, result.Value.Processes[0].CategoryLabel));
        Assert.Equal((7, ""), (result.Value.Processes[1].Category, result.Value.Processes[1].CategoryLabel));
        Assert.DoesNotContain(result.Value.Processes, process => process.CategoryLabel == "Reserved");
    }

    [Fact]
    public async Task Processes_return_not_found_for_an_unknown_activity()
    {
        var fake = new FakeWorkflowActivitiesClient();

        var missing = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);
        var malformed = await new WorkflowActivitiesService(fake).GetProcessesAsync("not-a-guid", CancellationToken.None);

        Assert.Equal(404, missing.Problem!.Status);
        Assert.Equal("ActivityNotFound", missing.Problem.Code);
        Assert.Null(missing.Value);
        Assert.DoesNotContain(fake.Queries.OfType<QueryExpression>(), query => query.EntityName == "workflow");
        Assert.Equal(404, malformed.Problem!.Status);
        Assert.Empty(fake.Queries.Where((_, index) => index > 0 && fake.Queries[index] is QueryExpression expression && expression.EntityName == "workflow"));
        Assert.Single(fake.Queries);
    }

    [Fact]
    public async Task Processes_surface_service_protection_faults()
    {
        var fault = new OrganizationServiceFault
        {
            ErrorCode = WorkflowActivitiesFaults.NumberOfRequestsLimitExceeded,
            Message = "Number of requests exceeded the limit.",
        };
        fault.ErrorDetails.Add("Retry-After", "12");
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                    return Page(false, null, Activity(TypeLow, AssemblyLow, "Add note", "Contoso.Activities.AddNote", "Asm"));

                throw new FaultException<OrganizationServiceFault>(fault, fault.Message);
            },
        };

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.Null(result.Value);
        Assert.Equal(429, result.Problem!.Status);
        Assert.Equal("ServiceProtection", result.Problem.Code);
        Assert.Contains("Number of requests exceeded the limit.", result.Problem.Message, StringComparison.Ordinal);
        Assert.Contains("0x80072322", result.Problem.Message, StringComparison.Ordinal);
        Assert.Contains("Retry after 12.", result.Problem.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Processes_set_truncated_when_the_safety_cap_stops_paging()
    {
        var calls = 0;
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                    return Page(false, null, Activity(TypeLow, AssemblyLow, "Add note", "Contoso.Activities.AddNote", "Asm"));

                calls++;
                return Page(true, $"cookie-{calls}", Workflow(WorkflowId, "Match", "<Activity>Contoso.Activities.AddNote</Activity>", 0, "Workflow"));
            },
        };

        var result = await new WorkflowActivitiesService(fake, maxProcessPages: 2)
            .GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.True(result.Value!.Truncated);
        Assert.Equal(2, result.Value.Processes.Count);
        Assert.Equal(2, calls);
        Assert.Equal([(1, null), (2, "cookie-1")], WorkflowPages(fake));
    }

    [Fact]
    public async Task Processes_are_complete_when_more_records_is_false()
    {
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                    return Page(false, null, Activity(TypeLow, AssemblyLow, "Add note", "Contoso.Activities.AddNote", "Asm"));

                if (expression.PageInfo.PageNumber == 1)
                {
                    return Page(
                        true,
                        "keep-this-cookie",
                        Workflow(WorkflowId, "First", "<Activity>Contoso.Activities.AddNote</Activity>", 1, "Dialog"));
                }

                return Page(
                    false,
                    null,
                    Workflow(Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"), "Second", "<Activity>Contoso.Activities.AddNote</Activity>", 0, "Workflow"));
            },
        };

        var result = await new WorkflowActivitiesService(fake, maxProcessPages: 5)
            .GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.False(result.Value!.Truncated);
        Assert.Equal(["First", "Second"], result.Value.Processes.Select(process => process.Name).ToArray());
        Assert.Equal("Dialog", result.Value.Processes[0].CategoryLabel);
        Assert.Equal([(1, null), (2, "keep-this-cookie")], WorkflowPages(fake));
    }

    [Fact]
    public async Task Processes_do_not_scan_workflows_when_the_type_identity_is_empty()
    {
        var fake = new FakeWorkflowActivitiesClient
        {
            OnRetrieve = _ => Page(false, null, Activity(TypeLow, AssemblyLow, "Menu", "  ", "Asm")),
        };

        var result = await new WorkflowActivitiesService(fake).GetProcessesAsync(TypeLow.ToString("D"), CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(result.Value!.Processes);
        Assert.False(result.Value.Truncated);
        Assert.DoesNotContain(fake.Queries.OfType<QueryExpression>(), query => query.EntityName == "workflow");
    }

    private static FakeWorkflowActivitiesClient HappyActivity() =>
        new()
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                    return Page(false, null, Activity(TypeLow, AssemblyLow, "Add note", "Contoso.Activities.AddNote", "Asm"));

                return Page(false, null);
            },
        };

    private static FakeWorkflowActivitiesClient ProcessesReturning(params Entity[] workflows) =>
        new()
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                if (expression.EntityName == "plugintype")
                    return Page(false, null, Activity(TypeLow, AssemblyLow, "Add note", "Contoso.Activities.AddNote", "Asm"));

                return Page(false, null, workflows);
            },
        };

    private static Entity Activity(
        Guid typeId,
        Guid assemblyId,
        string? name,
        string? typeName,
        string? assemblyName,
        string? xml = null)
    {
        var entity = new Entity("plugintype", typeId)
        {
            ["pluginassemblyid"] = new EntityReference("pluginassembly", assemblyId),
            ["version"] = "1.2.3.4",
        };
        if (name is not null) entity["name"] = name;
        if (typeName is not null) entity["typename"] = typeName;
        if (assemblyName is not null) entity["assemblyname"] = assemblyName;
        if (xml is not null) entity["customworkflowactivityinfo"] = xml;
        return entity;
    }

    private static Entity Workflow(Guid id, string name, string? xaml, int category, string? categoryLabel)
    {
        var entity = new Entity("workflow", id)
        {
            ["name"] = name,
            ["category"] = new OptionSetValue(category),
            ["primaryentity"] = "incident",
            ["xaml"] = xaml,
        };
        if (categoryLabel is not null)
            entity.FormattedValues["category"] = categoryLabel;
        return entity;
    }

    private static EntityCollection Page(bool moreRecords, string? cookie, params Entity[] entities)
    {
        var collection = new EntityCollection(entities);
        collection.MoreRecords = moreRecords;
        collection.PagingCookie = cookie;
        return collection;
    }

    private static FaultException<OrganizationServiceFault> Fault(int errorCode, string message) =>
        new(new OrganizationServiceFault { ErrorCode = errorCode, Message = message }, message);

    private static (int Page, string? Cookie, int Count)[] PagesOf(FakeWorkflowActivitiesClient fake, string entity) =>
        fake.Pages.Where(page => page.Entity == entity).Select(page => (page.Page, page.Cookie, page.Count)).ToArray();

    private static (int Page, string? Cookie)[] WorkflowPages(FakeWorkflowActivitiesClient fake) =>
        fake.Pages.Where(page => page.Entity == "workflow").Select(page => (page.Page, page.Cookie)).ToArray();

    private static string InputsOnly(string marker) =>
        $"""
        <Activity>
          <Name>Ignored menu</Name>
          <Inputs><Input><Name>Account</Name><Description>{marker}</Description></Input></Inputs>
        </Activity>
        """;

    private const string OutputsOnly =
        """
        <Activity xmlns="http://schemas.example/activity">
          <Outputs><Output><Name>Result</Name></Output></Outputs>
        </Activity>
        """;

    private const string BothArguments =
        """
        <Activity>
          <Inputs><Name>In</Name></Inputs>
          <Outputs><Name>Out</Name></Outputs>
        </Activity>
        """;
}
