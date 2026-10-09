using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;
using PowerTools.API.Tools.Translator;
using Xunit;

namespace PowerTools.API.Translator.Tests;

public sealed class TranslatorSolutionTests
{
    private static readonly Guid SolutionId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid AccountId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid ContactId = Guid.Parse("a0000000-0000-0000-0000-000000000002");
    private static readonly Guid LeadId = Guid.Parse("a0000000-0000-0000-0000-000000000003");
    private static readonly Guid CaseId = Guid.Parse("a0000000-0000-0000-0000-000000000004");
    private static readonly Guid AccountNameId = Guid.Parse("b0000000-0000-0000-0000-000000000001");
    private static readonly Guid AccountPhoneId = Guid.Parse("b0000000-0000-0000-0000-000000000002");
    private static readonly Guid ContactEmailId = Guid.Parse("b0000000-0000-0000-0000-000000000003");
    private static readonly Guid RelationshipId = Guid.Parse("c0000000-0000-0000-0000-000000000001");
    private static readonly Guid ViewId = Guid.Parse("d0000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherViewId = Guid.Parse("d0000000-0000-0000-0000-000000000002");
    private static readonly Guid ColorId = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly Guid PublisherId = Guid.Parse("f0000000-0000-0000-0000-000000000001");
    private static readonly Guid ReadOnlyPublisherId = Guid.Parse("f0000000-0000-0000-0000-000000000002");

    private static readonly DataverseConnectionContext Connection =
        new OnlineConnectionContext("https://dev.example.test", "token");

    private static Entity Component(int type, Guid objectId, int? behavior = null)
    {
        var row = new Entity("solutioncomponent", Guid.NewGuid());
        row["solutionid"] = SolutionId;
        row["objectid"] = objectId;
        row["componenttype"] = new OptionSetValue(type);
        if (behavior is not null) row["rootcomponentbehavior"] = new OptionSetValue(behavior.Value);
        return row;
    }

    private static Entity Solution(string uniqueName, bool managed = false, bool visible = true)
    {
        var row = new Entity("solution", Guid.NewGuid());
        row["uniquename"] = uniqueName;
        row["friendlyname"] = uniqueName + " name";
        row["ismanaged"] = managed;
        row["isvisible"] = visible;
        row["version"] = "1.0.0.0";
        row["publisherid"] = new EntityReference("publisher", PublisherId) { Name = "Contoso" };
        return row;
    }

    private static Entity Publisher(Guid id, string uniqueName, bool readOnly)
    {
        var row = new Entity("publisher", id);
        row["publisherid"] = id;
        row["uniquename"] = uniqueName;
        row["friendlyname"] = uniqueName + " name";
        row["customizationprefix"] = "new";
        row["isreadonly"] = readOnly;
        return row;
    }

    private static Entity View(Guid id, string table)
    {
        var view = new Entity("savedquery", id);
        view["returnedtypecode"] = table;
        view["querytype"] = 0;
        return view;
    }

    /// <summary>account (in solution, no subcomponents), contact (column only), lead (all subcomponents), incident (view only).</summary>
    private static FakeTranslatorClient SolutionOrg()
    {
        var fake = new FakeTranslatorClient();

        var account = Builders.Table("account", "Account");
        account.MetadataId = AccountId;
        var name = Builders.Attribute(new StringAttributeMetadata(), "name", "Account Name");
        name.MetadataId = AccountNameId;
        var phone = Builders.Attribute(new StringAttributeMetadata(), "telephone1", "Main Phone");
        phone.MetadataId = AccountPhoneId;
        account.SetAttributes(name, phone);
        var oneToMany = new OneToManyRelationshipMetadata
        {
            SchemaName = "account_contacts",
            ReferencedEntity = "account",
            ReferencingEntity = "contact",
            MetadataId = RelationshipId,
            AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("People"),
            },
        };
        account.SetOneToMany(oneToMany);

        var contact = Builders.Table("contact", "Contact");
        contact.MetadataId = ContactId;
        var email = Builders.Attribute(new StringAttributeMetadata(), "emailaddress1", "Email");
        email.MetadataId = ContactEmailId;
        contact.SetAttributes(email);

        var lead = Builders.Table("lead", "Lead");
        lead.MetadataId = LeadId;
        lead.SetAttributes(Builders.Attribute(new StringAttributeMetadata(), "subject", "Topic"));

        var incident = Builders.Table("incident", "Case");
        incident.MetadataId = CaseId;

        var intersect = Builders.Table("accountleads", "Account Leads");
        Builders.SetInternal(intersect, nameof(EntityMetadata.IsIntersect), true);

        fake.Tables["account"] = account;
        fake.Tables["contact"] = contact;
        fake.Tables["lead"] = lead;
        fake.Tables["incident"] = incident;
        fake.Tables["accountleads"] = intersect;

        fake.Views.Add(View(ViewId, "incident"));
        fake.Views.Add(View(OtherViewId, "incident"));
        foreach (var id in new[] { ViewId, OtherViewId })
        {
            fake.LocLabels[(id, "name")] = Builders.En(id == ViewId ? "Active Cases" : "My Cases");
            fake.LocLabels[(id, "description")] = new Label();
        }

        var color = new OptionSetMetadata { Name = "new_color", DisplayName = Builders.En("Color"), Description = new Label(), IsGlobal = true, MetadataId = ColorId };
        var size = new OptionSetMetadata { Name = "new_size", DisplayName = Builders.En("Size"), Description = new Label(), IsGlobal = true, MetadataId = Guid.NewGuid() };
        fake.OptionSets.AddRange([color, size]);

        fake.Records["solutioncomponent"] =
        [
            Component(SolutionComponentTypes.Entity, AccountId, behavior: 1),
            Component(SolutionComponentTypes.Attribute, AccountNameId),
            Component(SolutionComponentTypes.Relationship, RelationshipId),
            Component(SolutionComponentTypes.Attribute, ContactEmailId),
            Component(SolutionComponentTypes.Entity, LeadId, behavior: 0),
            Component(SolutionComponentTypes.SavedQuery, ViewId),
            Component(SolutionComponentTypes.OptionSet, ColorId),
        ];
        fake.Records["solution"] = [Solution("Default"), Solution("Active"), Solution("ContosoCore"), Solution("Vendor", managed: true)];
        fake.Records["publisher"] = [Publisher(PublisherId, "contoso", false), Publisher(ReadOnlyPublisherId, "MicrosoftCorporation", true)];
        return fake;
    }

