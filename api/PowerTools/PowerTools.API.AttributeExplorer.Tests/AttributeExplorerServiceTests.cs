using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.AttributeExplorer;
using Xunit;

namespace PowerTools.API.AttributeExplorer.Tests;

public sealed class FakeAttributeExplorerClient : IAttributeExplorerClient
{
    public List<EntityMetadata> Tables { get; } = [];
    public Dictionary<string, EntityMetadata> ByName { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Requested { get; } = [];
    public Exception? ThrowOnAll { get; set; }
    public Exception? ThrowOnTable { get; set; }

    public Task<IReadOnlyList<EntityMetadata>> RetrieveAllTablesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (ThrowOnAll is not null)
            throw ThrowOnAll;

        return Task.FromResult<IReadOnlyList<EntityMetadata>>(Tables);
    }

    public Task<EntityMetadata> RetrieveTableAsync(string logicalName, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Requested.Add(logicalName);
        if (ThrowOnTable is not null)
            throw ThrowOnTable;

        return ByName.TryGetValue(logicalName, out var table)
            ? Task.FromResult(table)
            : throw Fault(AttributeExplorerFaults.ObjectDoesNotExist, $"Could not find entity '{logicalName}'.");
    }

    public static FaultException<OrganizationServiceFault> Fault(int code, string message, object? retryAfter = null)
    {
        var fault = new OrganizationServiceFault { ErrorCode = code, Message = message };
        if (retryAfter is not null)
            fault.ErrorDetails.Add("Retry-After", retryAfter);
        return new FaultException<OrganizationServiceFault>(fault, message);
    }
}

public sealed class AttributeExplorerServiceTests
{
    [Fact]
    public async Task Tables_exclude_private_tables_and_keep_intersect_tables()
    {
        var fake = new FakeAttributeExplorerClient();
        fake.Tables.Add(Builders.Table("account", "Account"));
        fake.Tables.Add(Builders.Table("hidden", "Hidden", isPrivate: true));
        fake.Tables.Add(Builders.Table("teammembership", "Team Membership", isIntersect: true));

        var result = await new AttributeExplorerService(fake).GetTablesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(["account", "teammembership"], result.Value!.Tables.Select(table => table.LogicalName));
        Assert.True(result.Value.Tables[1].IsIntersect);
    }

    [Fact]
    public async Task Tables_sort_by_display_name_then_logical_name_ignoring_case()
    {
        var fake = new FakeAttributeExplorerClient();
        fake.Tables.Add(Builders.Table("zeta", "alpha"));
        fake.Tables.Add(Builders.Table("beta", "Beta"));
        fake.Tables.Add(Builders.Table("nolabel", null));
        fake.Tables.Add(Builders.Table("account", "Account"));

        var result = await new AttributeExplorerService(fake).GetTablesAsync(CancellationToken.None);

        Assert.Equal(
            ["account", "zeta", "beta", "nolabel"],
            result.Value!.Tables.Select(table => table.LogicalName));
        Assert.Null(result.Value.Tables[3].DisplayName);
    }

    [Fact]
    public async Task Table_dto_carries_identity_and_flags()
    {
        var fake = new FakeAttributeExplorerClient();
        var table = Builders.Table("new_thing", "Thing");
        table.SchemaName = "new_Thing";
        table.EntitySetName = "new_things";
        Builders.SetInternal(table, nameof(EntityMetadata.ObjectTypeCode), 10001);
        Builders.SetInternal(table, nameof(EntityMetadata.PrimaryIdAttribute), "new_thingid");
        Builders.SetInternal(table, nameof(EntityMetadata.PrimaryNameAttribute), "new_name");
        table.OwnershipType = OwnershipTypes.UserOwned;
        Builders.SetInternal(table, nameof(EntityMetadata.IsCustomEntity), true);
        Builders.SetInternal(table, nameof(EntityMetadata.IsManaged), false);
        fake.Tables.Add(table);

        var dto = Assert.Single((await new AttributeExplorerService(fake).GetTablesAsync(CancellationToken.None)).Value!.Tables);

        Assert.Equal("new_Thing", dto.SchemaName);
        Assert.Equal("new_things", dto.EntitySetName);
        Assert.Equal(10001, dto.ObjectTypeCode);
        Assert.Equal("new_thingid", dto.PrimaryIdAttribute);
        Assert.Equal("new_name", dto.PrimaryNameAttribute);
        Assert.True(dto.IsCustom);
        Assert.False(dto.IsManaged);
        Assert.Equal("UserOwned", dto.OwnershipType);
    }

