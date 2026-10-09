using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Services;
using PowerTools.API.Tools.Translator;
using Xunit;

namespace PowerTools.API.Translator.Tests;

public sealed class TranslatorApplyTests
{
    private static readonly DataverseConnectionContext Connection =
        new OnlineConnectionContext("https://dev.example.test", "token");

    private static ApplyRowDto Row(LabelKeyDto key, params (int Lcid, string Text)[] labels) =>
        new() { Key = key, Labels = labels.ToDictionary(label => label.Lcid, label => label.Text) };

    private static LabelKeyDto Key(string kind, string property, string? table = "account", string? column = null,
        int? value = null, string? optionSet = null, Guid? recordId = null, string? relationship = null, int? side = null) =>
        new()
        {
            Kind = kind, Property = property, Table = table, Column = column, Value = value,
            OptionSet = optionSet, RecordId = recordId, Relationship = relationship, Side = side,
        };

    private static async Task<(TranslatorJobDto Job, FakeTranslatorClient Fake, NoDelay Delay)> Run(
        FakeTranslatorClient fake,
        params ApplyRowDto[] rows)
    {
        var delay = new NoDelay();
        var prepared = await new TranslatorService(fake).PrepareApplyAsync(new ApplyBody { Rows = rows.ToList() }, default);
        Assert.Null(prepared.Problem);
        var job = new TranslatorJob(prepared.Value!, Connection);
        await new TranslatorApply(fake, delay).RunAsync(job, CancellationToken.None);
        return (job.ToDto(), fake, delay);
    }