    private static async Task<IReadOnlyList<LabelRowDto>> Query(FakeTranslatorClient fake, string kind, params string[] tables)
    {
        var result = await new TranslatorService(fake).QueryLabelsAsync(
            new LabelQueryBody { Tables = tables, Kinds = [kind], Lcids = [1033, 1036], SolutionId = SolutionId },
            CancellationToken.None);
        Assert.Null(result.Problem);
        return result.Value!.Rows;
    }

    [Fact]
    public async Task Tables_use_a_light_metadata_query_and_hide_intersect_tables()
    {
        var fake = SolutionOrg();

        var result = await new TranslatorService(fake).GetTablesAsync(null, default);

        Assert.Null(result.Problem);
        Assert.Equal(["Account", "Case", "Contact", "Lead"], result.Value!.Tables.Select(table => table.DisplayName));
        var request = Assert.Single(fake.MetadataRequests);
        Assert.Equal([1033], request.Query.LabelQuery.FilterLanguages);
        Assert.DoesNotContain("Attributes", request.Query.Properties.PropertyNames);
    }

    [Fact]
    public async Task Tables_for_a_solution_include_tables_whose_subcomponents_are_in_it()
    {
        var fake = SolutionOrg();
        fake.Tables["opportunity"] = Builders.Table("opportunity", "Opportunity");

        var result = await new TranslatorService(fake).GetTablesAsync(SolutionId, default);

        Assert.Null(result.Problem);
        // account: table row; contact: a column; lead: all subcomponents; incident: a view.
        Assert.Equal(["account", "incident", "contact", "lead"], result.Value!.Tables.Select(table => table.LogicalName));
        var components = fake.Queries.Single(query => query.EntityName == "solutioncomponent");
        Assert.NotNull(components.PageInfo);
        Assert.Equal(5000, components.PageInfo.Count);
        var types = components.Criteria.Conditions.Single(condition => condition.AttributeName == "componenttype");
        Assert.Equal(SolutionComponentTypes.All.Cast<object>(), types.Values);
    }

