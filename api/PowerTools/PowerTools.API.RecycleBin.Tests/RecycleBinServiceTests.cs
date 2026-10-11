using System.Reflection;
using System.ServiceModel;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.RecycleBin;
using Xunit;

namespace PowerTools.API.RecycleBin.Tests;

public sealed class FakeRecycleBinClient : IRecycleBinClient
{
    public List<QueryBase> Queries { get; } = [];
    public List<OrganizationRequest> Requests { get; } = [];
    public Func<QueryBase, EntityCollection>? OnRetrieve { get; set; }
    public Func<OrganizationRequest, OrganizationResponse>? OnExecute { get; set; }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        Queries.Add(query);
        return Task.FromResult(OnRetrieve?.Invoke(query) ?? new EntityCollection());
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return Task.FromResult(OnExecute?.Invoke(request) ?? new OrganizationResponse());
    }

    public IEnumerable<XElement> Fetches =>
        Queries.OfType<FetchExpression>().Select(fetch => XElement.Parse(fetch.Query));
}

public sealed class RecordingDelay : IRecycleBinDelay
{
    public List<TimeSpan> Waits { get; } = [];

    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        Waits.Add(delay);
        return Task.CompletedTask;
    }
}

public sealed class RecycleBinServiceTests
{
    private static readonly Guid RecordA = Guid.Parse("11111111-0000-0000-0000-000000000001");
    private static readonly Guid RecordB = Guid.Parse("11111111-0000-0000-0000-000000000002");
    private static readonly Guid RecordC = Guid.Parse("11111111-0000-0000-0000-000000000003");
    private static readonly Guid AuditA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid AuditB = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000002");
    private static readonly Guid UserId = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001");

    private static RecycleBinService Service(FakeRecycleBinClient client, bool online = true, RecordingDelay? delay = null) =>
        new(client, delay ?? new RecordingDelay(), online);

    private static void Set(object target, string name, object? value)
    {
        var property = target.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        property.SetValue(target, value);
    }

    private static EntityMetadata Table(
        string logicalName,
        string? label = null,
        bool audited = true,
        bool intersect = false,
        bool activity = false,
        params AttributeMetadata[] attributes)
    {
        var table = new EntityMetadata { LogicalName = logicalName };
        Set(table, nameof(EntityMetadata.PrimaryIdAttribute), $"{logicalName}id");
        Set(table, nameof(EntityMetadata.PrimaryNameAttribute), "name");
        Set(table, nameof(EntityMetadata.IsIntersect), intersect);
        Set(table, nameof(EntityMetadata.IsActivity), activity);
        table.IsAuditEnabled = new BooleanManagedProperty(audited);
        table.DisplayName = label is null ? new Label() : new Label(label, 1033);
        if (label is not null) table.DisplayName.UserLocalizedLabel = new LocalizedLabel(label, 1033);
        Set(table, nameof(EntityMetadata.Attributes), attributes);
        return table;
    }

    private static AttributeMetadata Column(string name, bool validForCreate)
    {
        var column = new StringAttributeMetadata { LogicalName = name };
        Set(column, nameof(AttributeMetadata.IsValidForCreate), validForCreate);
        return column;
    }

    private static FaultException<OrganizationServiceFault> Fault(int code, string message = "Dataverse said no.", string? retryAfter = null)
    {
        var detail = new OrganizationServiceFault { ErrorCode = code, Message = message };
        if (retryAfter is not null) detail.ErrorDetails["Retry-After"] = TimeSpan.Parse(retryAfter);
        return new FaultException<OrganizationServiceFault>(detail, new FaultReason(message));
    }

    private static OrganizationResponse EntityResponse(EntityMetadata table)
    {
        var response = new RetrieveEntityResponse();
        response.Results["EntityMetadata"] = table;
        return response;
    }

    private static RetrieveAuditDetailsResponse AuditDetails(Entity? oldValue)
    {
        var response = new RetrieveAuditDetailsResponse();
        response.Results["AuditDetail"] = new AttributeAuditDetail { OldValue = oldValue };
        return response;
    }

