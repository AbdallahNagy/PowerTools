using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Translator;
using Xunit;

namespace PowerTools.API.Translator.Tests;

public sealed class TranslatorLanguageTests
{
    [Fact]
    public async Task Languages_union_the_base_language_and_put_it_first()
    {
        var fake = new FakeTranslatorClient { BaseLcid = 1036 };
        fake.Provisioned.Clear();
        fake.Provisioned.AddRange([1033, 1031]);
        fake.LanguageNames[1031] = "German";

        var result = await new TranslatorService(fake).GetLanguagesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(1036, result.Value!.BaseLcid);
        Assert.Equal([1036, 1033, 1031], result.Value.Languages.Select(language => language.Lcid));
        Assert.Equal(["French", "English", "German"], result.Value.Languages.Select(language => language.Name));
    }

    [Fact]
    public async Task Languages_fall_back_to_the_number_when_languagelocale_cannot_be_read()
    {
        var fake = new FakeTranslatorClient
        {
            LanguageNamesError = FakeTranslatorClient.Fault(TranslatorFaults.ObjectDoesNotExist, "No languagelocale."),
        };

        var result = await new TranslatorService(fake).GetLanguagesAsync(CancellationToken.None);

        Assert.Equal(["LCID 1033", "LCID 1036"], result.Value!.Languages.Select(language => language.Name));
    }
}

public sealed class TranslatorQueryTests
{
    private static async Task<IReadOnlyList<LabelRowDto>> Query(FakeTranslatorClient fake, string kind, params string[] tables)
    {
        var result = await new TranslatorService(fake).QueryLabelsAsync(
            new LabelQueryBody { Tables = tables, Kinds = [kind], Lcids = [1033, 1036] },
            CancellationToken.None);
        Assert.Null(result.Problem);
        return result.Value!.Rows;
    }

    [Fact]
    public async Task Query_rejects_unknown_kinds_and_table_kinds_without_tables()
    {
        var service = new TranslatorService(new FakeTranslatorClient());

        var unknown = await service.QueryLabelsAsync(new LabelQueryBody { Kinds = ["form"], Tables = ["account"] }, default);
        var noTables = await service.QueryLabelsAsync(new LabelQueryBody { Kinds = ["column"] }, default);

        Assert.Equal(400, unknown.Problem!.Status);
        Assert.Contains("form", unknown.Problem.Message);
        Assert.Equal(400, noTables.Problem!.Status);
    }

    [Fact]
    public async Task Metadata_is_read_in_chunks_of_100_with_a_language_filter_and_logical_name_in_condition()
    {
        var fake = new FakeTranslatorClient();
        var tables = Enumerable.Range(0, 150).Select(i => $"t{i}").ToArray();

        await Query(fake, LabelKinds.Table, tables);

        Assert.Equal(2, fake.MetadataRequests.Count);
        var first = fake.MetadataRequests[0].Query;
        var condition = first.Criteria.Conditions.Single();
        Assert.Equal("LogicalName", condition.PropertyName);
        Assert.Equal(MetadataConditionOperator.In, condition.ConditionOperator);
        Assert.Equal(100, ((string[])condition.Value).Length);
        Assert.Equal([1033, 1036], first.LabelQuery.FilterLanguages);
        Assert.DoesNotContain("Attributes", first.Properties.PropertyNames);
        Assert.Null(first.AttributeQuery);
    }

    [Fact]
    public async Task Table_rows_hold_every_language_and_are_read_only_when_not_customizable_or_renameable()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");
        fake.Tables["systemuser"] = Builders.Table("systemuser", "User", customizable: false);
        fake.Tables["team"] = Builders.Table("team", "Team", renameable: false);

        var rows = await Query(fake, LabelKinds.Table, "account", "systemuser", "team");