    [Fact]
    public async Task Solutions_leave_out_Default_and_Active_and_publishers_leave_out_read_only_ones()
    {
        var fake = SolutionOrg();
        var service = new TranslatorService(fake);

        var solutions = await service.GetSolutionsAsync(default);
        var publishers = await service.GetPublishersAsync(default);

        Assert.Equal(["ContosoCore", "Vendor"], solutions.Value!.Solutions.Select(solution => solution.UniqueName));
        Assert.True(solutions.Value.Solutions[1].IsManaged);
        Assert.Equal("Contoso", solutions.Value.Solutions[0].PublisherName);
        Assert.Equal(["contoso"], publishers.Value!.Publishers.Select(publisher => publisher.UniqueName));
        var solutionQuery = fake.Queries.First(query => query.EntityName == "solution");
        Assert.Contains(solutionQuery.Criteria.Conditions, condition => condition.AttributeName == "isvisible");
    }

    [Fact]
    public async Task A_table_without_subcomponents_shows_its_own_labels_and_only_its_solution_columns()
    {
        var fake = SolutionOrg();

        var tableRows = await Query(fake, LabelKinds.Table, "account");
        var columns = await Query(fake, LabelKinds.Column, "account");
        var relationships = await Query(fake, LabelKinds.Relationship, "account");

        Assert.Equal(3, tableRows.Count);
        Assert.Equal(2, columns.Count);
        Assert.All(columns, row => Assert.Equal("name", row.Key.Column));
        Assert.Equal("account_contacts", Assert.Single(relationships).Key.Relationship);
    }

    [Fact]
    public async Task A_table_only_reached_through_a_column_has_no_table_labels()
    {
        var fake = SolutionOrg();

        Assert.Empty(await Query(fake, LabelKinds.Table, "contact"));
        var columns = await Query(fake, LabelKinds.Column, "contact");
        Assert.Equal(2, columns.Count);
        Assert.All(columns, row => Assert.Equal("emailaddress1", row.Key.Column));
    }

    [Fact]
    public async Task A_table_added_with_all_subcomponents_shows_everything()
    {
        var fake = SolutionOrg();

        Assert.Equal(3, (await Query(fake, LabelKinds.Table, "lead")).Count);
        Assert.Equal(2, (await Query(fake, LabelKinds.Column, "lead")).Count);
    }

    [Fact]
    public async Task Views_and_global_choices_are_limited_to_the_solution()
    {
        var fake = SolutionOrg();

        var views = await Query(fake, LabelKinds.View, "incident");
        var global = await Query(fake, LabelKinds.GlobalChoice);

        Assert.NotEmpty(views);
        Assert.All(views, row => Assert.Equal(ViewId, row.Key.RecordId));
        Assert.All(global, row => Assert.Equal("new_color", row.Key.OptionSet));
        Assert.NotEmpty(global);
    }

    // ── Apply into a solution ────────────────────────────────────────────────

    private static ApplyRowDto Row(LabelKeyDto key, params (int Lcid, string Text)[] labels) =>
        new() { Key = key, Labels = labels.ToDictionary(label => label.Lcid, label => label.Text) };