    [Fact]
    public void Requests_ask_for_the_smallest_filters_and_unpublished_changes()
    {
        var all = AttributeExplorerRequests.AllTables();
        Assert.Equal(EntityFilters.Entity, all.EntityFilters);
        Assert.True(all.RetrieveAsIfPublished);

        var one = AttributeExplorerRequests.Table("account");
        Assert.Equal("account", one.LogicalName);
        Assert.Equal(EntityFilters.Attributes | EntityFilters.Relationships, one.EntityFilters);
        Assert.True(one.RetrieveAsIfPublished);
    }

    [Fact]
    public async Task Attributes_exclude_attribute_of_companions()
    {
        var fake = new FakeAttributeExplorerClient();
        var table = Builders.Table("account", "Account");
        table.SetAttributes(
        [
            Builders.Attribute(new StringAttributeMetadata(), "name", "Account Name"),
            Builders.Attribute(new StringAttributeMetadata(), "primarycontactidname", "Primary Contact Name", attributeOf: "primarycontactid"),
            Builders.Attribute(new StringAttributeMetadata(), "owneridyominame", null, attributeOf: "ownerid"),
        ]);
        fake.ByName["account"] = table;

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("account", CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("account", result.Value!.Table.LogicalName);
        Assert.Equal(["name"], result.Value.Attributes.Select(attribute => attribute.LogicalName));
    }

    [Fact]
    public async Task Attributes_sort_by_display_name_falling_back_to_logical_name()
    {
        var fake = new FakeAttributeExplorerClient();
        var table = Builders.Table("account", "Account");
        table.SetAttributes(
        [
            Builders.Attribute(new StringAttributeMetadata(), "zzz", "Alpha"),
            Builders.Attribute(new StringAttributeMetadata(), "bbb", "Beta"),
            Builders.Attribute(new StringAttributeMetadata(), "aaa", null),
        ]);
        fake.ByName["account"] = table;

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("account", CancellationToken.None);

        Assert.Equal(["aaa", "zzz", "bbb"], result.Value!.Attributes.Select(attribute => attribute.LogicalName));
    }

    [Fact]
    public void Labels_prefer_the_user_language_then_the_first_stored_label_then_null()
    {
        var user = new Label(new LocalizedLabel("Konto", 1031), new[] { new LocalizedLabel("Account", 1033), new LocalizedLabel("Konto", 1031) });
        Assert.Equal("Konto", AttributeExplorerMapper.LabelText(user));

        var noUser = new Label { LocalizedLabels = { new LocalizedLabel("Compte", 1036) } };
        Assert.Equal("Compte", AttributeExplorerMapper.LabelText(noUser));

        var blankUser = new Label(new LocalizedLabel("", 1033), new[] { new LocalizedLabel("", 1033), new LocalizedLabel("Fallback", 1036) });
        Assert.Equal("Fallback", AttributeExplorerMapper.LabelText(blankUser));

        Assert.Null(AttributeExplorerMapper.LabelText(new Label()));
        Assert.Null(AttributeExplorerMapper.LabelText(null));
    }

    [Fact]
    public void Core_fields_and_behavior_flags_are_mapped_and_missing_flags_stay_null()
    {
        var id = Guid.Parse("11111111-2222-3333-4444-555555555555");
        var attribute = Builders.Attribute(new StringAttributeMetadata { MaxLength = 160, Format = StringFormat.Email }, "emailaddress1", "Email");
        attribute.Description = Builders.Text("Primary email");
        attribute.RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.ApplicationRequired);
        attribute.IsValidForCreate = true;
        attribute.IsValidForUpdate = false;
        attribute.IsAuditEnabled = new BooleanManagedProperty(true);
        attribute.IsValidForAdvancedFind = new BooleanManagedProperty(false);
        attribute.SourceType = 1;
        Builders.SetInternal(attribute, nameof(AttributeMetadata.MetadataId), id);
        Builders.SetInternal(attribute, nameof(AttributeMetadata.IsCustomAttribute), true);
        Builders.SetInternal(attribute, nameof(AttributeMetadata.IsManaged), true);

        var dto = AttributeExplorerMapper.Attribute(attribute, []);

        Assert.Equal("emailaddress1", dto.LogicalName);
        Assert.Equal("Email", dto.DisplayName);
        Assert.Equal("Primary email", dto.Description);
        Assert.Equal("ApplicationRequired", dto.RequiredLevel);
        Assert.True(dto.IsCustom);
        Assert.True(dto.IsManaged);
        Assert.Equal(1, dto.SourceType);
        Assert.Equal(id.ToString(), dto.MetadataId);
        Assert.True(dto.IsValidForCreate);
        Assert.False(dto.IsValidForUpdate);
        Assert.Null(dto.IsValidForRead);
        Assert.False(dto.IsValidForAdvancedFind);
        Assert.True(dto.IsAuditEnabled);
        Assert.Null(dto.IsSecured);
        Assert.Null(dto.IsFilterable);
        Assert.Null(dto.IsRetrievable);
    }

