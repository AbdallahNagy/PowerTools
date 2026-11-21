using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Tables;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;
using static PowerTools.API.Tests.Tools.Agent.Components.SchemaWorld;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class TablePlannerTests
{
    private readonly SchemaWorld world = new();

    private static TableApplySpec Spec(
        TableDefinition? table = null,
        List<ColumnDefinition>? columns = null,
        List<KeyDefinition>? keys = null,
        List<ManyToManyDefinition>? manyToMany = null) => new()
    {
        Solution = "Core",
        Table = table ?? new TableDefinition { SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects" },
        Columns = columns,
        Keys = keys,
        ManyToMany = manyToMany,
    };

    private static ColumnDefinition Col(string name, ColumnType type, string? display = null) =>
        new() { SchemaName = name, Type = type, DisplayName = display ?? name };

    /// <summary>One column of every type, each with settings that differ from the defaults.</summary>
    private static List<ColumnDefinition> EveryType() =>
    [
        new() { SchemaName = "new_Code", Type = ColumnType.Text, DisplayName = "Code", MaxLength = 20, Format = TextFormat.Url, RequiredLevel = RequiredLevel.Required },
        new() { SchemaName = "new_Notes", Type = ColumnType.Memo, DisplayName = "Notes", MaxLength = 5000, Description = "Free text" },
        new() { SchemaName = "new_Count", Type = ColumnType.Integer, DisplayName = "Count", MinValue = 0, MaxValue = 500 },
        new() { SchemaName = "new_Rate", Type = ColumnType.Decimal, DisplayName = "Rate", Precision = 4, MinValue = -1, MaxValue = 1 },
        new() { SchemaName = "new_Score", Type = ColumnType.Float, DisplayName = "Score", Precision = 3 },
        new() { SchemaName = "new_Budget", Type = ColumnType.Money, DisplayName = "Budget", Precision = 2, MinValue = 0, MaxValue = 1_000_000 },
        new() { SchemaName = "new_Active", Type = ColumnType.Boolean, DisplayName = "Active", TrueLabel = "On", FalseLabel = "Off" },
        new() { SchemaName = "new_Start", Type = ColumnType.DateTime, DisplayName = "Start", Behavior = DateBehavior.TimeZoneIndependent },
        new() { SchemaName = "new_Due", Type = ColumnType.DateOnly, DisplayName = "Due", Behavior = DateBehavior.DateOnly },
        new() { SchemaName = "new_Stage", Type = ColumnType.Choice, DisplayName = "Stage", Options = [new() { Label = "Planned" }, new() { Label = "Active" }, new() { Label = "Closed", Value = 7 }] },
        new() { SchemaName = "new_Tags", Type = ColumnType.MultiChoice, DisplayName = "Tags", Options = [new() { Label = "Red" }, new() { Label = "Blue" }] },
        new() { SchemaName = "new_AccountId", Type = ColumnType.Lookup, DisplayName = "Customer", Target = "account" },
        new() { SchemaName = "new_Contract", Type = ColumnType.File, DisplayName = "Contract", MaxSizeInKb = 1024 },
        new() { SchemaName = "new_Photo", Type = ColumnType.Image, DisplayName = "Photo" },
    ];

    // ── A new table ──────────────────────────────────────────────────────────

    [Fact]
    public async Task A_new_table_plans_the_table_then_each_column_in_spec_order()
    {
        world.AddTable("account", primary: "name");

        var plan = await world.PlanAsync(Spec(columns: EveryType()));

        Assert.Equal(
            ["createTable", "createColumn", "createColumn", "createColumn", "createColumn", "createColumn", "createColumn", "createColumn",
             "createColumn", "createColumn", "createColumn", "createColumn", "createLookup", "createColumn", "createColumn"],
            plan.Steps.Select(s => s.Op));
        Assert.Equal("new_project", plan.Steps[0].Target);
        Assert.Equal(EveryType().Select(c => c.SchemaName.ToLowerInvariant()), plan.Steps.Skip(1).Select(s => s.Target));
        Assert.All(plan.Steps, s => Assert.Equal(PlanEffect.Change, s.Effect));
        Assert.Equal(PlanEffect.Change, plan.Effect);
        Assert.Equal(["entity:new_project"], plan.LockKeys);
    }

    [Fact]
    public async Task Every_column_type_is_applied_and_a_second_plan_is_empty()
    {
        world.AddTable("account", primary: "name");
        var spec = Spec(columns: EveryType());

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(result.Remaining.Steps);
        Assert.Equal(["new_project", "account"], result.Published);
        Assert.True((await world.PlanAsync(spec)).IsEmpty);

        var code = (StringAttributeMetadata)world.Column("new_project", "new_code");
        Assert.Equal((20, "Url", AttributeRequiredLevel.ApplicationRequired), (code.MaxLength!.Value, code.FormatName.Value, code.RequiredLevel.Value));
        var money = (MoneyAttributeMetadata)world.Column("new_project", "new_budget");
        Assert.Equal((2, 0), (money.Precision!.Value, money.PrecisionSource!.Value));
        var due = (DateTimeAttributeMetadata)world.Column("new_project", "new_due");
        Assert.Equal((DateTimeFormat.DateOnly, "DateOnly"), (due.Format!.Value, due.DateTimeBehavior.Value));
        var stage = (PicklistAttributeMetadata)world.Column("new_project", "new_stage");
        Assert.Equal([100000000, 100000001, 7], stage.OptionSet.Options.Select(o => o.Value!.Value));
        var lookup = (LookupAttributeMetadata)world.Column("new_project", "new_accountid");
        Assert.Equal(["account"], lookup.Targets);
    }

    [Fact]
    public async Task A_new_table_carries_its_settings_and_the_solution()
    {
        var spec = Spec(new TableDefinition
        {
            SchemaName = "new_Project",
            DisplayName = "Project",
            PluralName = "Projects",
            Ownership = TableOwnership.Organization,
            PrimaryName = new PrimaryNameDefinition { SchemaName = "new_Title", DisplayName = "Title", MaxLength = 200 },
            AuditEnabled = true,
            ChangeTracking = true,
            Notes = true,
        });

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var create = Assert.Single(world.Writes.OfType<CreateEntityRequest>());
        Assert.Equal("Core", create["SolutionUniqueName"]);
        Assert.Equal(OwnershipTypes.OrganizationOwned, create.Entity.OwnershipType);
        Assert.True(create.HasNotes);
        Assert.False(create.HasActivities);
        Assert.Equal("new_title", world.Tables["new_project"].PrimaryNameAttribute);
        Assert.True((await world.PlanAsync(spec)).IsEmpty);
    }

    [Fact]
    public async Task A_new_table_needs_labels_and_the_publisher_prefix()
    {
        var unnamed = await Assert.ThrowsAsync<AgentProblemException>(() =>
            world.PlanAsync(Spec(new TableDefinition { SchemaName = "new_Project" })));
        Assert.Contains("displayName and table.pluralName", unnamed.Message);

        var wrongPrefix = await Assert.ThrowsAsync<AgentProblemException>(() =>
            world.PlanAsync(Spec(new TableDefinition { SchemaName = "fab_Project", DisplayName = "P", PluralName = "Ps" })));
        Assert.Contains("must start with the publisher prefix 'new_'", wrongPrefix.Message);
    }

    [Fact]
    public async Task A_new_column_needs_a_display_name_and_the_prefix()
    {
        world.AddTable("new_Project");

        var unnamed = await Assert.ThrowsAsync<AgentProblemException>(() =>
            world.PlanAsync(Spec(columns: [new ColumnDefinition { SchemaName = "new_Budget", Type = ColumnType.Money }])));
        Assert.Contains("needs displayName", unnamed.Message);

        var prefix = await Assert.ThrowsAsync<AgentProblemException>(() =>
            world.PlanAsync(Spec(columns: [Col("budget", ColumnType.Money)])));
        Assert.Contains("publisher prefix", prefix.Message);
    }

    [Fact]
    public async Task Step_details_name_every_value_so_the_hash_covers_them()
    {
        var plan = await world.PlanAsync(Spec(columns: [EveryType()[0], EveryType()[5], EveryType()[9]]));

        Assert.Equal("'Project' / 'Projects', ownership user, primary name new_name 'Name' max length 100, notes off, activities off", plan.Steps[0].Detail);
        Assert.Equal("text, 'Code', required required, max length 20, format url", plan.Steps[1].Detail);
        Assert.Equal("money, 'Budget', required none, precision 2, from 0 to 1000000", plan.Steps[2].Detail);
        Assert.Equal("choice, 'Stage', required none, options 100000000 'Planned', 100000001 'Active', 7 'Closed'", plan.Steps[3].Detail);

        var again = await world.PlanAsync(Spec(columns: [EveryType()[0], EveryType()[5], EveryType()[9]]));
        Assert.Equal(plan.Hash, again.Hash);
        var longer = Spec(columns: [new ColumnDefinition { SchemaName = "new_Code", Type = ColumnType.Text, DisplayName = "Code", MaxLength = 21, Format = TextFormat.Url, RequiredLevel = RequiredLevel.Required }]);
        Assert.NotEqual((await world.PlanAsync(longer)).Hash, (await world.PlanAsync(Spec(columns: [EveryType()[0]]))).Hash);
    }

    // ── Existing tables and columns ──────────────────────────────────────────

    [Fact]
    public async Task Columns_the_spec_leaves_out_are_never_removed()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new MoneyAttributeMetadata { SchemaName = "new_Budget" });

        var result = await world.ApplyAsync(Spec(columns: [Col("new_Owner", ColumnType.Text)]));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Contains(world.Tables["new_project"].Attributes, a => a.LogicalName == "new_budget");
        Assert.DoesNotContain(world.Writes, r => r.RequestName.StartsWith("Delete", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Only_what_the_spec_gives_is_compared()
    {
        world.AddTable("new_Project", display: "Project", plural: "Projects");
        world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 50, DisplayName = new Label("Code", English) });

        var plan = await world.PlanAsync(Spec(
            new TableDefinition { SchemaName = "new_Project" },
            [new ColumnDefinition { SchemaName = "new_Code", Type = ColumnType.Text }]));

        Assert.True(plan.IsEmpty);
    }

    [Fact]
    public async Task Labels_are_compared_in_the_base_language_only()
    {
        world.AddTable("new_Project", display: "Project", plural: "Projects");
        var code = world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 100 });
        code.DisplayName = new Label(new LocalizedLabel("Code", English), new LocalizedLabel[] {new LocalizedLabel("Code", English), new LocalizedLabel("Kennung", German) });
        world.Tables["new_project"].DisplayName = new Label(new LocalizedLabel("Project", English), new LocalizedLabel[] {new LocalizedLabel("Project", English) });

        // German is missing on the table and different on the column: neither is a change.
        var same = await world.PlanAsync(Spec(columns: [Col("new_Code", ColumnType.Text, "Code")]));
        Assert.True(same.IsEmpty);

        var renamed = await world.PlanAsync(Spec(
            new TableDefinition { SchemaName = "new_Project", DisplayName = "Initiative" },
            [Col("new_Code", ColumnType.Text, "Reference")]));
        Assert.Equal(["updateTable", "updateColumn"], renamed.Steps.Select(s => s.Op));
        Assert.Equal("display name 'Project' → 'Initiative'", renamed.Steps[0].Detail);
        Assert.Equal("display name 'Code' → 'Reference'", renamed.Steps[1].Detail);
    }

    [Fact]
    public async Task Labels_are_read_in_the_organizations_base_language()
    {
        world.Client.LanguageCode = German;
        world.AddTable("new_Project");
        var code = world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 100 });
        code.DisplayName = new Label(new LocalizedLabel("Code", English), new LocalizedLabel[] {new LocalizedLabel("Code", English), new LocalizedLabel("Kennung", German) });

        var table = new TableDefinition { SchemaName = "new_Project" };
        Assert.True((await world.PlanAsync(Spec(table, [Col("new_Code", ColumnType.Text, "Kennung")]))).IsEmpty);
        var plan = await world.PlanAsync(Spec(table, [Col("new_Code", ColumnType.Text, "Code")]));
        Assert.Equal("display name 'Kennung' → 'Code'", Assert.Single(plan.Steps).Detail);
    }

    [Fact]
    public async Task Column_updates_reread_the_column_and_send_only_the_named_changes_with_the_solution()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Code", MaxLength = 50, DisplayName = new Label("Code", English) });
        var spec = Spec(columns: [new ColumnDefinition
        {
            SchemaName = "new_Code", Type = ColumnType.Text, MaxLength = 80, RequiredLevel = RequiredLevel.Recommended, AuditEnabled = true, Format = TextFormat.Email,
        }]);

        var plan = await world.PlanAsync(spec);
        Assert.Equal("required none → recommended; audit off → on; max length 50 → 80; format text → email", Assert.Single(plan.Steps).Detail);

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var update = Assert.Single(world.Writes.OfType<UpdateAttributeRequest>());
        Assert.Equal("Core", update.SolutionUniqueName);
        Assert.True(update.MergeLabels);
        var text = (StringAttributeMetadata)update.Attribute;
        Assert.Equal((80, AttributeRequiredLevel.Recommended, true, "Email"), (text.MaxLength!.Value, text.RequiredLevel.Value, text.IsAuditEnabled.Value, text.FormatName.Value));
        // One path on both deployment types: the SDK message, never the Web API.
        Assert.Empty(world.Client.WebCalls);
    }

    [Fact]
    public async Task Number_date_and_boolean_columns_take_their_own_changes()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new IntegerAttributeMetadata { SchemaName = "new_Count", MinValue = 0, MaxValue = 10 });
        world.AddColumn("new_project", new DecimalAttributeMetadata { SchemaName = "new_Rate", Precision = 2, MinValue = 0, MaxValue = 1 });
        world.AddColumn("new_project", new MoneyAttributeMetadata { SchemaName = "new_Budget", Precision = 2, PrecisionSource = 2, MinValue = 0, MaxValue = 100 });
        world.AddColumn("new_project", new DateTimeAttributeMetadata(DateTimeFormat.DateAndTime) { SchemaName = "new_Start", DateTimeBehavior = DateTimeBehavior.UserLocal });
        world.AddColumn("new_project", new BooleanAttributeMetadata
        {
            SchemaName = "new_Active",
            OptionSet = new BooleanOptionSetMetadata(new OptionMetadata(new Label("Yes", English), 1), new OptionMetadata(new Label("No", English), 0)),
        });
        var spec = Spec(columns:
        [
            new() { SchemaName = "new_Count", Type = ColumnType.Integer, MaxValue = 100 },
            new() { SchemaName = "new_Rate", Type = ColumnType.Decimal, Precision = 5 },
            new() { SchemaName = "new_Budget", Type = ColumnType.Money, Precision = 2 },
            new() { SchemaName = "new_Start", Type = ColumnType.DateOnly, Behavior = DateBehavior.DateOnly },
            new() { SchemaName = "new_Active", Type = ColumnType.Boolean, TrueLabel = "On" },
        ]);

        var plan = await world.PlanAsync(spec);

        Assert.Equal(
            [
                ("updateColumn", "new_count", "max 10 → 100"),
                ("updateColumn", "new_rate", "precision 2 → 5"),
                ("updateColumn", "new_budget", "precision of the currency → 2"),
                ("updateColumn", "new_start", "type datetime → dateonly; behavior userLocal → dateOnly"),
                ("updateOption", "new_active=1", "label 'Yes' → 'On'"),
            ],
            plan.Steps.Select(s => (s.Op, s.Target, s.Detail)));
        Assert.Equal(ApplyOutcome.Applied, (await world.ApplyAsync(spec)).Outcome);
        Assert.True((await world.PlanAsync(spec)).IsEmpty);
    }

    // ── Choices ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Options_are_matched_by_value_or_label_and_new_ones_take_the_next_free_prefix_value()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new PicklistAttributeMetadata
        {
            SchemaName = "new_Stage",
            OptionSet = Options((100000000, "Planned"), (100000001, "Active"), (5, "Legacy")),
        });
        var spec = Spec(columns: [new ColumnDefinition
        {
            SchemaName = "new_Stage",
            Type = ColumnType.Choice,
            Options = [new() { Label = "Active" }, new() { Label = "Ready", Value = 100000000 }, new() { Label = "Closed" }, new() { Label = "Held", Value = 9 }],
        }]);

        var plan = await world.PlanAsync(spec);

        Assert.Equal(
            [
                ("updateOption", "new_stage=100000000", "label 'Planned' → 'Ready'"),
                ("addOption", "new_stage=100000002", "'Closed'"),
                ("addOption", "new_stage=9", "'Held'"),
            ],
            plan.Steps.Select(s => (s.Op, s.Target, s.Detail)));

        Assert.Equal(ApplyOutcome.Applied, (await world.ApplyAsync(spec)).Outcome);
        var options = ((PicklistAttributeMetadata)world.Column("new_project", "new_stage")).OptionSet.Options;
        Assert.Contains(options, o => o.Value == 5);
        Assert.True((await world.PlanAsync(spec)).IsEmpty);
        Assert.All(world.Writes.OfType<InsertOptionValueRequest>(), r => Assert.Equal("Core", r["SolutionUniqueName"]));
    }

    [Fact]
    public async Task A_column_on_a_global_choice_uses_it_and_its_options_are_not_changed_through_the_column()
    {
        world.AddTable("new_Project");
        var global = Options((1, "Low"), (2, "High"));
        global.IsGlobal = true;
        global.Name = "new_priority";
        global.MetadataId = Guid.NewGuid();
        world.GlobalChoices["new_priority"] = global;

        var spec = Spec(columns: [new ColumnDefinition { SchemaName = "new_Priority", Type = ColumnType.Choice, DisplayName = "Priority", GlobalChoice = "new_priority" }]);
        Assert.Equal(ApplyOutcome.Applied, (await world.ApplyAsync(spec)).Outcome);
        var created = (PicklistAttributeMetadata)world.Column("new_project", "new_priority");
        Assert.Equal((true, "new_priority"), (created.OptionSet.IsGlobal!.Value, created.OptionSet.Name));
        created.OptionSet = global;
        Assert.True((await world.PlanAsync(spec)).IsEmpty);

        var options = await world.PlanAsync(Spec(columns: [new ColumnDefinition { SchemaName = "new_Priority", Type = ColumnType.Choice, Options = [new() { Label = "Urgent" }] }]));
        var blocked = Assert.Single(options.Steps);
        Assert.Equal(PlanStepKind.Blocked, blocked.Kind);
        Assert.Contains("global choice new_priority", blocked.Reason);
    }

    [Fact]
    public async Task A_missing_global_choice_is_blocked()
    {
        world.AddTable("new_Project");

        var plan = await world.PlanAsync(Spec(columns: [new ColumnDefinition { SchemaName = "new_Priority", Type = ColumnType.Choice, DisplayName = "P", GlobalChoice = "new_nothing" }]));

        var step = Assert.Single(plan.Steps);
        Assert.Equal((PlanStepKind.Blocked, "Global choice new_nothing does not exist. Create it first."), (step.Kind, step.Reason));
    }

    // ── What cannot change ───────────────────────────────────────────────────

    [Fact]
    public async Task Immutable_properties_plan_as_blocked_steps_with_the_reason()
    {
        world.AddTable("account", primary: "name");
        world.AddTable("contact", primary: "fullname");
        world.AddTable("new_Project", user: true);
        world.AddColumn("new_project", new MoneyAttributeMetadata { SchemaName = "new_Budget" });
        world.AddColumn("new_project", new LookupAttributeMetadata { SchemaName = "new_CustomerId", Targets = ["account"] });
        world.AddColumn("new_project", new FileAttributeMetadata { SchemaName = "new_Contract", MaxSizeInKB = 1024 });
        world.AddColumn("new_project", new DateTimeAttributeMetadata(DateTimeFormat.DateOnly) { SchemaName = "new_Due", DateTimeBehavior = DateTimeBehavior.DateOnly });
        world.AddColumn("new_project", new PicklistAttributeMetadata { SchemaName = "new_Stage", OptionSet = Options((1, "A")) });
        world.AddKey("new_project", "new_Code", EntityKeyIndexStatus.Active, "new_name");
        Set(world.Tables["new_project"], "HasNotes", true);

        var plan = await world.PlanAsync(Spec(
            new TableDefinition
            {
                SchemaName = "new_Project",
                Ownership = TableOwnership.Organization,
                Notes = false,
                PrimaryName = new PrimaryNameDefinition { SchemaName = "new_Title" },
            },
            [
                Col("new_Budget", ColumnType.Text),
                new() { SchemaName = "new_CustomerId", Type = ColumnType.Lookup, Target = "contact" },
                new() { SchemaName = "new_Contract", Type = ColumnType.File, MaxSizeInKb = 2048 },
                new() { SchemaName = "new_Due", Type = ColumnType.DateTime },
                new() { SchemaName = "new_Stage", Type = ColumnType.Choice, GlobalChoice = "new_priority" },
            ],
            keys: [new KeyDefinition { SchemaName = "new_Code", Columns = ["new_budget"] }]));

        Assert.All(plan.Steps, step => Assert.Equal(PlanStepKind.Blocked, step.Kind));
        Assert.Equal(PlanEffect.Read, plan.Effect);
        var reasons = plan.Steps.Select(s => s.Reason!).ToList();
        Assert.Contains(reasons, r => r.Contains("ownership of new_project is user and is fixed"));
        Assert.Contains(reasons, r => r.Contains("Notes on new_project cannot be turned off"));
        Assert.Contains(reasons, r => r.Contains("primary name column of new_project is new_name"));
        Assert.Contains(reasons, r => r.Contains("new_budget is a money column; a column's type cannot change"));
        Assert.Contains(reasons, r => r.Contains("new_customerid points to account; a lookup's target is fixed"));
        Assert.Contains(reasons, r => r.Contains("maximum size of file column new_contract is fixed"));
        Assert.Contains(reasons, r => r.Contains("new_due has behavior dateOnly"));
        Assert.Contains(reasons, r => r.Contains("new_stage has its own options; which choice a column uses is fixed"));
        Assert.Contains(reasons, r => r.Contains("Key new_code is on new_name; a key's columns are fixed"));
    }

    [Fact]
    public async Task Date_behavior_changes_only_from_user_local()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new DateTimeAttributeMetadata(DateTimeFormat.DateAndTime) { SchemaName = "new_Start", DateTimeBehavior = DateTimeBehavior.TimeZoneIndependent });

        var plan = await world.PlanAsync(Spec(columns: [new() { SchemaName = "new_Start", Type = ColumnType.DateTime, Behavior = DateBehavior.UserLocal }]));

        Assert.Contains("allows a change only from userLocal", Assert.Single(plan.Steps).Reason);
    }

    [Fact]
    public async Task A_blocked_step_stops_the_apply_where_it_stands_and_says_why()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new MoneyAttributeMetadata { SchemaName = "new_Budget" });

        var result = await world.ApplyAsync(Spec(columns: [Col("new_Owner", ColumnType.Text), Col("new_Budget", ColumnType.Text), Col("new_Later", ColumnType.Text)]));

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal(AgentFaults.InvalidRequestCode, result.Code);
        Assert.Equal([StepStatus.Done, StepStatus.Unsupported, StepStatus.NotRun], result.Steps.Select(s => s.Status));
        Assert.Equal(["new_budget", "new_later"], result.Remaining.Steps.Select(s => s.Target));
    }

    // ── Managed components ───────────────────────────────────────────────────

    [Fact]
    public async Task A_managed_table_that_is_not_customizable_blocks_every_change()
    {
        var table = world.AddTable("new_Project", display: "Project");
        Set(table, "IsManaged", true);
        table.IsCustomizable = new BooleanManagedProperty(false);

        var plan = await world.PlanAsync(Spec(
            new TableDefinition { SchemaName = "new_Project", DisplayName = "Initiative" },
            [Col("new_Budget", ColumnType.Money)]));

        Assert.Equal(2, plan.Steps.Count);
        Assert.All(plan.Steps, s => Assert.Equal((PlanStepKind.Blocked, "Table new_project is managed and not customizable."), (s.Kind, s.Reason)));
        Assert.True((await world.PlanAsync(Spec(new TableDefinition { SchemaName = "new_Project", DisplayName = "Project" }))).IsEmpty);
    }

    [Fact]
    public async Task Managed_properties_of_a_column_block_the_changes_they_forbid()
    {
        world.AddTable("new_Project");
        var locked = world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Locked", MaxLength = 10, DisplayName = new Label("Locked", English) });
        locked.IsCustomizable = new BooleanManagedProperty(false);
        var fixedLevel = world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Level", MaxLength = 10 });
        fixedLevel.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) { CanBeChanged = false };
        var named = world.AddColumn("new_project", new StringAttributeMetadata { SchemaName = "new_Named", MaxLength = 10, DisplayName = new Label("Named", English) });
        named.IsRenameable = new BooleanManagedProperty(false);

        var plan = await world.PlanAsync(Spec(columns:
        [
            new() { SchemaName = "new_Locked", Type = ColumnType.Text, MaxLength = 20 },
            new() { SchemaName = "new_Level", Type = ColumnType.Text, RequiredLevel = RequiredLevel.Required, MaxLength = 20 },
            new() { SchemaName = "new_Named", Type = ColumnType.Text, DisplayName = "Other" },
        ]));

        Assert.Equal(
            [
                ("updateColumn", "new_locked", PlanStepKind.Blocked, "Column new_locked is managed and not customizable."),
                ("updateColumn", "new_level", PlanStepKind.Run, null),
                ("updateColumn", "new_level", PlanStepKind.Blocked, "The required level of new_level cannot be changed (managed property)."),
                ("updateColumn", "new_named", PlanStepKind.Blocked, "new_named cannot be renamed (managed property)."),
            ],
            plan.Steps.Select(s => (s.Op, s.Target, s.Kind, s.Reason)));
        Assert.Equal("max length 10 → 20", plan.Steps[1].Detail);
    }

    // ── Capabilities ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Without_file_storage_file_and_image_columns_are_unsupported_and_the_rest_still_plans()
    {
        world.FileStorage = false;

        var plan = await world.PlanAsync(Spec(columns: [Col("new_Contract", ColumnType.File), Col("new_Code", ColumnType.Text), Col("new_Photo", ColumnType.Image)]));

        Assert.Equal(
            [("createTable", PlanStepKind.Run), ("createColumn", PlanStepKind.Unsupported), ("createColumn", PlanStepKind.Run), ("createColumn", PlanStepKind.Unsupported)],
            plan.Steps.Select(s => (s.Op, s.Kind)));
        Assert.Contains("file storage", plan.Steps[1].Reason);
        Assert.Contains("note attachments", plan.Steps[1].Route);
    }

    // ── Relationships and keys ───────────────────────────────────────────────

    [Fact]
    public async Task Lookups_need_their_target_and_may_point_to_the_new_table_itself()
    {
        var plan = await world.PlanAsync(Spec(columns:
        [
            new() { SchemaName = "new_ParentId", Type = ColumnType.Lookup, DisplayName = "Parent", Target = "new_project" },
            new() { SchemaName = "new_VendorId", Type = ColumnType.Lookup, DisplayName = "Vendor", Target = "new_vendor" },
        ]));

        Assert.Equal(PlanStepKind.Run, plan.Steps[1].Kind);
        Assert.Equal("lookup to new_project, 'Parent', relationship new_new_project_new_project_parentid, required none", plan.Steps[1].Detail);
        Assert.Equal((PlanStepKind.Blocked, "Table new_vendor does not exist. Create it first, then apply this spec again."), (plan.Steps[2].Kind, plan.Steps[2].Reason));
    }

    [Fact]
    public async Task Many_to_many_relationships_and_keys_come_after_the_columns_and_apply_idempotently()
    {
        world.AddTable("contact", primary: "fullname");
        var spec = Spec(
            columns: [Col("new_Code", ColumnType.Text)],
            keys: [new KeyDefinition { SchemaName = "new_ProjectCode", Columns = ["new_code"] }],
            manyToMany: [new ManyToManyDefinition { SchemaName = "new_project_contact", Table = "contact" }]);

        var plan = await world.PlanAsync(spec);
        Assert.Equal(["createTable", "createColumn", "createManyToMany", "createKey"], plan.Steps.Select(s => s.Op));
        Assert.Equal("new_project ↔ contact, intersect table new_project_contact", plan.Steps[2].Detail);
        Assert.Equal("'new_ProjectCode' on new_code; waits for the index", plan.Steps[3].Detail);

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal("Core", Assert.Single(world.Writes.OfType<CreateEntityKeyRequest>()).SolutionUniqueName);
        Assert.Contains(world.Client.Executed, r => r is RetrieveEntityKeyRequest);
        Assert.True((await world.PlanAsync(spec)).IsEmpty);
    }

    [Fact]
    public async Task A_key_on_a_column_nobody_has_is_a_bad_spec()
    {
        world.AddTable("new_Project");

        var error = await Assert.ThrowsAsync<AgentProblemException>(() =>
            world.PlanAsync(Spec(keys: [new KeyDefinition { SchemaName = "new_Code", Columns = ["new_missing"] }])));

        Assert.Contains("uses new_missing, which new_project does not have", error.Message);
    }

    [Fact]
    public async Task A_failed_key_index_fails_the_step_and_the_next_plan_reactivates_it()
    {
        world.AddTable("new_Project");
        world.KeyBuildsTo = EntityKeyIndexStatus.Failed;
        var spec = Spec(keys: [new KeyDefinition { SchemaName = "new_Code", Columns = ["new_name"] }]);

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.Failed, result.Outcome);
        Assert.Contains("index of key new_code failed", result.Message);
        var again = await world.PlanAsync(spec);
        Assert.Equal("reactivateKey", Assert.Single(again.Steps).Op);

        world.KeyBuildsTo = EntityKeyIndexStatus.Active;
        Assert.Equal(ApplyOutcome.Applied, (await world.ApplyAsync(spec)).Outcome);
        Assert.Single(world.Writes.OfType<ReactivateEntityKeyRequest>());
    }

    [Fact]
    public async Task A_key_still_being_built_is_a_warning_not_a_step()
    {
        world.AddTable("new_Project");
        world.AddKey("new_project", "new_Code", EntityKeyIndexStatus.InProgress, "new_name");

        var plan = await world.PlanAsync(Spec(keys: [new KeyDefinition { SchemaName = "new_Code", Columns = ["new_name"] }]));

        Assert.True(plan.IsEmpty);
        Assert.Contains("still being built", Assert.Single(plan.Warnings));
    }

    // ── Spec rules ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData("""{"schemaName":"new_A","type":"integer","maxLength":5}""", "maxLength is only for text and memo columns")]
    [InlineData("""{"schemaName":"new_A","type":"text","maxLength":5000}""", "maxLength must be from 1 to 4000")]
    [InlineData("""{"schemaName":"new_A","type":"choice","options":[{"label":"x"}],"globalChoice":"y"}""", "give options or globalChoice, not both")]
    [InlineData("""{"schemaName":"new_A","type":"choice","options":[{"label":"x","value":1},{"label":"y","value":1}]}""", "value 1 is used twice")]
    [InlineData("""{"schemaName":"new_A","type":"lookup"}""", "target is required")]
    [InlineData("""{"schemaName":"new_A","type":"integer","minValue":1.5}""", "must be a whole number")]
    [InlineData("""{"schemaName":"new_A","type":"money","minValue":5,"maxValue":1}""", "minValue is above maxValue")]
    [InlineData("""{"schemaName":"new_A","type":"datetime","behavior":"dateOnly"}""", "behavior dateOnly needs type dateonly")]
    [InlineData("""{"schemaName":"new_A","type":"decimal","precision":11}""", "precision must be from 0 to 10")]
    [InlineData("""{"schemaName":"new A","type":"text"}""", "must be a schema name")]
    public void Bad_column_specs_say_what_to_change(string column, string message)
    {
        var spec = new ApplyFamily<TableApplySpec>("table", Planner()).ReadSpec(
            System.Text.Json.JsonDocument.Parse($$"""{"solution":"Core","table":{"schemaName":"new_P"},"columns":[{{column}}]}""").RootElement);

        var error = Assert.Throws<AgentProblemException>(() => TableSpecRules.Validate((TableApplySpec)spec));

        Assert.Contains(message, error.Message);
    }

    [Fact]
    public void An_unknown_column_type_is_refused_when_the_spec_is_read()
    {
        var error = Assert.Throws<AgentProblemException>(() => new ApplyFamily<TableApplySpec>("table", Planner()).ReadSpec(
            System.Text.Json.JsonDocument.Parse("""{"solution":"Core","table":{"schemaName":"new_P"},"columns":[{"schemaName":"new_A","type":"bigint"}]}""").RootElement));

        Assert.Equal(AgentFaults.InvalidRequestCode, error.Problem.Code);
    }

    [Fact]
    public async Task A_solution_that_does_not_exist_or_is_managed_is_refused()
    {
        var missing = await Assert.ThrowsAsync<AgentProblemException>(() => world.PlanAsync(Spec().WithSolution("Nope")));
        Assert.Equal(AgentFaults.NotFoundCode, missing.Problem.Code);

        var managed = await Assert.ThrowsAsync<AgentProblemException>(() => world.PlanAsync(Spec().WithSolution("Managed1")));
        Assert.Contains("is managed", managed.Message);
    }

    [Fact]
    public async Task A_step_that_fails_halfway_is_partly_applied_and_the_same_spec_finishes_the_work()
    {
        var broken = true;
        world.Fail = r => broken && r is CreateAttributeRequest { Attribute.SchemaName: "new_Second" }
            ? FakeAgentClient.Fault(-2147220891, "second is invalid")
            : null;
        var spec = Spec(columns: [Col("new_First", ColumnType.Text), Col("new_Second", ColumnType.Text), Col("new_Third", ColumnType.Text)]);

        var result = await world.ApplyAsync(spec);

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal(["new_second", "new_third"], result.Remaining.Steps.Select(s => s.Target));
        Assert.Equal(["new_project"], result.Published);

        broken = false;
        var retry = await world.ApplyAsync(spec);
        Assert.Equal(ApplyOutcome.Applied, retry.Outcome);
        Assert.Equal(["new_second", "new_third"], retry.Steps.Select(s => s.Target));
    }
}

internal static class TableSpecTestExtensions
{
    public static TableApplySpec WithSolution(this TableApplySpec spec, string solution) => new()
    {
        Solution = solution,
        Table = spec.Table,
        Columns = spec.Columns,
        Keys = spec.Keys,
        ManyToMany = spec.ManyToMany,
    };
}