        var display = rows.First(row => row.Key.Table == "account" && row.Key.Property == LabelProperties.DisplayName);
        Assert.Equal("Account", display.Component);
        Assert.Equal("Account FR", display.Labels[1036]);
        Assert.Null(display.ReadOnlyReason);
        Assert.Equal(
            [LabelProperties.DisplayName, LabelProperties.DisplayCollectionName, LabelProperties.Description],
            rows.Where(row => row.Key.Table == "account").Select(row => row.Key.Property));
        Assert.Equal("This table is not customizable.", rows.First(row => row.Key.Table == "systemuser").ReadOnlyReason);
        Assert.Equal("This table cannot be renamed.", rows.First(row => row.Key.Table == "team").ReadOnlyReason);
    }

    [Fact]
    public async Task Names_or_descriptions_only_filters_rows()
    {
        var fake = new FakeTranslatorClient();
        fake.Tables["account"] = Builders.Table("account", "Account");

        var names = await new TranslatorService(fake).QueryLabelsAsync(
            new LabelQueryBody { Tables = ["account"], Kinds = ["table"], Lcids = [1033], Properties = "names" }, default);

        Assert.Equal(
            [LabelProperties.DisplayName, LabelProperties.DisplayCollectionName],
            names.Value!.Rows.Select(row => row.Key.Property));
    }

    [Fact]
    public async Task Column_exclusion_rules_leave_out_helpers_technical_types_and_rollup_helpers()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        var renameLocked = Builders.Attribute(new StringAttributeMetadata(), "new_locked", "Locked");
        renameLocked.IsRenameable = new BooleanManagedProperty(false);
        account.SetAttributes(
            Builders.Attribute(new StringAttributeMetadata(), "name", "Account Name"),
            Builders.Attribute(new StringAttributeMetadata(), "owneridname", "Owner", attributeOf: "ownerid"),
            Builders.Attribute(new UniqueIdentifierAttributeMetadata(), "accountid", "Account"),
            Builders.Attribute(new BigIntAttributeMetadata(), "versionnumber", "Version"),
            Builders.Attribute(new EntityNameAttributeMetadata(), "owneridtype", "Owner Type"),
            Builders.Attribute(new ImageAttributeMetadata(), "entityimage", "Image"),
            Builders.Attribute(new MultiSelectPicklistAttributeMetadata(), "new_tags", "Tags"),
            Builders.Attribute(new StringAttributeMetadata(), "new_empty", null),
            Builders.Attribute(new MoneyAttributeMetadata(), "new_total", "Total"),
            Builders.Attribute(new IntegerAttributeMetadata(), "new_total_state", "Total (State)"),
            Builders.Attribute(new DateTimeAttributeMetadata(), "new_total_date", "Total (Last Updated On)"),
            Builders.Attribute(new IntegerAttributeMetadata(), "new_other_state", "Other State"),
            renameLocked);
        fake.Tables["account"] = account;

        var rows = await Query(fake, LabelKinds.Column, "account");

        var columns = rows.Select(row => row.Key.Column).Distinct().ToList();
        Assert.Equal(["name", "new_tags", "new_total", "new_other_state", "new_locked"], columns);
        Assert.Equal("This column cannot be renamed.", rows.First(row => row.Key.Column == "new_locked").ReadOnlyReason);
        Assert.Contains("Attributes", fake.MetadataRequests[0].Query.Properties.PropertyNames);
        Assert.NotNull(fake.MetadataRequests[0].Query.AttributeQuery);
    }

    [Fact]
    public async Task Choices_cover_picklist_state_status_and_multi_select_but_not_global_choices()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        var global = Builders.Attribute(new PicklistAttributeMetadata(), "new_global", "Global");
        global.OptionSet = new OptionSetMetadata { IsGlobal = true, Name = "new_color" };
        account.SetAttributes(
            Builders.Attribute(new PicklistAttributeMetadata { OptionSet = Builders.LocalOptions((1, "Hot"), (2, "Cold")) }, "new_temp", "Temperature"),
            Builders.Attribute(new StateAttributeMetadata { OptionSet = Builders.LocalOptions((0, "Active")) }, "statecode", "Status"),
            Builders.Attribute(new StatusAttributeMetadata { OptionSet = Builders.LocalOptions((1, "Open")) }, "statuscode", "Status Reason"),
            Builders.Attribute(new MultiSelectPicklistAttributeMetadata { OptionSet = Builders.LocalOptions((5, "Red")) }, "new_tags", "Tags"),
            global);
        fake.Tables["account"] = account;

        var rows = await Query(fake, LabelKinds.Choice, "account");

        Assert.Equal(
            ["new_temp", "statecode", "statuscode", "new_tags"],
            rows.Select(row => row.Key.Column).Distinct());
        var hot = rows.Where(row => row.Key.Column == "new_temp" && row.Key.Value == 1).ToList();
        Assert.Equal([LabelProperties.Label, LabelProperties.Description], hot.Select(row => row.Key.Property));
        Assert.Equal("Hot", hot[0].Labels[1033]);
        Assert.Equal("Temperature", hot[0].Component);
    }

    [Fact]
    public async Task Yes_no_rows_are_true_then_false_labels_of_local_option_sets()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        account.SetAttributes(Builders.Attribute(
            new BooleanAttributeMetadata(new BooleanOptionSetMetadata(
                new OptionMetadata(Builders.En("Allow"), 1),
                new OptionMetadata(Builders.En("Do Not Allow"), 0))),
            "donotemail",
            "Do not allow Emails"));
        fake.Tables["account"] = account;

        var rows = await Query(fake, LabelKinds.Boolean, "account");

        Assert.Equal([1, 0], rows.Select(row => row.Key.Value));
        Assert.Equal(["Allow", "Do Not Allow"], rows.Select(row => row.Labels[1033]));
    }

    [Fact]
    public async Task Relationships_show_only_custom_menu_labels_on_the_table_that_shows_the_menu()
    {
        var fake = new FakeTranslatorClient();
        var account = Builders.Table("account", "Account");
        var labeled = new OneToManyRelationshipMetadata
        {
            SchemaName = "account_contacts",
            AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("People"),
            },
            ReferencedEntity = "account",
            ReferencingEntity = "contact",
        };
        var collectionName = new OneToManyRelationshipMetadata
        {
            SchemaName = "account_tasks",
            AssociatedMenuConfiguration = new AssociatedMenuConfiguration { Behavior = AssociatedMenuBehavior.UseCollectionName },
            ReferencedEntity = "account",
            ReferencingEntity = "task",
        };
        var manyToMany = new ManyToManyRelationshipMetadata
        {
            SchemaName = "account_competitors",
            Entity1LogicalName = "account",
            Entity2LogicalName = "competitor",
            Entity1AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("Rivals"),
            },
            Entity2AssociatedMenuConfiguration = new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseLabel,
                Label = Builders.En("Accounts"),
            },
        };
        account.SetOneToMany(labeled, collectionName);
        account.SetManyToMany(manyToMany);
        fake.Tables["account"] = account;

        var rows = await Query(fake, LabelKinds.Relationship, "account");

        Assert.Equal(["account_contacts", "account_competitors"], rows.Select(row => row.Key.Relationship));
        Assert.Equal(["1:N", "N:N"], rows.Select(row => row.Detail));
        Assert.Equal([null, 1], rows.Select(row => row.Key.Side));
        Assert.Equal(["People", "Rivals"], rows.Select(row => row.Labels[1033]));
    }

    [Fact]
    public async Task Global_choices_include_set_names_options_and_yes_no_sets()
    {
        var fake = new FakeTranslatorClient();
        var color = new OptionSetMetadata { Name = "new_color", DisplayName = Builders.En("Color"), Description = new Label(), IsGlobal = true };
        color.Options.Add(new OptionMetadata(Builders.En("Red"), 1) { Description = new Label() });
        color.IsCustomizable = new BooleanManagedProperty(false);
        var yesNo = new BooleanOptionSetMetadata(new OptionMetadata(Builders.En("Yes"), 1), new OptionMetadata(Builders.En("No"), 0))
        {
            Name = "new_flag",
            DisplayName = Builders.En("Flag"),
            Description = new Label(),
        };
        fake.OptionSets.Add(color);
        fake.OptionSets.Add(yesNo);

        var rows = await Query(fake, LabelKinds.GlobalChoice);

        var colorRows = rows.Where(row => row.Key.OptionSet == "new_color").ToList();
        Assert.Equal([null, null, 1, 1], colorRows.Select(row => row.Key.Value));
        Assert.All(colorRows, row => Assert.Equal("This choice is not customizable.", row.ReadOnlyReason));
        var flagRows = rows.Where(row => row.Key.OptionSet == "new_flag").ToList();
        Assert.All(flagRows, row => Assert.True(row.BooleanSet));
        Assert.Equal(["Flag", "", "Yes", "No"], flagRows.Select(row => row.Labels.GetValueOrDefault(1033, "")));
    }

    [Fact]
    public async Task Views_use_RetrieveLocLabels_exclude_private_views_and_name_the_view_type()
    {
        var fake = new FakeTranslatorClient();
        var id = Guid.NewGuid();
        var view = new Entity("savedquery", id)
        {
            ["returnedtypecode"] = "account",
            ["querytype"] = 0,
            ["iscustomizable"] = new BooleanManagedProperty(false),
        };
        fake.Views.Add(view);
        fake.LocLabels[(id, "name")] = Builders.Text((1033, "Active Accounts"), (1036, "Comptes actifs"));
        fake.LocLabels[(id, "description")] = new Label();

        var rows = await Query(fake, LabelKinds.View, "account");

        var query = fake.Queries.Single();
        Assert.Contains(query.Criteria.Conditions, c => c.AttributeName == "isprivate" && Equals(c.Values[0], false));
        Assert.Contains(query.Criteria.Conditions, c => c.AttributeName == "returnedtypecode" && c.Operator == ConditionOperator.In);
        Assert.DoesNotContain("name", query.ColumnSet.Columns);
        Assert.False(fake.LocLabelReads.Single().IncludeUnpublished);
        Assert.Equal(2, rows.Count);
        Assert.Equal("Active Accounts", rows[0].Component);
        Assert.Equal("Comptes actifs", rows[0].Labels[1036]);
        Assert.Equal("Public view", rows[0].Detail);
        Assert.Equal("This view is not customizable.", rows[0].ReadOnlyReason);
        Assert.Equal("account", rows[0].Key.Table);
    }
}