    private static bool IsFetchOn(QueryBase query, string table, bool bin = false) =>
        query is FetchExpression fetch
        && XElement.Parse(fetch.Query) is var root
        && root.Element("entity")?.Attribute("name")?.Value == table
        && (root.Attribute("datasource")?.Value == "bin") == bin;

    private static Entity OrgConfig(int days) =>
        new(RecycleBinQueries.ConfigTable, Guid.NewGuid()) { ["cleanupintervalindays"] = days, ["statecode"] = new OptionSetValue(0) };

    private static Entity Organization(bool audit, int? retention = 90)
    {
        var org = new Entity("organization", Guid.NewGuid()) { ["isauditenabled"] = audit };
        if (retention is not null) org["auditretentionperiodv2"] = retention.Value;
        return org;
    }

    // ── Status ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Status_reports_both_sources_with_their_retention()
    {
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = query => query switch
            {
                QueryExpression { EntityName: "organization" } => new EntityCollection([Organization(true, 30)]),
                _ when IsFetchOn(query, RecycleBinQueries.ConfigTable) => new EntityCollection([OrgConfig(14)]),
                _ => new EntityCollection(),
            },
        };

        var result = await Service(client).GetStatusAsync(CancellationToken.None);

        Assert.Equal(new SourceStatusDto(SourceStates.Enabled, null, 14), result.Value!.Bin);
        Assert.Equal(new SourceStatusDto(SourceStates.Enabled, null, 30), result.Value.Audit);
        var config = XElement.Parse(Assert.IsType<FetchExpression>(client.Queries[0]).Query);
        Assert.Equal("organization", config.Descendants("condition").Single().Attribute("value")!.Value);
    }

    [Fact]
    public async Task Status_without_the_organization_row_means_the_bin_is_off()
    {
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = query => query is QueryExpression ? new EntityCollection([Organization(false)]) : new EntityCollection(),
        };

        var result = await Service(client).GetStatusAsync(CancellationToken.None);

        Assert.Equal(SourceStates.Disabled, result.Value!.Bin.State);
        Assert.Equal(SourceStates.Disabled, result.Value.Audit.State);
    }

    [Fact]
    public async Task Status_treats_a_privilege_fault_as_unknown_not_off()
    {
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = query => query is FetchExpression
                ? throw Fault(RecycleBinFaults.PrivilegeDenied)
                : new EntityCollection([Organization(true)]),
        };

        var result = await Service(client).GetStatusAsync(CancellationToken.None);

        Assert.Equal(SourceStates.Unavailable, result.Value!.Bin.State);
        Assert.Contains("permission", result.Value.Bin.Reason);
        Assert.Equal(SourceStates.Enabled, result.Value.Audit.State);
    }

    [Fact]
    public async Task Status_on_premises_skips_every_recycle_bin_call()
    {
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = _ => new EntityCollection([Organization(true)]),
        };

        var result = await Service(client, online: false).GetStatusAsync(CancellationToken.None);

        Assert.Equal(SourceStates.Unavailable, result.Value!.Bin.State);
        Assert.Contains("online", result.Value.Bin.Reason);
        Assert.DoesNotContain(client.Queries, query => query is FetchExpression);
    }

    [Fact]
    public async Task Status_reads_audit_without_retention_when_that_column_is_missing()
    {
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = query => query is QueryExpression organization
                ? organization.ColumnSet.Columns.Contains("auditretentionperiodv2")
                    ? throw Fault(unchecked((int)0x80041103), "auditretentionperiodv2 does not exist")
                    : new EntityCollection([Organization(true, null)])
                : new EntityCollection(),
        };

        var result = await Service(client, online: false).GetStatusAsync(CancellationToken.None);

        Assert.Equal(new SourceStatusDto(SourceStates.Enabled, null, null), result.Value!.Audit);
    }

    // ── Tables ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Tables_combine_ready_bin_tables_and_audited_tables_that_can_be_recreated()
    {
        var tables = new[]
        {
            Table("account", "Account"),
            Table("contact", null, audited: false),
            Table("new_link", "Link", intersect: true),
            Table("workflow", "Process"),
            Table("task", "Task", audited: false, activity: true),
        };
        var ready = new Entity(RecycleBinQueries.ConfigTable, Guid.NewGuid()) { ["cleanupintervalindays"] = -1 };
        ready["table.logicalname"] = new AliasedValue("entity", "logicalname", "contact");
        var custom = new Entity(RecycleBinQueries.ConfigTable, Guid.NewGuid()) { ["cleanupintervalindays"] = 7 };
        custom["table.logicalname"] = new AliasedValue("entity", "logicalname", "task");
        var client = new FakeRecycleBinClient
        {
            OnExecute = _ =>
            {
                var response = new RetrieveAllEntitiesResponse();
                response.Results["EntityMetadata"] = tables;
                return response;
            },
            OnRetrieve = query => query switch
            {
                QueryExpression => new EntityCollection([Organization(true)]),
                FetchExpression fetch when fetch.Query.Contains("isreadyforrecyclebin") => new EntityCollection([ready, custom]),
                _ => new EntityCollection([OrgConfig(30)]),
            },
        };

        var result = await Service(client).GetTablesAsync(null, CancellationToken.None);

        var request = Assert.IsType<RetrieveAllEntitiesRequest>(client.Requests.Single());
        Assert.Equal(EntityFilters.Entity, request.EntityFilters);
        var rows = result.Value!.Tables;
        Assert.Equal(["account", "contact", "task"], rows.Select(row => row.LogicalName));
        Assert.Equal(new TableDto("account", "Account", "accountid", "name", false, true, false, null), rows[0]);
        Assert.Equal(new TableDto("contact", "contact", "contactid", "name", true, false, false, 30), rows[1]);
        Assert.Equal(7, rows[2].RetentionDays);
        Assert.True(rows[2].IsActivity);

        var audit = await Service(client).GetTablesAsync("audit", CancellationToken.None);
        Assert.Equal(["account"], audit.Value!.Tables.Select(row => row.LogicalName));
    }

    // ── Deleted records ──────────────────────────────────────────────────────

    [Fact]
    public void Audit_query_uses_the_logical_name_utc_bounds_order_and_paging()
    {
        var fetch = XElement.Parse(RecycleBinQueries.AuditDeletes(
            "new_project",
            new DateTime(2026, 9, 30, 22, 0, 0, DateTimeKind.Utc),
            new DateTime(2026, 10, 11, 22, 0, 0, DateTimeKind.Utc),
            UserId,
            250,
            2,
            "<cookie page=\"1\" />").Query);

        Assert.Equal("250", fetch.Attribute("count")!.Value);
        Assert.Equal("2", fetch.Attribute("page")!.Value);
        Assert.Equal("<cookie page=\"1\" />", fetch.Attribute("paging-cookie")!.Value);
        var conditions = fetch.Descendants("condition")
            .ToDictionary(c => $"{c.Attribute("attribute")!.Value} {c.Attribute("operator")!.Value}", c => c.Attribute("value")!.Value);
        Assert.Equal("3", conditions["operation eq"]);
        Assert.Equal("new_project", conditions["objecttypecode eq"]);
        Assert.Equal("2026-09-30T22:00:00Z", conditions["createdon ge"]);
        Assert.Equal("2026-10-11T22:00:00Z", conditions["createdon lt"]);
        Assert.Equal(UserId.ToString("D"), conditions["userid eq"]);
        Assert.Equal(
            ["createdon:true", "auditid:true"],
            fetch.Descendants("order").Select(o => $"{o.Attribute("attribute")!.Value}:{o.Attribute("descending")!.Value}"));
    }

    [Fact]
    public async Task Audit_listing_reads_old_values_in_one_batch_and_flags_rows_without_values()
    {
        var oldA = new Entity("account", RecordA) { ["name"] = "Contoso" };
        var rowA = new Entity("audit", AuditA)
        {
            ["objectid"] = new EntityReference("account", RecordA),
            ["userid"] = new EntityReference("systemuser", UserId) { Name = "Avery Admin" },
            ["callinguserid"] = new EntityReference("systemuser", Guid.NewGuid()) { Name = "Flow app" },
            ["createdon"] = new DateTime(2026, 10, 2, 8, 30, 0, DateTimeKind.Utc),
        };
        var rowB = new Entity("audit", AuditB)
        {
            ["objectid"] = new EntityReference("account", RecordB),
            ["userid"] = new EntityReference("systemuser", UserId) { Name = "Avery Admin" },
            ["createdon"] = new DateTime(2026, 10, 1, 8, 30, 0, DateTimeKind.Utc),
        };
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = _ => new EntityCollection([rowA, rowB]) { MoreRecords = true, PagingCookie = "<cookie />" },
            OnExecute = request => request switch
            {
                RetrieveEntityRequest => EntityResponse(Table("account", "Account")),
                ExecuteMultipleRequest multiple => Batch(multiple, AuditDetails(oldA), null),
                _ => throw new InvalidOperationException(request.RequestName),
            },
        };

        var result = await Service(client).GetDeletedAsync(
            new DeletedBody("audit", "account", "2026-09-30T22:00:00.000Z", "2026-10-11T22:00:00.000Z", null, 100, null, 1),
            CancellationToken.None);

        var batch = Assert.Single(client.Requests.OfType<ExecuteMultipleRequest>());
        Assert.True(batch.Settings.ContinueOnError);
        Assert.Equal(2, batch.Requests.Count);
        var records = result.Value!.Records;
        Assert.Equal(AuditA.ToString("D"), records[0].Key);
        Assert.Equal("Contoso", records[0].Name);
        Assert.Equal("2026-10-02T08:30:00Z", records[0].DeletedOn);
        Assert.Equal("Avery Admin", records[0].DeletedBy);
        Assert.Equal("Flow app", records[0].CallingUser);
        Assert.True(records[0].HasValues);
        Assert.Null(records[1].Name);
        Assert.Null(records[1].CallingUser);
        Assert.False(records[1].HasValues);
        Assert.True(result.Value.MoreRecords);
        Assert.Equal("<cookie />", result.Value.PagingCookie);
    }

    private static ExecuteMultipleResponse Batch(ExecuteMultipleRequest request, params OrganizationResponse?[] responses)
    {
        var items = new ExecuteMultipleResponseItemCollection();
        for (var index = 0; index < request.Requests.Count; index++)
        {
            var response = index < responses.Length ? responses[index] : null;
            items.Add(new ExecuteMultipleResponseItem
            {
                RequestIndex = index,
                Response = response,
                Fault = response is null ? new OrganizationServiceFault { Message = "gone" } : null,
            });
        }

        var result = new ExecuteMultipleResponse();
        result.Results["Responses"] = items;
        result.Results["IsFaulted"] = items.Any(item => item.Fault is not null);
        return result;
    }

    [Fact]
    public async Task Bin_listing_queries_the_bin_and_takes_the_deletion_from_the_audit_log()
    {
        var binRow = new Entity("account", RecordA) { ["accountid"] = RecordA, ["name"] = "Contoso" };
        var delete = new Entity("audit", AuditA)
        {
            ["objectid"] = new EntityReference("account", RecordA),
            ["userid"] = new EntityReference("systemuser", UserId) { Name = "Avery Admin" },
            ["createdon"] = new DateTime(2026, 10, 2, 8, 30, 0, DateTimeKind.Utc),
        };
        var client = new FakeRecycleBinClient
        {
            OnRetrieve = query => IsFetchOn(query, "account", bin: true)
                ? new EntityCollection([binRow])
                : new EntityCollection([delete]),
            OnExecute = _ => EntityResponse(Table("account", "Account")),
        };

        var result = await Service(client).GetDeletedAsync(
            new DeletedBody("bin", "account", null, null, null, 50, null, 1),
            CancellationToken.None);

        var fetch = client.Fetches.First();
        Assert.Equal("bin", fetch.Attribute("datasource")!.Value);
        Assert.Equal("50", fetch.Attribute("count")!.Value);
        var record = Assert.Single(result.Value!.Records);
        Assert.Equal(RecordA.ToString("D"), record.Key);
        Assert.Equal("Contoso", record.Name);
        Assert.Equal("Avery Admin", record.DeletedBy);
        Assert.Equal("2026-10-02T08:30:00Z", record.DeletedOn);
        Assert.Null(record.AuditId);
    }

    [Fact]
    public async Task Bin_listing_is_refused_on_premises()
    {
        var result = await Service(new FakeRecycleBinClient(), online: false).GetDeletedAsync(
            new DeletedBody("bin", "account", null, null, null, 50, null, 1),
            CancellationToken.None);

        Assert.Equal("BinUnavailable", result.Problem!.Code);
    }

    [Theory]
    [InlineData("account'/><condition attribute='x")]
    [InlineData("")]
    public async Task Listing_rejects_table_names_that_are_not_logical_names(string table)
    {
        var client = new FakeRecycleBinClient();
        var result = await Service(client).GetDeletedAsync(
            new DeletedBody("audit", table, "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", null, 50, null, 1),
            CancellationToken.None);

        Assert.Equal(400, result.Problem!.Status);
        Assert.Empty(client.Queries);
    }

    // ── Record details ───────────────────────────────────────────────────────

    [Fact]
    public async Task Audit_details_serialize_lookups_choices_dates_and_money()
    {
        var oldValue = new Entity("account", RecordA)
        {
            ["name"] = "Contoso",
            ["primarycontactid"] = new EntityReference("contact", RecordB) { Name = "Sam" },
            ["industrycode"] = new OptionSetValue(3),
            ["donotemail"] = true,
            ["revenue"] = new Money(1250.5m),
            ["createdon"] = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc),
        };
        var client = new FakeRecycleBinClient { OnExecute = _ => AuditDetails(oldValue) };

        var result = await Service(client).GetRecordAsync("account", RecordA.ToString(), "audit", AuditA.ToString(), CancellationToken.None);

        var fields = result.Value!.Fields.ToDictionary(field => field.LogicalName);
        Assert.Equal(new FieldDto("primarycontactid", "lookup", RecordB.ToString("D"), "Sam", "contact"), fields["primarycontactid"]);
        Assert.Equal("choice", fields["industrycode"].Kind);
        Assert.Equal("3", fields["industrycode"].Value);
        Assert.Equal("true", fields["donotemail"].Value);
        Assert.Equal("1250.5", fields["revenue"].Value);
        Assert.Equal("2026-01-02T03:04:05Z", fields["createdon"].Value);
        Assert.Equal(AuditA, Assert.IsType<RetrieveAuditDetailsRequest>(client.Requests.Single()).AuditId);
    }

    [Fact]
    public async Task Bin_details_report_a_record_that_left_the_bin()
    {
        var client = new FakeRecycleBinClient { OnExecute = _ => EntityResponse(Table("account", "Account")) };

        var result = await Service(client).GetRecordAsync("account", RecordA.ToString(), "bin", null, CancellationToken.None);

        Assert.Equal(404, result.Problem!.Status);
        Assert.Equal(RecycleBinFaults.NotInBinCode, result.Problem.Code);
        Assert.Contains("all-attributes", Assert.IsType<FetchExpression>(client.Queries.Single()).Query);
    }

    // ── Restore from the bin ─────────────────────────────────────────────────

    [Fact]
    public async Task Bin_restore_sends_only_the_id_and_continues_past_failures()
    {
        var client = new FakeRecycleBinClient
        {
            OnExecute = request =>
            {
                var target = (Entity)request.Parameters["Target"];
                if (target.Id == RecordB) throw Fault(RecycleBinFaults.RefCannotBeRestoredRecycleBinNotFound);
                return new OrganizationResponse();
            },
        };

        var result = await Service(client).RestoreAsync(
            new RestoreBody("bin", [new("account", RecordA.ToString(), null), new("account", RecordB.ToString(), null), new("account", RecordC.ToString(), null)]),
            CancellationToken.None);

        Assert.Equal(3, client.Requests.Count);
        Assert.All(client.Requests, request =>
        {
            Assert.Equal("Restore", request.RequestName);
            var target = (Entity)request.Parameters["Target"];
            Assert.Equal("account", target.LogicalName);
            Assert.Empty(target.Attributes);
        });
        Assert.Equal(["restored", "failed", "restored"], result.Value!.Results.Select(r => r.Status));
        Assert.Equal(RecycleBinFaults.RefMissingCode, result.Value.Results[1].Code);
    }

    [Theory]
    [InlineData(unchecked((int)0x80049959), "RelatedRecordMissing")]
    [InlineData(unchecked((int)0x80049939), "DuplicateRecord")]
    [InlineData(unchecked((int)0x80044a02), "DuplicateRecord")]
    [InlineData(unchecked((int)0x80049929), "DuplicateKey")]
    [InlineData(unchecked((int)0x80049949), "ChoiceValueRemoved")]
    [InlineData(unchecked((int)0x80040217), "NotInRecycleBin")]
    [InlineData(unchecked((int)0x80040220), "PrivilegeDenied")]
    [InlineData(unchecked((int)0x80040265), "PluginError")]
    [InlineData(unchecked((int)0x80040000), "DataverseFault")]
    public void Recycle_bin_faults_map_by_number(int code, string expected)
    {
        Assert.Equal(expected, RecycleBinFaults.ForRestore(Fault(code), RecycleBinSources.Bin).Code);
    }

    [Fact]
    public void Faults_fall_back_to_the_documented_name()
    {
        var fault = Fault(0);
        fault.Detail.ErrorDetails["ErrorName"] = "PicklistValueOutOfRangeRecycleBin";

        Assert.Equal(RecycleBinFaults.ChoiceRemovedCode, RecycleBinFaults.ForRestore(fault, RecycleBinSources.Bin).Code);
    }

    [Fact]
    public void Audit_faults_map_duplicates_and_missing_references()
    {
        Assert.Equal("DuplicateRecord", RecycleBinFaults.ForRestore(Fault(RecycleBinFaults.DuplicateRecord), "audit").Code);
        Assert.Equal("DuplicateKey", RecycleBinFaults.ForRestore(Fault(RecycleBinFaults.DuplicateRecordEntityKey), "audit").Code);
        Assert.Equal("RelatedRecordMissing", RecycleBinFaults.ForRestore(Fault(RecycleBinFaults.ObjectDoesNotExist), "audit").Code);
    }

    [Fact]
    public async Task Service_protection_faults_wait_for_retry_after_instead_of_failing()
    {
        var attempts = 0;
        var delay = new RecordingDelay();
        var client = new FakeRecycleBinClient
        {
            OnExecute = _ =>
            {
                attempts++;
                if (attempts < 3) throw Fault(RecycleBinFaults.NumberOfRequestsLimitExceeded, retryAfter: "00:00:07");
                return new OrganizationResponse();
            },
        };

        var result = await Service(client, delay: delay).RestoreAsync(
            new RestoreBody("bin", [new("account", RecordA.ToString(), null)]),
            CancellationToken.None);

        Assert.Equal("restored", Assert.Single(result.Value!.Results).Status);
        Assert.Equal([TimeSpan.FromSeconds(7), TimeSpan.FromSeconds(7)], delay.Waits);
    }

    [Fact]
    public async Task Restore_rejects_more_than_one_hundred_items()
    {
        var items = Enumerable.Range(0, 101).Select(_ => new RestoreItem("account", Guid.NewGuid().ToString(), null)).ToList();

        var result = await Service(new FakeRecycleBinClient()).RestoreAsync(new RestoreBody("bin", items), CancellationToken.None);

        Assert.Equal("TooManyItems", result.Problem!.Code);
    }

    // ── Restore from the audit log ───────────────────────────────────────────

    private static EntityMetadata AccountWithColumns(bool activity = false, string name = "account") =>
        Table(
            name,
            "Account",
            activity: activity,
            attributes:
            [
                Column("name", true),
                Column("ownerid", true),
                Column("statuscode", true),
                Column("statecode", false),
                Column("createdon", false),
                Column("modifiedon", false),
                Column("overriddencreatedon", true),
                Column("versionnumber", false),
            ]);

    [Fact]
    public void Audit_create_keeps_only_create_valid_columns_and_maps_createdon()
    {
        var created = new DateTime(2025, 5, 6, 7, 8, 9, DateTimeKind.Utc);
        var oldValue = new Entity("account", RecordA)
        {
            ["accountid"] = RecordA,
            ["name"] = "Contoso",
            ["createdon"] = created,
            ["modifiedon"] = DateTime.UtcNow,
            ["versionnumber"] = 42L,
            ["statecode"] = new OptionSetValue(1),
            ["statuscode"] = new OptionSetValue(2),
            ["new_notincolumns"] = "x",
        };

        var plan = RecycleBinService.PlanAuditCreate(AccountWithColumns(), RecordA, oldValue);

        Assert.Equal(RecordA, plan.Record.Id);
        Assert.Equal(["name", "overriddencreatedon"], plan.Record.Attributes.Keys.Order());
        Assert.Equal(created, plan.Record["overriddencreatedon"]);
        Assert.Equal(1, plan.OldState);
        Assert.Equal(2, plan.OldStatus);
    }

    [Fact]
    public void Audit_create_keeps_an_active_status_reason()
    {
        var oldValue = new Entity("account", RecordA)
        {
            ["name"] = "Contoso",
            ["statecode"] = new OptionSetValue(0),
            ["statuscode"] = new OptionSetValue(100000001),
        };

        var plan = RecycleBinService.PlanAuditCreate(AccountWithColumns(), RecordA, oldValue);

        Assert.Equal(100000001, plan.Record.GetAttributeValue<OptionSetValue>("statuscode").Value);
        Assert.False(plan.Record.Contains("statecode"));
    }

    private static FakeRecycleBinClient AuditRestoreClient(EntityMetadata table, Entity? oldValue, Func<OrganizationRequest, OrganizationResponse?>? extra = null) =>
        new()
        {
            OnExecute = request => extra?.Invoke(request) ?? request switch
            {
                RetrieveEntityRequest => EntityResponse(table),
                RetrieveAuditDetailsRequest => AuditDetails(oldValue),
                _ => new OrganizationResponse(),
            },
        };

    [Fact]
    public async Task Audit_restore_creates_then_puts_back_an_inactive_state()
    {
        var oldValue = new Entity("account", RecordA)
        {
            ["name"] = "Contoso",
            ["statecode"] = new OptionSetValue(1),
            ["statuscode"] = new OptionSetValue(2),
        };
        var client = AuditRestoreClient(AccountWithColumns(), oldValue);

        var result = await Service(client, online: false).RestoreAsync(
            new RestoreBody("audit", [new("account", RecordA.ToString(), AuditA.ToString())]),
            CancellationToken.None);

        var outcome = Assert.Single(result.Value!.Results);
        Assert.Equal("restored", outcome.Status);
        Assert.Null(outcome.Warning);
        var create = Assert.Single(client.Requests.OfType<CreateRequest>());
        Assert.Equal(RecordA, create.Target.Id);
        var update = Assert.Single(client.Requests.OfType<UpdateRequest>());
        Assert.Equal(1, update.Target.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(2, update.Target.GetAttributeValue<OptionSetValue>("statuscode").Value);
        var metadata = Assert.Single(client.Requests.OfType<RetrieveEntityRequest>());
        Assert.Equal(EntityFilters.Attributes, metadata.EntityFilters);
    }

    [Fact]
    public async Task Audit_restore_leaves_special_state_tables_active_with_a_warning()
    {
        var oldValue = new Entity("incident", RecordA) { ["name"] = "Case", ["statecode"] = new OptionSetValue(1) };
        var client = AuditRestoreClient(AccountWithColumns(name: "incident"), oldValue);

        var result = await Service(client, online: false).RestoreAsync(
            new RestoreBody("audit", [new("incident", RecordA.ToString(), AuditA.ToString())]),
            CancellationToken.None);

        var outcome = Assert.Single(result.Value!.Results);
        Assert.Equal("restored", outcome.Status);
        Assert.Contains("active", outcome.Warning);
        Assert.Empty(client.Requests.OfType<UpdateRequest>());
    }

    [Fact]
    public async Task Audit_restore_warns_that_activity_parties_are_lost()
    {
        var oldValue = new Entity("task", RecordA) { ["name"] = "Call back" };
        var client = AuditRestoreClient(AccountWithColumns(activity: true, name: "task"), oldValue);

        var result = await Service(client, online: false).RestoreAsync(
            new RestoreBody("audit", [new("task", RecordA.ToString(), AuditA.ToString())]),
            CancellationToken.None);

        Assert.Contains("Activity parties", Assert.Single(result.Value!.Results).Warning);
    }

    [Fact]
    public async Task Audit_restore_reports_duplicates_and_missing_values_per_record()
    {
        var oldValue = new Entity("account", RecordA) { ["name"] = "Contoso" };
        var client = AuditRestoreClient(AccountWithColumns(), oldValue, request => request switch
        {
            CreateRequest => throw Fault(RecycleBinFaults.DuplicateRecord),
            RetrieveAuditDetailsRequest details when details.AuditId == AuditB => AuditDetails(null),
            _ => null,
        });

        var result = await Service(client, online: false).RestoreAsync(
            new RestoreBody("audit", [new("account", RecordA.ToString(), AuditA.ToString()), new("account", RecordB.ToString(), AuditB.ToString())]),
            CancellationToken.None);

        Assert.Equal(["DuplicateRecord", "NoAuditedValues"], result.Value!.Results.Select(r => r.Code));
        Assert.Single(client.Requests.OfType<CreateRequest>());
        Assert.Single(client.Requests.OfType<RetrieveEntityRequest>());
    }

    [Fact]
    public async Task Audit_restore_skips_a_record_that_is_still_in_the_recycle_bin()
    {
        var ready = new Entity(RecycleBinQueries.ConfigTable, Guid.NewGuid()) { ["cleanupintervalindays"] = -1 };
        ready["table.logicalname"] = new AliasedValue("entity", "logicalname", "account");
        var client = AuditRestoreClient(AccountWithColumns(), new Entity("account", RecordA) { ["name"] = "Contoso" });
        client.OnRetrieve = query => query switch
        {
            FetchExpression fetch when fetch.Query.Contains("isreadyforrecyclebin") => new EntityCollection([ready]),
            _ when IsFetchOn(query, "account", bin: true) => new EntityCollection([new Entity("account", RecordA)]),
            _ => new EntityCollection([OrgConfig(30)]),
        };

        var result = await Service(client).RestoreAsync(
            new RestoreBody("audit", [new("account", RecordA.ToString(), AuditA.ToString())]),
            CancellationToken.None);

        var outcome = Assert.Single(result.Value!.Results);
        Assert.Equal("skipped", outcome.Status);
        Assert.Equal(RecycleBinFaults.InRecycleBinCode, outcome.Code);
        Assert.Empty(client.Requests.OfType<CreateRequest>());
    }

    [Fact]
    public async Task Audit_restore_refuses_solution_component_tables()
    {
        var client = AuditRestoreClient(AccountWithColumns(name: "workflow"), new Entity("workflow", RecordA) { ["name"] = "Flow" });

        var result = await Service(client, online: false).RestoreAsync(
            new RestoreBody("audit", [new("workflow", RecordA.ToString(), AuditA.ToString())]),
            CancellationToken.None);

        Assert.Equal(RecycleBinFaults.NotRestorableTableCode, Assert.Single(result.Value!.Results).Code);
        Assert.Empty(client.Requests.OfType<CreateRequest>());
    }
}