    private static async Task<TranslatorResult<PreparedApply>> Prepare(FakeTranslatorClient fake, ApplySolutionDto solution) =>
        await new TranslatorService(fake).PrepareApplyAsync(
            new ApplyBody
            {
                Rows = [Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.DisplayName }, (1036, "Compte"))],
                Solution = solution,
            },
            default);

    private static async Task<(TranslatorJobDto Job, FakeTranslatorClient Fake)> Run(
        FakeTranslatorClient fake,
        ApplySolutionDto solution,
        params ApplyRowDto[] rows)
    {
        var prepared = await new TranslatorService(fake).PrepareApplyAsync(
            new ApplyBody { Rows = rows.ToList(), Solution = solution },
            default);
        Assert.Null(prepared.Problem);
        var job = new TranslatorJob(prepared.Value!, Connection);
        await new TranslatorApply(fake, new NoDelay()).RunAsync(job, CancellationToken.None);
        return (job.ToDto(), fake);
    }

    [Theory]
    [InlineData("Vendor", "managed")]
    [InlineData("Missing", "not found")]
    [InlineData("Default", "cannot be added")]
    public async Task Existing_target_must_be_a_visible_unmanaged_solution(string uniqueName, string message)
    {
        var result = await Prepare(SolutionOrg(), new ApplySolutionDto { UniqueName = uniqueName });

        Assert.Equal(400, result.Problem!.Status);
        Assert.Contains(message, result.Problem.Message);
    }

    [Theory]
    [InlineData("", "new_x", "f0000000-0000-0000-0000-000000000001", "1.0.0.0", "display name")]
    [InlineData("X", "9bad", "f0000000-0000-0000-0000-000000000001", "1.0.0.0", "letters, numbers")]
    [InlineData("X", "new_x", "f0000000-0000-0000-0000-000000000001", "one", "version")]
    [InlineData("X", "new_x", "f0000000-0000-0000-0000-000000000002", "1.0", "read-only")]
    [InlineData("X", "ContosoCore", "f0000000-0000-0000-0000-000000000001", "1.0.0.0", "already exists")]
    public async Task New_target_is_checked_before_any_label_is_written(
        string friendly, string unique, string publisher, string version, string message)
    {
        var fake = SolutionOrg();
        var result = await Prepare(fake, new ApplySolutionDto
        {
            New = new NewSolutionDto { FriendlyName = friendly, UniqueName = unique, PublisherId = Guid.Parse(publisher), Version = version },
        });

        Assert.Equal(400, result.Problem!.Status);
        Assert.Contains(message, result.Problem.Message);
        Assert.Empty(fake.Batches);
    }

    [Fact]
    public async Task Changed_components_are_added_once_after_the_labels_and_publish()
    {
        var fake = SolutionOrg();
        var account = fake.Tables["account"];
        var picklist = Builders.Attribute(
            new PicklistAttributeMetadata { OptionSet = Builders.LocalOptions((1, "Hot")) }, "new_temp", "Temperature");
        picklist.MetadataId = Guid.NewGuid();
        account.SetAttributes([.. account.Attributes, picklist]);

        var (job, _) = await Run(
            fake,
            new ApplySolutionDto { UniqueName = "ContosoCore" },
            Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.DisplayName }, (1036, "Compte")),
            Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.Description }, (1036, "Desc")),
            Row(new LabelKeyDto { Kind = LabelKinds.Choice, Table = "account", Column = "new_temp", Value = 1, Property = LabelProperties.Label }, (1036, "Chaud")),
            Row(new LabelKeyDto { Kind = LabelKinds.Choice, Table = "account", Column = "new_temp", Value = 1, Property = LabelProperties.Description }, (1036, "Très")),
            Row(new LabelKeyDto { Kind = LabelKinds.View, Table = "incident", RecordId = ViewId, Property = LabelProperties.RecordName }, (1036, "Dossiers")),
            Row(new LabelKeyDto { Kind = LabelKinds.GlobalChoice, OptionSet = "new_color", Value = null, Property = LabelProperties.DisplayName }, (1036, "Couleur")));

        Assert.Equal("completed", job.Status);
        Assert.Equal(SolutionStatuses.Succeeded, job.Solution.Status);
        Assert.Equal(4, job.Solution.Added);
        Assert.Single(fake.Published);

        var adds = fake.Batches.Last().Cast<AddSolutionComponentRequest>().ToList();
        Assert.All(adds, add => Assert.Equal("ContosoCore", add.SolutionUniqueName));
        Assert.All(adds, add => Assert.False(add.AddRequiredComponents));
        var table = Assert.Single(adds, add => add.ComponentType == SolutionComponentTypes.Entity);
        Assert.Equal(AccountId, table.ComponentId);
        Assert.True(table.DoNotIncludeSubcomponents);
        Assert.Equal(picklist.MetadataId, Assert.Single(adds, add => add.ComponentType == SolutionComponentTypes.Attribute).ComponentId);
        Assert.Equal(ViewId, Assert.Single(adds, add => add.ComponentType == SolutionComponentTypes.SavedQuery).ComponentId);
        Assert.Equal(ColorId, Assert.Single(adds, add => add.ComponentType == SolutionComponentTypes.OptionSet).ComponentId);
        Assert.False(job.Solution.Created);
    }

    [Fact]
    public async Task A_new_solution_is_created_with_the_chosen_publisher_and_version()
    {
        var fake = SolutionOrg();

        var (job, _) = await Run(
            fake,
            new ApplySolutionDto
            {
                New = new NewSolutionDto { FriendlyName = "Labels FR", UniqueName = "new_labelsfr", PublisherId = PublisherId, Version = null },
            },
            Row(new LabelKeyDto { Kind = LabelKinds.Column, Table = "account", Column = "name", Property = LabelProperties.DisplayName }, (1036, "Nom")));

        var created = Assert.Single(fake.Created);
        Assert.Equal("solution", created.LogicalName);
        Assert.Equal("new_labelsfr", created["uniquename"]);
        Assert.Equal("Labels FR", created["friendlyname"]);
        Assert.Equal("1.0.0.0", created["version"]);
        Assert.Equal(PublisherId, ((EntityReference)created["publisherid"]).Id);
        Assert.True(job.Solution.Created);
        Assert.Equal(SolutionStatuses.Succeeded, job.Solution.Status);
        var add = Assert.IsType<AddSolutionComponentRequest>(Assert.Single(fake.Batches.Last()));
        Assert.Equal(AccountNameId, add.ComponentId);
        Assert.Equal("new_labelsfr", add.SolutionUniqueName);
    }

    [Fact]
    public async Task A_solution_failure_is_reported_separately_and_keeps_the_label_updates()
    {
        var fake = SolutionOrg();
        fake.FaultFor = (request, _) => request is AddSolutionComponentRequest
            ? FakeTranslatorClient.Fault(TranslatorFaults.PrivilegeDenied, "Principal user is missing prvAppendToSolution.")
            : null;

        var (job, _) = await Run(
            fake,
            new ApplySolutionDto { UniqueName = "ContosoCore" },
            Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.DisplayName }, (1036, "Compte")));

        Assert.Equal("completed", job.Status);
        Assert.Equal(1, job.Succeeded);
        Assert.Equal(PublishStatuses.Succeeded, job.Publish.Status);
        Assert.Equal(SolutionStatuses.Failed, job.Solution.Status);
        var failure = Assert.Single(job.Solution.Failures);
        Assert.Equal("account", failure.Component);
        Assert.Contains("permission to change this solution", failure.Message);
    }

    [Fact]
    public async Task Creating_the_solution_failing_adds_nothing_and_keeps_the_labels()
    {
        var fake = SolutionOrg();
        fake.CreateError = FakeTranslatorClient.Fault(-1, "Duplicate unique name.");

        var (job, _) = await Run(
            fake,
            new ApplySolutionDto { New = new NewSolutionDto { FriendlyName = "X", UniqueName = "new_x", PublisherId = PublisherId } },
            Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.DisplayName }, (1036, "Compte")));

        Assert.Equal(1, job.Succeeded);
        Assert.Equal(SolutionStatuses.Failed, job.Solution.Status);
        Assert.Contains("could not be created", job.Solution.Message);
        Assert.DoesNotContain(fake.Batches.SelectMany(batch => batch), request => request is AddSolutionComponentRequest);
    }

    [Fact]
    public async Task Nothing_is_created_or_added_when_no_label_was_written()
    {
        var fake = SolutionOrg();

        var (job, _) = await Run(
            fake,
            new ApplySolutionDto { New = new NewSolutionDto { FriendlyName = "X", UniqueName = "new_x", PublisherId = PublisherId } },
            Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "gone", Property = LabelProperties.DisplayName }, (1036, "Parti")));

        Assert.Equal(SolutionStatuses.NotNeeded, job.Solution.Status);
        Assert.Empty(fake.Created);
    }

    [Fact]
    public async Task Jobs_without_a_solution_report_not_requested()
    {
        var fake = SolutionOrg();
        var prepared = await new TranslatorService(fake).PrepareApplyAsync(
            new ApplyBody
            {
                Rows = [Row(new LabelKeyDto { Kind = LabelKinds.Table, Table = "account", Property = LabelProperties.DisplayName }, (1036, "Compte"))],
            },
            default);
        var job = new TranslatorJob(prepared.Value!, Connection);
        await new TranslatorApply(fake, new NoDelay()).RunAsync(job, CancellationToken.None);

        Assert.Equal(SolutionStatuses.NotRequested, job.ToDto().Solution.Status);
        Assert.Equal("done", job.ToDto().Phase);
        Assert.DoesNotContain(fake.Batches.SelectMany(batch => batch), request => request is AddSolutionComponentRequest);
    }
}