    [Fact]
    public void Missing_required_level_and_type_report_safe_defaults()
    {
        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(new AttributeMetadata(), "x", null), []);

        Assert.Equal("None", dto.RequiredLevel);
        Assert.Equal("Unknown", dto.AttributeType);
        Assert.Null(dto.DisplayName);
        Assert.Null(dto.Description);
    }

    [Fact]
    public void String_and_memo_report_max_length_and_format()
    {
        var text = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new StringAttributeMetadata { MaxLength = 100, Format = StringFormat.Url }, "website", "Website"), []);
        Assert.Equal(100, text.MaxLength);
        Assert.Equal("Url", text.Format);
        Assert.Null(text.MinValue);
        Assert.Null(text.Targets);
        Assert.Null(text.OptionSet);

        var memo = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new MemoAttributeMetadata { MaxLength = 2000 }, "notes", "Notes"), []);
        Assert.Equal(2000, memo.MaxLength);
    }

    [Fact]
    public void Number_types_report_range_precision_and_format()
    {
        var integer = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new IntegerAttributeMetadata { MinValue = -5, MaxValue = 2147483647, Format = IntegerFormat.Duration }, "n", "N"), []);
        Assert.Equal("-5", integer.MinValue);
        Assert.Equal("2147483647", integer.MaxValue);
        Assert.Equal("Duration", integer.Format);
        Assert.Null(integer.Precision);

        var number = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new DecimalAttributeMetadata { MinValue = 0.5m, MaxValue = 1000.25m, Precision = 2 }, "d", "D"), []);
        Assert.Equal("0.5", number.MinValue);
        Assert.Equal("1000.25", number.MaxValue);
        Assert.Equal(2, number.Precision);

        var money = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new MoneyAttributeMetadata { MinValue = 0, MaxValue = 1000000, Precision = 4 }, "m", "M"), []);
        Assert.Equal(4, money.Precision);
        Assert.Equal("1000000", money.MaxValue);

        var bigAttribute = new BigIntAttributeMetadata();
        Builders.SetInternal(bigAttribute, nameof(BigIntAttributeMetadata.MinValue), long.MinValue);
        Builders.SetInternal(bigAttribute, nameof(BigIntAttributeMetadata.MaxValue), long.MaxValue);
        var big = AttributeExplorerMapper.Attribute(Builders.Attribute(bigAttribute, "b", "B"), []);
        Assert.Equal("9223372036854775807", big.MaxValue);
    }

    [Fact]
    public void Date_time_reports_format_and_behavior()
    {
        var date = new DateTimeAttributeMetadata(DateTimeFormat.DateOnly)
        {
            DateTimeBehavior = DateTimeBehavior.TimeZoneIndependent,
        };

        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(date, "birthdate", "Birthday"), []);

        Assert.Equal("DateOnly", dto.Format);
        Assert.Equal("TimeZoneIndependent", dto.DateTimeBehavior);
    }

    [Fact]
    public async Task Lookup_lists_targets_and_only_its_own_relationships()
    {
        var fake = new FakeAttributeExplorerClient();
        var table = Builders.Table("account", "Account");
        var lookup = Builders.Attribute(
            new LookupAttributeMetadata { Targets = ["contact", "account"] },
            "primarycontactid",
            "Primary Contact");
        table.SetAttributes([lookup, Builders.Attribute(new StringAttributeMetadata(), "name", "Name")]);
        table.SetManyToOne(
        [
            Builders.Relationship("contact_customer_accounts", "primarycontactid", "contact"),
            Builders.Relationship("account_primary_contact_b", "primarycontactid", "account"),
            Builders.Relationship("account_owner", "ownerid", "systemuser"),
        ]);
        fake.ByName["account"] = table;

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("account", CancellationToken.None);

        var dto = result.Value!.Attributes.Single(attribute => attribute.LogicalName == "primarycontactid");
        Assert.Equal(["contact", "account"], dto.Targets);
        Assert.Equal(
            [("account_primary_contact_b", "account"), ("contact_customer_accounts", "contact")],
            dto.Relationships!.Select(relationship => (relationship.SchemaName, relationship.ReferencedEntity)));

        var text = result.Value.Attributes.Single(attribute => attribute.LogicalName == "name");
        Assert.Null(text.Targets);
        Assert.Null(text.Relationships);
    }

    [Fact]
    public void Lookup_without_relationships_returns_empty_lists()
    {
        var dto = AttributeExplorerMapper.Attribute(
            Builders.Attribute(new LookupAttributeMetadata(), "ownerid", "Owner"), []);

        Assert.Empty(dto.Targets!);
        Assert.Empty(dto.Relationships!);
    }

    [Fact]
    public void Choice_reports_option_set_options_and_default()
    {
        var set = new OptionSetMetadata(
        [
            Builders.Option(1, "Hot"),
            Builders.Option(2, "Warm"),
            Builders.Option(3, null),
        ])
        {
            Name = "account_rating",
            IsGlobal = false,
        };
        var choice = new PicklistAttributeMetadata { OptionSet = set, DefaultFormValue = 2 };

        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(choice, "rating", "Rating"), []);

        Assert.Equal("account_rating", dto.OptionSet!.Name);
        Assert.False(dto.OptionSet.IsGlobal);
        Assert.Equal(
            [(1, "Hot"), (2, "Warm"), (3, "3")],
            dto.OptionSet.Options.Select(option => (option.Value, option.Label)));
        Assert.Equal("Warm (2)", dto.DefaultValue);
        Assert.Null(dto.BooleanOptions);
    }

    [Fact]
    public void Choice_with_no_default_and_global_option_set()
    {
        var set = new OptionSetMetadata([Builders.Option(1, "A")]) { Name = "shared_set", IsGlobal = true };
        var choice = new MultiSelectPicklistAttributeMetadata { OptionSet = set, DefaultFormValue = -1 };

        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(choice, "tags", "Tags"), []);

        Assert.True(dto.OptionSet!.IsGlobal);
        Assert.Null(dto.DefaultValue);
    }

    [Fact]
    public void Status_attributes_report_their_option_sets()
    {
        var state = new StateAttributeMetadata
        {
            OptionSet = new OptionSetMetadata([Builders.Option(0, "Active"), Builders.Option(1, "Inactive")]) { Name = "account_statecode" },
        };

        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(state, "statecode", "Status"), []);

        Assert.Equal(2, dto.OptionSet!.Options.Count);
        Assert.Null(dto.DefaultValue);
    }

    [Fact]
    public void Boolean_reports_labels_and_default()
    {
        var boolean = new BooleanAttributeMetadata
        {
            OptionSet = new BooleanOptionSetMetadata(
                new OptionMetadata(Builders.Text("Yes"), 1),
                new OptionMetadata(Builders.Text("No"), 0)),
            DefaultValue = false,
        };

        var dto = AttributeExplorerMapper.Attribute(Builders.Attribute(boolean, "donotemail", "Do Not Allow Email"), []);

        Assert.Equal("Yes", dto.BooleanOptions!.TrueLabel);
        Assert.Equal("No", dto.BooleanOptions.FalseLabel);
        Assert.Equal("No", dto.DefaultValue);
        Assert.Null(dto.OptionSet);
    }

    [Fact]
    public async Task Unknown_table_maps_to_table_not_found()
    {
        var fake = new FakeAttributeExplorerClient();

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("gone", CancellationToken.None);

        Assert.Null(result.Value);
        Assert.Equal(404, result.Problem!.Status);
        Assert.Equal("table_not_found", result.Problem.Code);
        Assert.Equal("This table no longer exists. Refresh metadata.", result.Problem.Message);
    }

    [Theory]
    [InlineData(-2147220969, "Entity 'x' does not exist")]
    [InlineData(0, "Could not find entity with name 'x'.")]
    public async Task Not_found_is_recognized_by_error_code_or_message(int code, string message)
    {
        var fake = new FakeAttributeExplorerClient { ThrowOnTable = FakeAttributeExplorerClient.Fault(code, message) };

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("x", CancellationToken.None);

        Assert.Equal("table_not_found", result.Problem!.Code);
    }

    [Fact]
    public async Task Not_found_is_recognized_inside_a_wrapping_exception()
    {
        var fake = new FakeAttributeExplorerClient
        {
            ThrowOnTable = new InvalidOperationException(
                "wrapped",
                FakeAttributeExplorerClient.Fault(AttributeExplorerFaults.ObjectDoesNotExist, "missing")),
        };

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("x", CancellationToken.None);

        Assert.Equal("table_not_found", result.Problem!.Code);
    }

    [Fact]
    public async Task Blank_table_name_is_not_found_without_calling_dataverse()
    {
        var fake = new FakeAttributeExplorerClient();

        var result = await new AttributeExplorerService(fake).GetAttributesAsync("  ", CancellationToken.None);

        Assert.Equal("table_not_found", result.Problem!.Code);
        Assert.Empty(fake.Requested);
    }

    [Fact]
    public async Task Other_faults_map_to_dataverse_error()
    {
        var fake = new FakeAttributeExplorerClient
        {
            ThrowOnAll = FakeAttributeExplorerClient.Fault(unchecked((int)0x80040220), "Principal user is missing privilege."),
            ThrowOnTable = FakeAttributeExplorerClient.Fault(unchecked((int)0x80040220), "Principal user is missing privilege."),
        };
        var service = new AttributeExplorerService(fake);

        var all = await service.GetTablesAsync(CancellationToken.None);
        var one = await service.GetAttributesAsync("account", CancellationToken.None);

        Assert.Equal(400, all.Problem!.Status);
        Assert.Equal("dataverse_error", all.Problem.Code);
        Assert.Contains("missing privilege", all.Problem.Message);
        Assert.Equal("dataverse_error", one.Problem!.Code);
    }

    [Fact]
    public async Task Service_protection_faults_surface_the_message_and_retry_after()
    {
        var fake = new FakeAttributeExplorerClient
        {
            ThrowOnAll = FakeAttributeExplorerClient.Fault(
                AttributeExplorerFaults.NumberOfRequestsLimitExceeded,
                "Too many requests.",
                "00:00:30"),
        };

        var result = await new AttributeExplorerService(fake).GetTablesAsync(CancellationToken.None);

        Assert.Equal(429, result.Problem!.Status);
        Assert.Equal("service_protection", result.Problem.Code);
        Assert.Contains("Too many requests.", result.Problem.Message);
        Assert.Contains("Retry after 00:00:30", result.Problem.Message);
    }

    [Fact]
    public async Task Cancellation_is_not_turned_into_a_problem()
    {
        using var source = new CancellationTokenSource();
        source.Cancel();
        var service = new AttributeExplorerService(new FakeAttributeExplorerClient());

        await Assert.ThrowsAsync<OperationCanceledException>(() => service.GetTablesAsync(source.Token));
        await Assert.ThrowsAsync<OperationCanceledException>(() => service.GetAttributesAsync("account", source.Token));
    }
}

