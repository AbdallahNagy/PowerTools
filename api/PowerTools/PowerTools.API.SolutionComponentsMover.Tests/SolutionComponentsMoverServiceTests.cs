using System.ServiceModel;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;
using PowerTools.API.Tools.SolutionComponentsMover;
using Xunit;

namespace PowerTools.API.SolutionComponentsMover.Tests;

public sealed class SolutionComponentsMoverServiceTests
{
    private static readonly Guid SourceId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    private static readonly Guid TargetId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2");
    private static readonly Guid ManagedId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3");
    private static readonly Guid OtherTargetId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4");
    private static readonly Guid ObjectA = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1");
    private static readonly Guid ObjectB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2");
    private static readonly Guid ObjectC = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3");

    [Fact]
    public async Task Solutions_apply_visibility_filters_and_keep_a_null_publisher_name()
    {
        var dated = Solution(SourceId, "alpha", "Alpha", publisher: null, managed: false);
        dated["installedon"] = new DateTime(2024, 5, 6, 23, 15, 0, DateTimeKind.Utc);
        var dateOnly = Solution(TargetId, "beta", "Beta", "Contoso", managed: true);
        dateOnly["installedon"] = new DateOnly(2020, 1, 2);
        var fake = new FakeOrg
        {
            OnQuery = query =>
            {
                Assert.Equal("solution", query.EntityName);
                return Page(false, null, dated, dateOnly);
            },
        };

        var result = await new SolutionComponentsMoverService(fake).GetSolutionsAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        var query = Assert.Single(fake.Queries);
        Assert.Equal(
            ["friendlyname", "installedon", "ismanaged", "publisherid", "uniquename", "version"],
            query.ColumnSet.Columns.OrderBy(column => column).ToArray());
        Assert.DoesNotContain("description", query.ColumnSet.Columns);
        var visible = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "isvisible");
        Assert.Equal(ConditionOperator.Equal, visible.Operator);
        Assert.Equal(true, visible.Values[0]);
        var name = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "uniquename");
        Assert.Equal(ConditionOperator.NotEqual, name.Operator);
        Assert.Equal("Default", name.Values[0]);
        Assert.Equal("solutionid", Assert.Single(query.Orders).AttributeName);
        Assert.Equal(("solution", 1, null, SolutionComponentsMoverLimits.PageSize), fake.Pages[0]);
        Assert.Equal(5000, SolutionComponentsMoverLimits.PageSize);

        Assert.Null(result.Value!.Solutions[0].PublisherName);
        Assert.Equal("2024-05-06", result.Value.Solutions[0].InstalledOn);
        Assert.Equal("Contoso", result.Value.Solutions[1].PublisherName);
        Assert.Equal("2020-01-02", result.Value.Solutions[1].InstalledOn);
        Assert.False(result.Value.Solutions[0].IsManaged);
        Assert.True(result.Value.Solutions[1].IsManaged);
    }

    [Fact]
    public async Task Solutions_follow_the_paging_cookie()
    {
        var fake = new FakeOrg
        {
            OnQuery = query => query.PageInfo.PageNumber == 1
                ? Page(true, "cookie-2", Solution(SourceId, "alpha", "Alpha", "Contoso", false))
                : Page(false, null, Solution(TargetId, "beta", "Beta", "Contoso", false)),
        };

        var result = await new SolutionComponentsMoverService(fake).GetSolutionsAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(2, result.Value!.Solutions.Count);
        Assert.Equal(
            [("solution", 1, null, 5000), ("solution", 2, "cookie-2", 5000)],
            fake.Pages);
    }

    [Theory]
    [InlineData("8.2.0.0", false)]
    [InlineData("9.0.2.0", false)]
    [InlineData("9.1.0.0", true)]
    [InlineData("10.0.0.0", true)]
    public async Task Component_types_follow_the_version_gate_and_do_not_invent_code_80(string version, bool definitions)
    {
        var fake = new FakeOrg
        {
            Version = version,
            OptionSetResponse = OptionSet(Option(1, "Entity")),
            OnQuery = query =>
            {
                Assert.Equal("solutioncomponentdefinition", query.EntityName);
                return Page(false, null, Definition("Canvas app", 430, "", 80));
            },
        };

        var result = await new SolutionComponentsMoverService(fake).GetComponentTypesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.DoesNotContain(result.Value!.ComponentTypes, type => type.ComponentType == 80);
        var optionRequest = Assert.Single(fake.Executes, request => request.RequestName == "RetrieveOptionSet");
        Assert.Equal("componenttype", optionRequest["Name"]);
        Assert.Contains(fake.Executes, request => request is RetrieveVersionRequest);
        if (!definitions)
        {
            Assert.DoesNotContain(fake.Pages, page => page.Entity == "solutioncomponentdefinition");
            Assert.Equal([1], result.Value.ComponentTypes.Select(type => type.ComponentType).ToArray());
            return;
        }

        var definitionQuery = Assert.Single(fake.Queries);
        Assert.Equal(
            ["name", "primaryentityname", "solutioncomponenttype"],
            definitionQuery.ColumnSet.Columns.OrderBy(column => column).ToArray());
        Assert.DoesNotContain("objecttypecode", definitionQuery.ColumnSet.Columns);
        var filter = Assert.Single(definitionQuery.Criteria.Conditions);
        Assert.Equal("canbeaddedtosolutioncomponents", filter.AttributeName);
        Assert.Equal(true, filter.Values[0]);
        Assert.Equal("name", Assert.Single(definitionQuery.Orders).AttributeName);
        Assert.Equal(5000, definitionQuery.PageInfo.Count);
        Assert.Equal(1, definitionQuery.PageInfo.PageNumber);
        Assert.Contains(result.Value.ComponentTypes, type => type.ComponentType == 430 && type.Label == "Canvas app");
        Assert.Contains(result.Value.ComponentTypes, type => type.ComponentType == 1 && type.Label == "Entity");
    }

    [Fact]
    public async Task Component_type_labels_prefer_the_table_then_the_option_set_then_the_definition_name()
    {
        var accountId = Guid.Parse("cccccccc-cccc-cccc-cccc-ccccccccccc1");
        var contactId = Guid.Parse("cccccccc-cccc-cccc-cccc-ccccccccccc2");
        var fake = new FakeOrg
        {
            Version = "9.1.0.0",
            OptionSetResponse = OptionSet(
                Option(1, "Entity"),
                Option(2, "Contact option"),
                Option(29, "Workflow"),
                Option(30, user: "", first: "Localized rule"),
                Option(20, "App action")),
            OnQuery = _ => Page(
                false,
                null,
                Definition("zzz-definition", 1, "account", 80),
                Definition("ignored", 2, "contact", 2),
                Definition("ignored-workflow", 29, "missingtable", 29),
                Definition("ignored-rule", 30, "alsomissing", 30),
                Definition("Custom piece", 50, "noname", 50)),
            OnMetadata = request =>
            {
                var ids = InValues<string>(request, "LogicalName");
                Assert.Contains("account", ids);
                Assert.Contains("missingtable", ids);
                Assert.Null(request["ClientVersionStamp"]);
                return Metadata(
                    Table(accountId, "account", "Account table", "Account", true),
                    Table(contactId, "contact", null, "Contact", false));
            },
        };

        var result = await new SolutionComponentsMoverService(fake).GetComponentTypesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.DoesNotContain(result.Value!.ComponentTypes, type => type.ComponentType == 80);
        var labels = result.Value.ComponentTypes.ToDictionary(type => type.ComponentType, type => type.Label);
        Assert.Equal("Account table", labels[1]);
        Assert.Equal("Contact", labels[2]);
        Assert.Equal("Workflow", labels[29]);
        Assert.Equal("Localized rule", labels[30]);
        Assert.Equal("Custom piece", labels[50]);
        Assert.Equal("App action", labels[20]);
        Assert.Equal(
            labels.Values.OrderBy(label => label, StringComparer.OrdinalIgnoreCase).ToArray(),
            result.Value.ComponentTypes.Select(type => type.Label).ToArray());
    }

    [Theory]
    [InlineData("source")]
    [InlineData("target")]
    [InlineData("types")]
    public async Task Copy_rejects_empty_input_before_any_query(string empty)
    {
        var fake = new FakeOrg();
        var body = new StartCopyBody
        {
            SourceSolutionIds = empty == "source" ? [] : [SourceId.ToString()],
            TargetSolutionIds = empty == "target" ? [] : [TargetId.ToString()],
            AllComponents = false,
            ComponentTypes = empty == "types" ? [] : [1],
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(body, CancellationToken.None);

        Assert.Null(result.Value);
        Assert.Equal(400, result.Problem!.Status);
        Assert.Empty(fake.Queries);
        Assert.Empty(fake.Executes);
    }

    [Fact]
    public async Task Copy_rejects_a_managed_target_before_reading_components()
    {
        var fake = SolutionsFake(
            Solution(SourceId, "alpha", "Alpha", "Contoso", false),
            Solution(ManagedId, "managed", "Managed", "Contoso", true));

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [ManagedId]),
            CancellationToken.None);

        Assert.Null(result.Value);
        Assert.Equal("ManagedTarget", result.Problem!.Code);
        Assert.Contains("managed", result.Problem.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(fake.Pages, page => page.Entity == "solutioncomponent");
        Assert.DoesNotContain(fake.Executes, request => request is AddSolutionComponentRequest);
    }

    [Fact]
    public async Task Copy_rejects_an_unknown_solution_before_reading_components()
    {
        var fake = SolutionsFake(Solution(SourceId, "alpha", "Alpha", "Contoso", false));

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId]),
            CancellationToken.None);

        Assert.Equal("UnknownSolution", result.Problem!.Code);
        Assert.DoesNotContain(fake.Pages, page => page.Entity == "solutioncomponent");
    }

    [Fact]
    public async Task Null_root_behavior_with_the_check_off_does_not_throw()
    {
        var component = Component(ObjectA, 1, behavior: null, sourceManaged: false);
        var fake = CopyFake("8.2.0.0", component);
        var service = new SolutionComponentsMoverService(fake);

        var result = await service.ExecuteAsync(
            CopyBody([SourceId], [TargetId], checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var add = Assert.Single(fake.Executes.OfType<AddSolutionComponentRequest>());
        Assert.False(add.Parameters.Contains("DoNotIncludeSubcomponents"));
        Assert.False(add.Parameters.Contains("IncludedComponentSettingsValues"));
        Assert.False(add.AddRequiredComponents);
        Assert.Equal(ObjectA, add.ComponentId);
        Assert.Equal(1, add.ComponentType);
        Assert.Equal("target", add.SolutionUniqueName);
        Assert.True(Assert.Single(result.Value!.Entries).Succeeded);
        Assert.DoesNotContain(fake.Executes, request => request.RequestName == "RetrieveMetadataChanges");
    }

    [Fact]
    public async Task Managed_source_rows_do_not_trip_the_best_practice_check()
    {
        var component = Component(ObjectA, 1, behavior: 0, sourceManaged: true);
        var fake = CopyFake("8.2.0.0", component);

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], checkBestPractice: true),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Single(fake.Executes.OfType<AddSolutionComponentRequest>());
        Assert.DoesNotContain(fake.Executes, request => request.RequestName == "RetrieveMetadataChanges");
    }

    [Fact]
    public async Task Best_practice_refusal_names_the_managed_tables_and_does_not_add()
    {
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 1, 0, sourceManaged: false),
            Component(ObjectB, 1, 0, sourceManaged: false));
        fake.OnMetadata = request =>
        {
            var ids = InValues<Guid>(request, "MetadataId");
            Assert.Equal(2, ids.Length);
            Assert.Contains(ObjectA, ids);
            Assert.Contains(ObjectB, ids);
            var query = Assert.IsType<EntityQueryExpression>(request["Query"]);
            Assert.Contains(query.Criteria.Conditions, condition => condition.PropertyName == "IsManaged");
            Assert.Null(request["ClientVersionStamp"]);
            return Metadata(
                Table(ObjectA, "account", "Account", "Account", true),
                Table(ObjectB, "contact", null, "Contact", true));
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], checkBestPractice: null),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(fake.Executes.OfType<AddSolutionComponentRequest>());
        Assert.Equal("refused", result.Value!.Status);
        Assert.Equal(0, result.Value.Processed);
        Assert.Equal(0, result.Value.Total);
        var entry = Assert.Single(result.Value.Entries);
        Assert.False(entry.Succeeded);
        Assert.Contains("Account", entry.Message, StringComparison.Ordinal);
        Assert.Contains("Contact", entry.Message, StringComparison.Ordinal);
        Assert.Equal("Account, Contact", entry.Label);
    }

    [Fact]
    public async Task Metadata_id_list_is_split_only_after_a_size_fault()
    {
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 1, 0, false),
            Component(ObjectB, 1, 0, false));
        fake.OnMetadata = request =>
        {
            var ids = InValues<Guid>(request, "MetadataId");
            if (ids.Length > 1)
                throw Fault(unchecked((int)0x80040216), "The metadata query is too large.");
            var id = Assert.Single(ids);
            var logical = id == ObjectA ? "account" : "contact";
            var schema = id == ObjectA ? "Account" : "Contact";
            return Metadata(Table(id, logical, id == ObjectA ? "Account" : null, schema, true));
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], checkBestPractice: true),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(fake.Executes.OfType<AddSolutionComponentRequest>());
        var metadataCalls = fake.Executes.Where(request => request.RequestName == "RetrieveMetadataChanges").ToList();
        Assert.Equal(3, metadataCalls.Count);
        Assert.Equal(2, InValues<Guid>(metadataCalls[0], "MetadataId").Length);
        Assert.Single(InValues<Guid>(metadataCalls[1], "MetadataId"));
        Assert.Contains("Account", result.Value!.Entries[0].Message, StringComparison.Ordinal);
        Assert.Contains("Contact", result.Value.Entries[0].Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Add_maps_root_behavior_0_1_and_2()
    {
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 2, 0, false),
            Component(ObjectB, 2, 1, false),
            Component(ObjectC, 2, 2, false));

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var adds = fake.Executes.OfType<AddSolutionComponentRequest>().ToList();
        Assert.Equal(3, adds.Count);
        Assert.DoesNotContain(
            fake.Queries.Where(query => query.EntityName == "solutioncomponent").SelectMany(query => query.Criteria.Conditions),
            condition => condition.AttributeName == "componenttype");
        AssertBehaviorUnset(adds[0]);
        Assert.True(adds[1].DoNotIncludeSubcomponents);
        Assert.False(adds[1].Parameters.Contains("IncludedComponentSettingsValues"));
        Assert.True(adds[2].DoNotIncludeSubcomponents);
        Assert.Empty(adds[2].IncludedComponentSettingsValues);
        Assert.All(adds, add => Assert.False(add.AddRequiredComponents));
        Assert.Equal(3, result.Value!.Succeeded);
    }

    [Fact]
    public async Task Environment_variable_definition_forces_an_empty_settings_array_below_version_8()
    {
        var fake = CopyFake("7.2.0.0", Component(ObjectA, 380, behavior: 1, sourceManaged: false));

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var add = Assert.Single(fake.Executes.OfType<AddSolutionComponentRequest>());
        Assert.Equal(380, add.ComponentType);
        Assert.True(add.DoNotIncludeSubcomponents);
        Assert.Empty(add.IncludedComponentSettingsValues);
        Assert.True(Assert.Single(result.Value!.Entries).Succeeded);
    }

    [Fact]
    public async Task A_component_fault_keeps_earlier_adds_and_continues()
    {
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 29, null, false),
            Component(ObjectB, 29, null, false),
            Component(ObjectC, 29, null, false));
        fake.OnAdd = add =>
        {
            if (add.ComponentId == ObjectB)
                throw Fault(unchecked((int)0x80040216), "The component is already in the solution.");
            return new OrganizationResponse();
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: false, types: [29], checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var componentQuery = Assert.Single(fake.Queries, query => query.EntityName == "solutioncomponent");
        var typeFilter = Assert.Single(componentQuery.Criteria.Conditions, condition => condition.AttributeName == "componenttype");
        Assert.Equal(ConditionOperator.In, typeFilter.Operator);
        Assert.Equal(29, typeFilter.Values[0]);
        Assert.Equal(3, fake.Executes.OfType<AddSolutionComponentRequest>().Count());
        Assert.Equal("completed", result.Value!.Status);
        Assert.Equal(2, result.Value.Succeeded);
        Assert.Equal(1, result.Value.Failed);
        Assert.True(result.Value.Entries[0].Succeeded);
        Assert.Contains("already in the solution", result.Value.Entries[1].Message, StringComparison.OrdinalIgnoreCase);
        Assert.True(result.Value.Entries[2].Succeeded);
    }

    [Fact]
    public async Task Duplicate_source_rows_are_added_once_per_target()
    {
        var fake = CopyFake(
            "9.1.0.0",
            new List<Entity>
            {
                Solution(SourceId, "source", "Source", "Contoso", false),
                Solution(TargetId, "target", "Target", "Contoso", false),
                Solution(OtherTargetId, "other", "Other", "Contoso", false),
            },
            Component(ObjectA, 29, null, false),
            Component(ObjectA, 29, null, false));

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId, OtherTargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var adds = fake.Executes.OfType<AddSolutionComponentRequest>().ToList();
        Assert.Equal(2, adds.Count);
        Assert.Equal(["target", "other"], adds.Select(add => add.SolutionUniqueName).ToArray());
        Assert.All(adds, add => Assert.Equal(ObjectA, add.ComponentId));
        Assert.Equal(2, result.Value!.Succeeded);
    }

    [Fact]
    public async Task Component_pages_continue_until_more_records_is_false()
    {
        var first = Component(ObjectA, 29, null, false);
        var second = Component(ObjectB, 29, null, false);
        var fake = new FakeOrg { Version = "8.2.0.0" };
        fake.OnQuery = query =>
        {
            if (query.EntityName == "solution")
                return Page(false, null, Solution(SourceId, "source", "Source", "Contoso", false), Solution(TargetId, "target", "Target", "Contoso", false));
            Assert.Equal("solutioncomponent", query.EntityName);
            Assert.Equal(
                ["componenttype", "objectid", "rootcomponentbehavior", "solutioncomponentid", "solutionid"],
                query.ColumnSet.Columns.OrderBy(column => column).ToArray());
            var link = Assert.Single(query.LinkEntities);
            Assert.Equal("solution", link.EntityAlias);
            Assert.Equal(JoinOperator.Inner, link.JoinOperator);
            Assert.Contains("ismanaged", link.Columns.Columns);
            Assert.Equal("solutioncomponentid", Assert.Single(query.Orders).AttributeName);
            return query.PageInfo.PageNumber == 1
                ? Page(true, "component-cookie", first)
                : Page(false, null, second);
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Contains(fake.Pages, page => page == ("solutioncomponent", 1, null, 5000));
        Assert.Contains(fake.Pages, page => page == ("solutioncomponent", 2, "component-cookie", 5000));
        Assert.Equal(2, result.Value!.Succeeded);
        Assert.Equal([ObjectA, ObjectB], fake.Executes.OfType<AddSolutionComponentRequest>().Select(add => add.ComponentId).ToArray());
    }

    [Fact]
    public async Task Service_protection_waits_and_retries_the_same_add()
    {
        var events = new List<string>();
        var delay = new RecordingDelay { Events = events };
        var attempts = new Dictionary<Guid, int>();
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 29, null, false),
            Component(ObjectB, 29, null, false));
        fake.OnAdd = add =>
        {
            events.Add($"execute:{add.ComponentId:D}");
            var seen = attempts.GetValueOrDefault(add.ComponentId);
            attempts[add.ComponentId] = seen + 1;
            if (add.ComponentId == ObjectA && seen == 0)
            {
                throw Fault(
                    SolutionComponentsMoverFaults.ServiceProtection,
                    "Number of requests exceeded the limit.",
                    TimeSpan.FromMinutes(2));
            }

            return new OrganizationResponse();
        };

        var result = await new SolutionComponentsMoverService(fake, delay).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(
            [$"execute:{ObjectA:D}", "delay", $"execute:{ObjectA:D}", $"execute:{ObjectB:D}"],
            events);
        Assert.Equal(TimeSpan.FromMinutes(2), Assert.Single(delay.Waits));
        Assert.Equal(2, result.Value!.Succeeded);
        Assert.Equal(0, result.Value.Failed);
        Assert.Equal("completed", result.Value.Status);
    }

    [Fact]
    public async Task Block_unmanaged_customizations_stops_the_job()
    {
        var fake = CopyFake(
            "9.1.0.0",
            Component(ObjectA, 29, null, false),
            Component(ObjectB, 29, null, false),
            Component(ObjectC, 29, null, false));
        fake.OnAdd = add =>
        {
            if (add.ComponentId == ObjectB)
            {
                throw Fault(
                    unchecked((int)0x80048d0b),
                    "This environment doesn't allow unmanaged customizations. This was a choice made by your admin, and certain actions won't be available or will be view only.");
            }

            return new OrganizationResponse();
        };

        var result = await new SolutionComponentsMoverService(fake).ExecuteAsync(
            CopyBody([SourceId], [TargetId], allComponents: true, checkBestPractice: false),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(["target"], fake.Executes.OfType<AddSolutionComponentRequest>().Select(add => add.SolutionUniqueName).Distinct().ToArray());
        Assert.Equal([ObjectA, ObjectB], fake.Executes.OfType<AddSolutionComponentRequest>().Select(add => add.ComponentId).ToArray());
        Assert.Equal("stopped", result.Value!.Status);
        Assert.Equal(1, result.Value.Succeeded);
        Assert.Equal(1, result.Value.Failed);
        Assert.True(result.Value.Entries[0].Succeeded);
        Assert.Contains(
            "This environment doesn't allow unmanaged customizations",
            result.Value.Entries[1].Message,
            StringComparison.Ordinal);
    }

    [Fact]
    public void Unknown_job_is_not_found_and_a_refused_job_is_not_queued()
    {
        var store = new InMemorySolutionCopyJobStore();
        var missing = SolutionCopyJobs.Read(store, Guid.NewGuid());
        Assert.Equal(404, missing.Status);
        Assert.Null(missing.Body);

        var refusedId = store.Save(
            new PreparedCopy
            {
                RefusalMessage = "The copy was refused because an unmanaged source includes all assets of a managed table: Account.",
                RefusalLabel = "Account",
                OrganizationMajor = 9,
            },
            new OnlineConnectionContext("https://example.test", "token"));
        Assert.Null(store.DequeueNext());
        var refused = SolutionCopyJobs.Read(store, refusedId);
        Assert.Equal(200, refused.Status);
        Assert.Equal("refused", refused.Body!.Status);
        Assert.Equal(0, refused.Body.Processed);

        var queuedId = store.Save(
            new PreparedCopy
            {
                OrganizationMajor = 9,
                Components = [new CopyComponent { ObjectId = ObjectA, ComponentType = 1 }],
                TargetUniqueNames = ["target"],
            },
            new OnlineConnectionContext("https://example.test", "token"));
        var queued = store.DequeueNext();
        Assert.NotNull(queued);
        Assert.Equal(queuedId, queued.Id);
        Assert.Equal("queued", queued.Status);
    }

    private static void AssertBehaviorUnset(AddSolutionComponentRequest add)
    {
        Assert.False(add.Parameters.Contains("DoNotIncludeSubcomponents"));
        Assert.False(add.Parameters.Contains("IncludedComponentSettingsValues"));
    }

    private static StartCopyBody CopyBody(
        IEnumerable<Guid> sources,
        IEnumerable<Guid> targets,
        bool allComponents = true,
        IReadOnlyList<int>? types = null,
        bool? checkBestPractice = true) =>
        new()
        {
            SourceSolutionIds = sources.Select(id => id.ToString("D")).ToList(),
            TargetSolutionIds = targets.Select(id => id.ToString("D")).ToList(),
            AllComponents = allComponents,
            ComponentTypes = types?.ToList() ?? [],
            CheckBestPractice = checkBestPractice,
        };

    private static FakeOrg SolutionsFake(params Entity[] solutions) =>
        new()
        {
            OnQuery = query =>
            {
                Assert.Equal("solution", query.EntityName);
                return Page(false, null, solutions);
            },
        };

    private static FakeOrg CopyFake(string version, params Entity[] components) =>
        CopyFake(
            version,
            [Solution(SourceId, "source", "Source", "Contoso", false), Solution(TargetId, "target", "Target", "Contoso", false)],
            components);

    private static FakeOrg CopyFake(string version, IReadOnlyList<Entity> solutions, params Entity[] components)
    {
        var fake = new FakeOrg { Version = version };
        fake.OnQuery = query => query.EntityName switch
        {
            "solution" => Page(false, null, solutions.ToArray()),
            "solutioncomponent" => Page(false, null, components),
            "solutioncomponentdefinition" => Page(false, null),
            _ => throw new InvalidOperationException(query.EntityName),
        };
        return fake;
    }

    private static T[] InValues<T>(OrganizationRequest request, string propertyName)
    {
        var query = Assert.IsType<EntityQueryExpression>(request["Query"]);
        var condition = Assert.Single(query.Criteria.Conditions, item => item.PropertyName == propertyName);
        return Assert.IsType<T[]>(condition.Value);
    }

    private static Entity Solution(Guid id, string unique, string friendly, string? publisher, bool managed)
    {
        return new Entity("solution", id)
        {
            ["uniquename"] = unique,
            ["friendlyname"] = friendly,
            ["version"] = "1.0.0.0",
            ["ismanaged"] = managed,
            ["publisherid"] = new EntityReference("publisher", Guid.NewGuid()) { Name = publisher },
        };
    }

    private static Entity Definition(string name, int solutionComponentType, string primary, int objectTypeCode) =>
        new("solutioncomponentdefinition")
        {
            ["name"] = name,
            ["solutioncomponenttype"] = solutionComponentType,
            ["primaryentityname"] = primary,
            ["objecttypecode"] = objectTypeCode,
        };

    private static Entity Component(Guid objectId, int type, int? behavior, bool? sourceManaged)
    {
        var entity = new Entity("solutioncomponent", Guid.NewGuid())
        {
            ["objectid"] = objectId,
            ["componenttype"] = new OptionSetValue(type),
        };
        if (behavior is not null)
            entity["rootcomponentbehavior"] = new OptionSetValue(behavior.Value);
        if (sourceManaged is not null)
            entity["solution.ismanaged"] = new AliasedValue("solution", "ismanaged", sourceManaged.Value);
        return entity;
    }

    private static EntityCollection Page(bool more, string? cookie, params Entity[] entities)
    {
        var collection = new EntityCollection
        {
            MoreRecords = more,
            PagingCookie = cookie,
        };
        foreach (var entity in entities)
            collection.Entities.Add(entity);
        return collection;
    }

    private static OrganizationResponse OptionSet(params OptionMetadata[] options)
    {
        var collection = new OptionMetadataCollection();
        foreach (var option in options)
            collection.Add(option);
        var response = new OrganizationResponse();
        response.Results["OptionSetMetadata"] = new OptionSetMetadata(collection) { Name = "componenttype" };
        return response;
    }

    private static OptionMetadata Option(int value, string? user, string? first = null)
    {
        Label? label = null;
        if (user is not null || first is not null)
        {
            var localized = new List<LocalizedLabel>();
            if (!string.IsNullOrEmpty(first))
                localized.Add(new LocalizedLabel(first, 1036));
            if (!string.IsNullOrEmpty(user))
                localized.Add(new LocalizedLabel(user, 1033));
            label = new Label(new LocalizedLabel(user ?? "", 1033), localized);
        }

        return new OptionMetadata { Value = value, Label = label };
    }

    private static EntityMetadata Table(Guid? id, string logical, string? display, string? schema, bool? managed)
    {
        var table = new EntityMetadata
        {
            MetadataId = id,
            LogicalName = logical,
            SchemaName = schema,
        };
        if (display is not null)
        {
            var localized = new LocalizedLabel(display, 1033);
            table.DisplayName = new Label(localized, new[] { localized });
        }

        if (managed is not null)
            typeof(EntityMetadata).GetProperty(nameof(EntityMetadata.IsManaged))!.SetValue(table, managed);
        return table;
    }

    private static OrganizationResponse Metadata(params EntityMetadata[] tables)
    {
        var collection = new EntityMetadataCollection();
        foreach (var table in tables)
            collection.Add(table);
        var response = new OrganizationResponse();
        response.Results["EntityMetadata"] = collection;
        return response;
    }

    private static FaultException<OrganizationServiceFault> Fault(int code, string message, object? retryAfter = null)
    {
        var fault = new OrganizationServiceFault { ErrorCode = code, Message = message };
        if (retryAfter is not null)
            fault.ErrorDetails.Add("Retry-After", retryAfter);
        return new FaultException<OrganizationServiceFault>(fault, message);
    }

    private sealed class RecordingDelay : ISolutionCopyDelay
    {
        public List<TimeSpan> Waits { get; } = [];
        public List<string>? Events { get; init; }

        public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            Waits.Add(delay);
            Events?.Add("delay");
            return Task.CompletedTask;
        }
    }

    private sealed class FakeOrg : ISolutionComponentsMoverClient
    {
        public string Version { get; set; } = "9.1.0.0";
        public OrganizationResponse? OptionSetResponse { get; set; }
        public Func<QueryExpression, EntityCollection>? OnQuery { get; set; }
        public Func<OrganizationRequest, OrganizationResponse>? OnMetadata { get; set; }
        public Func<AddSolutionComponentRequest, OrganizationResponse>? OnAdd { get; set; }
        public List<QueryExpression> Queries { get; } = [];
        public List<OrganizationRequest> Executes { get; } = [];
        public List<(string Entity, int Page, string? Cookie, int Count)> Pages { get; } = [];

        public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
        {
            var expression = Assert.IsType<QueryExpression>(query);
            Pages.Add((expression.EntityName, expression.PageInfo.PageNumber, expression.PageInfo.PagingCookie, expression.PageInfo.Count));
            Queries.Add(expression);
            return Task.FromResult(OnQuery?.Invoke(expression) ?? new EntityCollection());
        }

        public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
        {
            Executes.Add(request);
            if (request is RetrieveVersionRequest)
            {
                var response = new RetrieveVersionResponse();
                response.Results["Version"] = Version;
                return Task.FromResult<OrganizationResponse>(response);
            }

            if (request.RequestName == "RetrieveOptionSet")
                return Task.FromResult(OptionSetResponse ?? OptionSet(Option(1, "Entity")));

            if (request.RequestName == "RetrieveMetadataChanges")
                return Task.FromResult(OnMetadata?.Invoke(request) ?? Metadata());

            if (request is AddSolutionComponentRequest add)
                return Task.FromResult(OnAdd?.Invoke(add) ?? new OrganizationResponse());

            throw new InvalidOperationException(request.RequestName);
        }
    }
}