    private static FakeTranslatorClient AccountWithChoices()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        account.SetAttributes(
            Builders.Attribute(new StringAttributeMetadata(), "name", "Account Name"),
            Builders.Attribute(new PicklistAttributeMetadata { OptionSet = Builders.LocalOptions((1, "Hot")) }, "new_temp", "Temperature"),
            Builders.Attribute(new StateAttributeMetadata { OptionSet = Builders.LocalOptions((0, "Active")) }, "statecode", "Status"),
            Builders.Attribute(new StatusAttributeMetadata { OptionSet = Builders.LocalOptions((1, "Open")) }, "statuscode", "Status Reason"),
            Builders.Attribute(new MultiSelectPicklistAttributeMetadata { OptionSet = Builders.LocalOptions((5, "Red")) }, "new_tags", "Tags"),
            Builders.Attribute(
                new BooleanAttributeMetadata(new BooleanOptionSetMetadata(
                    new OptionMetadata(Builders.En("Allow"), 1),
                    new OptionMetadata(Builders.En("Do Not Allow"), 0))),
                "donotemail",
                "Do not allow Emails"));
        fake.Tables["account"] = account;
        return fake;
    }

    [Fact]
    public async Task Prepare_rejects_empty_values_and_unprovisioned_languages_before_Dataverse()
    {
        var fake = new FakeTranslatorClient();
        var service = new TranslatorService(fake);

        var prepared = await service.PrepareApplyAsync(new ApplyBody
        {
            Rows =
            [
                Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1033, ""), (1036, "Compte"), (1041, "Jp")),
                Row(Key(LabelKinds.Table, LabelProperties.Description), (1036, " ")),
            ],
            BatchSize = 500,
        }, default);

        var value = prepared.Value!;
        Assert.Equal(50, value.BatchSize);
        Assert.Equal([1036], value.Rows.Single().Labels.Keys);
        Assert.Equal(
            [TranslatorValidation.BaseRequiredMessage, "Language 1041 is not provisioned in this environment.", TranslatorValidation.ClearNotSupportedMessage],
            value.Rejected.Select(result => result.Message));
        Assert.Empty(fake.Batches);
    }

    [Fact]
    public async Task Prepare_clamps_batch_size_to_at_least_10_and_rejects_malformed_keys()
    {
        var service = new TranslatorService(new FakeTranslatorClient());

        var small = await service.PrepareApplyAsync(new ApplyBody
        {
            Rows = [Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte"))],
            BatchSize = 1,
        }, default);
        var malformed = await service.PrepareApplyAsync(new ApplyBody
        {
            Rows = [Row(Key(LabelKinds.Boolean, LabelProperties.Label, column: "x", value: 7), (1036, "Oui"))],
        }, default);

        Assert.Equal(10, small.Value!.BatchSize);
        Assert.Equal(400, malformed.Problem!.Status);
    }

    [Fact]
    public async Task Table_update_merges_changed_languages_into_fresh_metadata_with_MergeLabels()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");

        var (job, _, _) = await Run(fake,
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte")),
            Row(Key(LabelKinds.Table, LabelProperties.DisplayCollectionName), (1036, "Comptes")));

        var request = Assert.IsType<UpdateEntityRequest>(fake.Batches.Single().Single());
        Assert.True(request.MergeLabels);
        Assert.Equal(("account", EntityFilters.Entity), fake.TableReads.Single());
        Assert.Equal("Account", request.Entity.DisplayName.LocalizedLabels.Single(label => label.LanguageCode == 1033).Label);
        Assert.Equal("Compte", request.Entity.DisplayName.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);
        Assert.Equal("Comptes", request.Entity.DisplayCollectionName.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);
        Assert.Equal(2, job.Succeeded);
        Assert.Equal("completed", job.Status);
        Assert.Equal(PublishStatuses.Succeeded, job.Publish.Status);
        Assert.Equal("<importexportxml><entities><entity>account</entity></entities></importexportxml>", fake.Published.Single());
    }

    [Fact]
    public async Task One_fresh_attribute_read_serves_every_column_and_option_of_a_table()
    {
        var fake = AccountWithChoices();

        var (job, _, _) = await Run(fake,
            Row(Key(LabelKinds.Column, LabelProperties.DisplayName, column: "name"), (1036, "Nom")),
            Row(Key(LabelKinds.Choice, LabelProperties.Label, column: "new_temp", value: 1), (1036, "Chaud")),
            Row(Key(LabelKinds.Choice, LabelProperties.Description, column: "new_temp", value: 1), (1036, "Très chaud")),
            Row(Key(LabelKinds.Choice, LabelProperties.Label, column: "statecode", value: 0), (1036, "Actif")),
            Row(Key(LabelKinds.Choice, LabelProperties.Label, column: "statuscode", value: 1), (1036, "Ouvert")),
            Row(Key(LabelKinds.Choice, LabelProperties.Label, column: "new_tags", value: 5), (1036, "Rouge")),
            Row(Key(LabelKinds.Boolean, LabelProperties.Label, column: "donotemail", value: 0), (1036, "Ne pas autoriser")));

        Assert.Equal([("account", EntityFilters.Attributes)], fake.TableReads);
        var requests = fake.Batches.SelectMany(batch => batch).ToList();
        Assert.Equal(6, requests.Count);

        var column = Assert.IsType<UpdateAttributeRequest>(requests[0]);
        Assert.True(column.MergeLabels);
        Assert.Equal("account", column.EntityName);
        Assert.IsType<StringAttributeMetadata>(column.Attribute);
        Assert.Equal("Nom", column.Attribute.DisplayName.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);

        // The label and description of one option go out as a single request.
        var picklist = Assert.IsType<UpdateOptionValueRequest>(requests[1]);
        Assert.Equal(("account", "new_temp", 1), (picklist.EntityLogicalName, picklist.AttributeLogicalName, picklist.Value));
        Assert.Equal("Chaud", picklist.Label.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);
        Assert.Equal("Hot", picklist.Label.LocalizedLabels.Single(label => label.LanguageCode == 1033).Label);
        Assert.Equal("Très chaud", picklist.Description.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);
        Assert.True(picklist.MergeLabels);
        Assert.Null(picklist.OptionSetName);

        var state = Assert.IsType<UpdateStateValueRequest>(requests[2]);
        Assert.Equal(("statecode", 0), (state.AttributeLogicalName, state.Value));
        Assert.True(state.MergeLabels);

        Assert.Equal("statuscode", Assert.IsType<UpdateOptionValueRequest>(requests[3]).AttributeLogicalName);
        Assert.Equal("new_tags", Assert.IsType<UpdateOptionValueRequest>(requests[4]).AttributeLogicalName);
        var boolean = Assert.IsType<UpdateOptionValueRequest>(requests[5]);
        Assert.Equal(("donotemail", 0), (boolean.AttributeLogicalName, boolean.Value));
        Assert.Equal(7, job.Succeeded);
    }

    [Fact]
    public async Task Global_choices_update_the_set_and_options_by_name_and_publish_the_option_set()
    {
        var fake = new FakeTranslatorClient();
        var color = new OptionSetMetadata { Name = "new_color", DisplayName = Builders.En("Color"), IsGlobal = true };
        color.Options.Add(new OptionMetadata(Builders.En("Red"), 1));
        var flag = new BooleanOptionSetMetadata(new OptionMetadata(Builders.En("Yes"), 1), new OptionMetadata(Builders.En("No"), 0))
        {
            Name = "new_flag",
        };
        fake.OptionSets.AddRange([color, flag]);

        var (job, _, _) = await Run(fake,
            Row(Key(LabelKinds.GlobalChoice, LabelProperties.DisplayName, table: null, optionSet: "new_color"), (1036, "Couleur")),
            Row(Key(LabelKinds.GlobalChoice, LabelProperties.Label, table: null, optionSet: "new_color", value: 1), (1036, "Rouge")),
            Row(Key(LabelKinds.GlobalChoice, LabelProperties.Label, table: null, optionSet: "new_flag", value: 1), (1036, "Oui")));

        var requests = fake.Batches.Single();
        var set = Assert.IsType<UpdateOptionSetRequest>(requests[0]);
        Assert.True(set.MergeLabels);
        var option = Assert.IsType<UpdateOptionValueRequest>(requests[1]);
        Assert.Equal(("new_color", 1), (option.OptionSetName, option.Value));
        Assert.Null(option.EntityLogicalName);
        var yes = Assert.IsType<UpdateOptionValueRequest>(requests[2]);
        Assert.Equal(("new_flag", 1), (yes.OptionSetName, yes.Value));
        Assert.Equal("Oui", yes.Label.LocalizedLabels.Single(label => label.LanguageCode == 1036).Label);
        Assert.Equal(
            "<importexportxml><optionsets><optionset>new_color</optionset><optionset>new_flag</optionset></optionsets></importexportxml>",
            fake.Published.Single());
        Assert.Equal(3, job.Succeeded);
    }

    [Fact]
    public async Task Relationships_publish_both_tables()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        account.SetOneToMany(new OneToManyRelationshipMetadata
        {
            SchemaName = "account_contacts",
            ReferencedEntity = "account",
            ReferencingEntity = "contact",
            AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("People"),
            },
        });
        account.SetManyToMany(new ManyToManyRelationshipMetadata
        {
            SchemaName = "account_competitors",
            Entity1LogicalName = "account",
            Entity2LogicalName = "competitor",
            Entity2AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("Accounts"),
            },
        });
        fake.Tables["account"] = account;

        await Run(fake,
            Row(Key(LabelKinds.Relationship, LabelProperties.Label, relationship: "account_contacts"), (1036, "Personnes")),
            Row(Key(LabelKinds.Relationship, LabelProperties.Label, relationship: "account_competitors", side: 2), (1036, "Comptes")));

        Assert.Equal(("account", EntityFilters.Relationships), fake.TableReads.Single());
        var requests = fake.Batches.Single().Cast<UpdateRelationshipRequest>().ToList();
        Assert.All(requests, request => Assert.True(request.MergeLabels));
        var oneToMany = Assert.IsType<OneToManyRelationshipMetadata>(requests[0].Relationship);
        Assert.Equal("Personnes", oneToMany.AssociatedMenuConfiguration.Label.LocalizedLabels.Single(l => l.LanguageCode == 1036).Label);
        var manyToMany = Assert.IsType<ManyToManyRelationshipMetadata>(requests[1].Relationship);
        Assert.Equal("Comptes", manyToMany.Entity2AssociatedMenuConfiguration.Label.LocalizedLabels.Single(l => l.LanguageCode == 1036).Label);
        Assert.Equal(
            "<importexportxml><entities><entity>account</entity><entity>competitor</entity><entity>contact</entity></entities></importexportxml>",
            fake.Published.Single());
    }

    [Fact]
    public async Task Views_read_current_labels_including_unpublished_then_set_the_full_merged_list()
    {
        var fake = new FakeTranslatorClient();
        var id = Guid.NewGuid();
        fake.LocLabels[(id, "name")] = Builders.Text((1033, "Active Accounts"), (1031, "Aktive Konten"), (1036, "Old"));

        await Run(fake, Row(Key(LabelKinds.View, LabelProperties.RecordName, recordId: id), (1036, "Comptes actifs")));

        Assert.True(fake.LocLabelReads.Single().IncludeUnpublished);
        var request = Assert.IsType<SetLocLabelsRequest>(fake.Batches.Single().Single());
        Assert.Equal(("savedquery", id), (request.EntityMoniker.LogicalName, request.EntityMoniker.Id));
        Assert.Equal("name", request.AttributeName);
        Assert.Equal(
            [(1031, "Aktive Konten"), (1033, "Active Accounts"), (1036, "Comptes actifs")],
            request.Labels.Select(label => (label.LanguageCode, label.Label)));
        Assert.Contains("<entity>account</entity>", fake.Published.Single());
    }

    [Fact]
    public async Task Faults_map_by_request_index_and_only_successful_targets_are_published()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");
        fake.Tables["contact"] = Builders.Table("contact", "Contact");
        fake.FaultFor = (request, _) => request is UpdateEntityRequest { Entity.LogicalName: "account" }
            ? FakeTranslatorClient.Fault(TranslatorFaults.PrivilegeDenied, "Principal user is missing prvWriteEntity privilege.")
            : null;

        var (job, _, _) = await Run(fake,
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte")),
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName, table: "contact"), (1036, "Contact FR")),
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName, table: "gone"), (1036, "Parti")));

        Assert.Equal((1, 1, 1), (job.Succeeded, job.Failed, job.Skipped));
        var failed = job.Results.Single(result => result.Outcome == ApplyOutcomes.Failed);
        Assert.Equal("account", failed.Key.Table);
        Assert.StartsWith(TranslatorFaults.PrivilegeMessage, failed.Message);
        var skipped = job.Results.Single(result => result.Outcome == ApplyOutcomes.Skipped);
        Assert.Equal("This table no longer exists.", skipped.Message);
        Assert.Equal("<importexportxml><entities><entity>contact</entity></entities></importexportxml>", fake.Published.Single());
    }

    [Fact]
    public async Task Customization_lock_faults_are_retried_after_a_wait()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");
        fake.FaultFor = (_, attempt) => attempt == 0
            ? FakeTranslatorClient.Fault(-1, "Cannot start the requested operation [EntityCustomization] because there is another [PublishAll] running at this moment.")
            : null;

        var (job, _, delay) = await Run(fake, Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte")));

        Assert.Equal(2, fake.Batches.Count);
        Assert.Single(delay.Waits);
        Assert.Equal(1, job.Succeeded);
    }

    [Fact]
    public async Task A_timed_out_batch_is_resent_once_in_smaller_batches()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");
        fake.Tables["contact"] = Builders.Table("contact", "Contact");
        fake.BatchError = (call, _) => call == 0 ? new TimeoutException("The request channel timed out.") : null;

        var (job, _, _) = await Run(fake,
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte")),
            Row(Key(LabelKinds.Table, LabelProperties.DisplayName, table: "contact"), (1036, "Contact FR")));

        Assert.Equal([2, 1, 1], fake.Batches.Select(batch => batch.Count));
        Assert.Equal(2, job.Succeeded);
    }

    [Fact]
    public async Task Publish_failure_is_reported_separately_and_labels_stay_succeeded()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");
        fake.PublishErrors.Enqueue(FakeTranslatorClient.Fault(-1, "Publish broke."));

        var (job, _, _) = await Run(fake, Row(Key(LabelKinds.Table, LabelProperties.DisplayName), (1036, "Compte")));

        Assert.Equal(1, job.Succeeded);
        Assert.Equal("completed", job.Status);
        Assert.Equal(PublishStatuses.Failed, job.Publish.Status);
        Assert.Contains("Publish broke.", job.Publish.Message);
        Assert.Equal(["account"], job.Publish.Targets.Tables);
    }

    [Fact]
    public async Task Publish_again_sends_only_the_given_targets()
    {
        var fake = new FakeTranslatorClient();

        var result = await new TranslatorService(fake, new NoDelay()).PublishAsync(
            new PublishBody { Tables = ["contact", "account", "Account"], OptionSets = ["new_color"] },
            default);

        Assert.Equal(3, result.Value!.Count);
        Assert.Equal(
            "<importexportxml><entities><entity>account</entity><entity>contact</entity></entities><optionsets><optionset>new_color</optionset></optionsets></importexportxml>",
            fake.Published.Single());
    }

    [Fact]
    public void MergedLocLabels_keeps_languages_that_did_not_change()
    {
        var merged = TranslatorApply.MergedLocLabels(
            Builders.Text((1033, "Name"), (1036, "Nom")),
            [Row(Key(LabelKinds.Chart, LabelProperties.RecordName, recordId: Guid.NewGuid()), (1031, "Name DE"))]);

        Assert.Equal([1031, 1033, 1036], merged.Select(label => label.LanguageCode));
    }
}