internal static class Builders
{
    public static Label Text(string text) => new(new LocalizedLabel(text, 1033), new[] { new LocalizedLabel(text, 1033) });

    public static EntityMetadata Table(
        string logicalName,
        string? display,
        bool isPrivate = false,
        bool isIntersect = false)
    {
        var table = new EntityMetadata { LogicalName = logicalName, SchemaName = logicalName };
        if (display is not null)
            table.DisplayName = Text(display);
        SetInternal(table, nameof(EntityMetadata.IsPrivate), isPrivate);
        SetInternal(table, nameof(EntityMetadata.IsIntersect), isIntersect);
        return table;
    }

    public static T Attribute<T>(T attribute, string logicalName, string? display, string? attributeOf = null)
        where T : AttributeMetadata
    {
        attribute.LogicalName = logicalName;
        attribute.SchemaName = logicalName;
        if (display is not null)
            attribute.DisplayName = Text(display);
        if (attributeOf is not null)
            SetInternal(attribute, nameof(AttributeMetadata.AttributeOf), attributeOf);
        return attribute;
    }

    public static OptionMetadata Option(int value, string? label) =>
        new() { Value = value, Label = label is null ? null : Text(label) };

    public static OneToManyRelationshipMetadata Relationship(string schema, string referencingAttribute, string referencedEntity)
    {
        var relationship = new OneToManyRelationshipMetadata { SchemaName = schema };
        SetInternal(relationship, nameof(OneToManyRelationshipMetadata.ReferencingAttribute), referencingAttribute);
        SetInternal(relationship, nameof(OneToManyRelationshipMetadata.ReferencedEntity), referencedEntity);
        return relationship;
    }

    public static void SetAttributes(this EntityMetadata table, AttributeMetadata[] attributes) =>
        SetInternal(table, nameof(EntityMetadata.Attributes), attributes);

    public static void SetManyToOne(this EntityMetadata table, OneToManyRelationshipMetadata[] relationships) =>
        SetInternal(table, nameof(EntityMetadata.ManyToOneRelationships), relationships);

    /// <summary>The SDK exposes many metadata properties with internal setters.</summary>
    public static void SetInternal(object target, string property, object? value)
    {
        for (var type = target.GetType(); type is not null; type = type.BaseType)
        {
            var info = type.GetProperty(
                property,
                System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.DeclaredOnly);
            if (info?.SetMethod is not null)
            {
                info.SetValue(target, value);
                return;
            }
        }

        throw new InvalidOperationException($"No settable property {property} on {target.GetType().Name}.");
    }
}
