using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

internal static class Responses
{
    public static T Of<T>(params (string Key, object Value)[] results) where T : OrganizationResponse, new()
    {
        var response = new T { Results = new ParameterCollection() };
        foreach (var (key, value) in results) response.Results[key] = value;
        return response;
    }

    public static void SetInternal(object target, string property, object? value)
    {
        for (var type = target.GetType(); type is not null; type = type.BaseType)
        {
            var info = type.GetProperty(
                property,
                System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.DeclaredOnly);
            if (info?.SetMethod is not null)
            {
                info.SetValue(target, value);
                return;
            }
        }

        throw new InvalidOperationException($"No setter for {property}.");
    }
}

public class AgentSchemaServiceTests
{
    private static readonly Guid CreatedId = Guid.Parse("99999999-9999-9999-9999-999999999999");

    private static (AgentSchemaService Service, FakeAgentClient Client) Make(Func<OrganizationRequest, OrganizationResponse>? onExecute = null)
    {
        var client = Data.Client();
        client.OnExecute = onExecute ?? (request => request switch
        {
            CreateEntityRequest => Responses.Of<CreateEntityResponse>(("EntityId", CreatedId)),
            CreateAttributeRequest => Responses.Of<CreateAttributeResponse>(("AttributeId", CreatedId)),
            CreateOneToManyRequest => Responses.Of<CreateOneToManyResponse>(("AttributeId", CreatedId)),
            CreateManyToManyRequest => Responses.Of<CreateManyToManyResponse>(("ManyToManyRelationshipId", CreatedId)),
            CreateOptionSetRequest => Responses.Of<CreateOptionSetResponse>(("OptionSetId", CreatedId)),
            RetrieveEntityRequest r => RetrievedEntity(r.LogicalName),
            RetrieveOptionSetRequest r => Responses.Of<RetrieveOptionSetResponse>(
                ("OptionSetMetadata", new OptionSetMetadata { Name = r.Name, MetadataId = CreatedId })),
            _ => new OrganizationResponse(),
        });
        return (new AgentSchemaService(client), client);
    }

    private static RetrieveEntityResponse RetrievedEntity(string logicalName)
    {
        var entity = new EntityMetadata { LogicalName = logicalName };
        Responses.SetInternal(entity, nameof(EntityMetadata.PrimaryIdAttribute), logicalName + "id");
        return Responses.Of<RetrieveEntityResponse>(("EntityMetadata", entity));
    }

    private static T Only<T>(FakeAgentClient client) where T : OrganizationRequest => Assert.Single(client.Executed.OfType<T>());

    private static string Label(Label? label) => label!.LocalizedLabels.Single().Label;

    // ── Tables ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_table_builds_the_request_with_defaults_and_the_solution()
    {
        var (service, client) = Make();

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects", Ownership = "user", Solution = "Core",
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_project", result.Value!.LogicalName);
        Assert.Equal(CreatedId, result.Value.MetadataId);
        var request = Only<CreateEntityRequest>(client);
        Assert.Equal("new_Project", request.Entity.SchemaName);
        Assert.Equal(OwnershipTypes.UserOwned, request.Entity.OwnershipType);
        Assert.Equal("Projects", Label(request.Entity.DisplayCollectionName));
        Assert.Equal(1033, request.Entity.DisplayName.LocalizedLabels.Single().LanguageCode);
        Assert.Equal("Core", request.SolutionUniqueName);
        var primary = Assert.IsType<StringAttributeMetadata>(request.PrimaryAttribute);
        Assert.Equal("new_name", primary.SchemaName);
        Assert.Equal(100, primary.MaxLength);
        Assert.Equal("Name", Label(primary.DisplayName));
    }

    [Fact]
    public async Task Create_table_with_only_a_publisher_sets_no_solution_and_uses_the_organization_language()
    {
        var (service, client) = Make();
        client.LanguageCode = 1031;

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "fab_Order", DisplayName = "Order", PluralName = "Orders", Ownership = "organization", Publisher = "fab",
            PrimaryNameSchemaName = "fab_title", PrimaryNameMaxLength = 200,
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<CreateEntityRequest>(client);
        Assert.Null(request.SolutionUniqueName);
        Assert.Equal(OwnershipTypes.OrganizationOwned, request.Entity.OwnershipType);
        Assert.Equal(1031, request.Entity.DisplayName.LocalizedLabels.Single().LanguageCode);
        Assert.Equal(200, ((StringAttributeMetadata)request.PrimaryAttribute).MaxLength);
    }

    [Fact]
    public async Task A_create_with_no_solution_or_publisher_needs_a_publisher_and_writes_nothing()
    {
        var (service, client) = Make();

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects", Ownership = "user",
        }, CancellationToken.None);

        Assert.Equal("PublisherRequired", result.Problem!.Code);
        Assert.Contains("contoso (new)", result.Problem.Message);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task A_schema_name_with_the_wrong_prefix_is_rejected_before_any_write()
    {
        var (service, client) = Make();

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "fab_Project", DisplayName = "Project", PluralName = "Projects", Ownership = "user", Solution = "Core",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("new_", result.Problem.Message);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task A_primary_name_with_the_wrong_prefix_is_rejected_before_any_write()
    {
        var (service, client) = Make();

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects", Ownership = "user",
            Solution = "Core", PrimaryNameSchemaName = "other_name",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_table_rejects_an_unknown_ownership()
    {
        var (service, client) = Make();

        var result = await service.CreateTableAsync(new CreateTableBody
        {
            SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects", Ownership = "team", Solution = "Core",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    // ── Columns ──────────────────────────────────────────────────────────────

    private static CreateColumnBody Column(string type, Action<CreateColumnBody>? configure = null)
    {
        var body = new CreateColumnBody { Table = "account", SchemaName = "new_rating", DisplayName = "Rating", Type = type, Solution = "Core" };
        configure?.Invoke(body);
        return body;
    }

    [Theory]
    [InlineData("text", typeof(StringAttributeMetadata))]
    [InlineData("memo", typeof(MemoAttributeMetadata))]
    [InlineData("integer", typeof(IntegerAttributeMetadata))]
    [InlineData("decimal", typeof(DecimalAttributeMetadata))]
    [InlineData("money", typeof(MoneyAttributeMetadata))]
    [InlineData("boolean", typeof(BooleanAttributeMetadata))]
    [InlineData("datetime", typeof(DateTimeAttributeMetadata))]
    [InlineData("dateonly", typeof(DateTimeAttributeMetadata))]
    [InlineData("file", typeof(FileAttributeMetadata))]
    [InlineData("image", typeof(ImageAttributeMetadata))]
    public async Task Create_column_builds_the_attribute_for_each_type(string type, Type expected)
    {
        var (service, client) = Make();

        var result = await service.CreateColumnAsync(Column(type), CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal("new_rating", result.Value!.LogicalName);
        var request = Only<CreateAttributeRequest>(client);
        Assert.IsType(expected, request.Attribute);
        Assert.Equal("account", request.EntityName);
        Assert.Equal("Core", request.SolutionUniqueName);
        Assert.Equal("new_rating", request.Attribute.SchemaName);
        Assert.Equal("Rating", Label(request.Attribute.DisplayName));
        Assert.Equal(AttributeRequiredLevel.None, request.Attribute.RequiredLevel.Value);
    }

    [Fact]
    public async Task Create_column_reads_text_length_format_and_required_level()
    {
        var (service, client) = Make();

        await service.CreateColumnAsync(Column("text", b => { b.MaxLength = 250; b.Format = "email"; b.RequiredLevel = "required"; b.Description = "Mail"; }), CancellationToken.None);

        var attribute = Assert.IsType<StringAttributeMetadata>(Only<CreateAttributeRequest>(client).Attribute);
        Assert.Equal(250, attribute.MaxLength);
        Assert.Equal(StringFormatName.Email.Value, attribute.FormatName.Value);
        Assert.Equal(AttributeRequiredLevel.ApplicationRequired, attribute.RequiredLevel.Value);
        Assert.Equal("Mail", Label(attribute.Description));
    }

    [Fact]
    public async Task Create_column_uses_the_boolean_labels()
    {
        var (service, client) = Make();

        await service.CreateColumnAsync(Column("boolean", b => { b.TrueLabel = "Open"; b.FalseLabel = "Closed"; }), CancellationToken.None);

        var set = Assert.IsType<BooleanAttributeMetadata>(Only<CreateAttributeRequest>(client).Attribute).OptionSet;
        Assert.Equal("Open", Label(set.TrueOption.Label));
        Assert.Equal("Closed", Label(set.FalseOption.Label));
    }

    [Fact]
    public async Task Option_values_count_up_from_the_publishers_prefix_times_ten_thousand()
    {
        var (service, client) = Make();

        var result = await service.CreateColumnAsync(Column("choice", b => b.Options =
            [new ChoiceOptionBody { Label = "Hot" }, new ChoiceOptionBody { Label = "Warm" }, new ChoiceOptionBody { Label = "Cold", Value = 5 }]),
            CancellationToken.None);

        Assert.Null(result.Problem);
        var attribute = Assert.IsType<PicklistAttributeMetadata>(Only<CreateAttributeRequest>(client).Attribute);
        Assert.Equal([100000000, 100000001, 5], attribute.OptionSet.Options.Select(o => o.Value!.Value));
        Assert.False(attribute.OptionSet.IsGlobal);
        Assert.Equal(["Hot", "Warm", "Cold"], attribute.OptionSet.Options.Select(o => Label(o.Label)));
    }

    [Fact]
    public async Task A_multichoice_column_with_a_global_choice_references_it_by_id()
    {
        var (service, client) = Make();

        var result = await service.CreateColumnAsync(Column("multichoice", b => b.GlobalChoice = "new_colors"), CancellationToken.None);

        Assert.Null(result.Problem);
        var attribute = Assert.IsType<MultiSelectPicklistAttributeMetadata>(Only<CreateAttributeRequest>(client).Attribute);
        Assert.True(attribute.OptionSet.IsGlobal);
        Assert.Equal("new_colors", attribute.OptionSet.Name);
        Assert.Equal(CreatedId, attribute.OptionSet.MetadataId);
    }

    [Fact]
    public async Task A_choice_column_needs_exactly_one_of_global_choice_or_options()
    {
        var (service, client) = Make();

        var neither = await service.CreateColumnAsync(Column("choice"), CancellationToken.None);
        var both = await service.CreateColumnAsync(Column("choice", b =>
        {
            b.GlobalChoice = "new_colors";
            b.Options = [new ChoiceOptionBody { Label = "A" }];
        }), CancellationToken.None);
        var stray = await service.CreateColumnAsync(Column("text", b => b.Options = [new ChoiceOptionBody { Label = "A" }]), CancellationToken.None);

        Assert.All([neither, both, stray], r => Assert.Equal("InvalidRequest", r.Problem!.Code));
        Assert.Empty(client.Executed);
    }

    [Theory]
    [InlineData("nonsense")]
    [InlineData(null)]
    public async Task Create_column_rejects_an_unknown_type(string? type)
    {
        var (service, client) = Make();

        var result = await service.CreateColumnAsync(Column(type!), CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_column_rejects_a_wrong_prefix_before_any_write()
    {
        var (service, client) = Make();

        var result = await service.CreateColumnAsync(Column("text", b => b.SchemaName = "fab_rating"), CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_column_rejects_out_of_range_values()
    {
        var (service, client) = Make();

        var length = await service.CreateColumnAsync(Column("text", b => b.MaxLength = 5000), CancellationToken.None);
        var precision = await service.CreateColumnAsync(Column("money", b => b.Precision = 9), CancellationToken.None);

        Assert.All([length.Problem, precision.Problem], p => Assert.Equal("InvalidRequest", p!.Code));
        Assert.Empty(client.Executed);
    }

    // ── Relationships ────────────────────────────────────────────────────────

    [Fact]
    public async Task A_single_target_lookup_uses_create_one_to_many_with_a_default_relationship_name()
    {
        var (service, client) = Make();

        var result = await service.CreateLookupAsync(new CreateLookupBody
        {
            Table = "contact", SchemaName = "new_Parent", DisplayName = "Parent", Targets = ["account"], Solution = "Core", RequiredLevel = "recommended",
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<CreateOneToManyRequest>(client);
        Assert.Equal("new_account_contact_parent", request.OneToManyRelationship.SchemaName);
        Assert.Equal("account", request.OneToManyRelationship.ReferencedEntity);
        Assert.Equal("accountid", request.OneToManyRelationship.ReferencedAttribute);
        Assert.Equal("contact", request.OneToManyRelationship.ReferencingEntity);
        Assert.Equal("Core", request.SolutionUniqueName);
        Assert.Equal("new_Parent", request.Lookup.SchemaName);
        Assert.Equal(AttributeRequiredLevel.Recommended, request.Lookup.RequiredLevel.Value);
        Assert.Equal(["new_account_contact_parent"], result.Value!.Relationships);
    }

    [Fact]
    public async Task A_long_default_relationship_name_is_truncated_to_100_characters()
    {
        var (service, client) = Make();

        await service.CreateLookupAsync(new CreateLookupBody
        {
            Table = "contact", SchemaName = "new_" + new string('x', 120), DisplayName = "Long", Targets = ["account"], Solution = "Core",
        }, CancellationToken.None);

        Assert.Equal(100, Only<CreateOneToManyRequest>(client).OneToManyRelationship.SchemaName.Length);
    }

    [Fact]
    public async Task A_lookup_relationship_name_must_carry_the_prefix()
    {
        var (service, client) = Make();

        var result = await service.CreateLookupAsync(new CreateLookupBody
        {
            Table = "contact", SchemaName = "new_Parent", DisplayName = "Parent", Targets = ["account"], Solution = "Core", RelationshipSchemaName = "other_rel",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    public async Task A_lookup_needs_one_to_ten_targets(int count)
    {
        var (service, client) = Make();

        var result = await service.CreateLookupAsync(new CreateLookupBody
        {
            Table = "contact", SchemaName = "new_Parent", DisplayName = "Parent", Solution = "Core",
            Targets = Enumerable.Range(0, count).Select(i => $"t{i}").ToList(),
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task A_multi_target_lookup_needs_a_solution()
    {
        var (service, client) = Make();

        var result = await service.CreateLookupAsync(new CreateLookupBody
        {
            Table = "contact", SchemaName = "new_Parent", DisplayName = "Parent", Targets = ["account", "contact"], Publisher = "new",
        }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Create_many_to_many_builds_the_relationship_and_the_intersect_table()
    {
        var (service, client) = Make();

        var result = await service.CreateManyToManyAsync(new CreateManyToManyBody
        {
            Table1 = "account", Table2 = "contact", SchemaName = "new_account_contact", Solution = "Core",
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<CreateManyToManyRequest>(client);
        Assert.Equal("new_account_contact", request.IntersectEntitySchemaName);
        Assert.Equal("account", request.ManyToManyRelationship.Entity1LogicalName);
        Assert.Equal("contact", request.ManyToManyRelationship.Entity2LogicalName);
        Assert.Equal("Core", request.SolutionUniqueName);
    }

    // ── Choices ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_choice_builds_a_global_option_set_with_numbered_values()
    {
        var (service, client) = Make();

        var result = await service.CreateChoiceAsync(new CreateChoiceBody
        {
            SchemaName = "new_colors", DisplayName = "Colors", Solution = "Core",
            Options = [new ChoiceOptionBody { Label = "Red" }, new ChoiceOptionBody { Label = "Blue" }],
        }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<CreateOptionSetRequest>(client);
        var set = Assert.IsType<OptionSetMetadata>(request.OptionSet);
        Assert.True(set.IsGlobal);
        Assert.Equal("new_colors", set.Name);
        Assert.Equal([100000000, 100000001], set.Options.Select(o => o.Value!.Value));
        Assert.Equal("Core", request.SolutionUniqueName);
    }

    [Fact]
    public async Task Create_choice_rejects_no_options_and_duplicate_values()
    {
        var (service, client) = Make();

        var none = await service.CreateChoiceAsync(new CreateChoiceBody { SchemaName = "new_c", DisplayName = "C", Solution = "Core", Options = [] }, CancellationToken.None);
        var dup = await service.CreateChoiceAsync(new CreateChoiceBody
        {
            SchemaName = "new_c", DisplayName = "C", Solution = "Core",
            Options = [new ChoiceOptionBody { Label = "A", Value = 1 }, new ChoiceOptionBody { Label = "B", Value = 1 }],
        }, CancellationToken.None);

        Assert.All([none.Problem, dup.Problem], p => Assert.Equal("InvalidRequest", p!.Code));
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Add_option_takes_a_global_choice_or_a_table_and_column()
    {
        var local = new PicklistAttributeMetadata { LogicalName = "new_rating", OptionSet = new OptionSetMetadata { IsGlobal = false } };
        var (service, client) = Make(request => request is RetrieveAttributeRequest
            ? Responses.Of<RetrieveAttributeResponse>(("AttributeMetadata", local))
            : Responses.Of<InsertOptionValueResponse>(("NewOptionValue", 42)));

        var byName = await service.AddChoiceOptionAsync(new AddChoiceOptionBody { Choice = "new_colors", Label = "Green" }, CancellationToken.None);
        var byColumn = await service.AddChoiceOptionAsync(new AddChoiceOptionBody { Table = "account", Column = "new_rating", Label = "Cold", Value = 7 }, CancellationToken.None);

        Assert.Equal(42, byName.Value!.Value);
        var requests = client.Executed.OfType<InsertOptionValueRequest>().ToList();
        Assert.Equal("new_colors", requests[0].OptionSetName);
        Assert.Equal("account", requests[1].EntityLogicalName);
        Assert.Equal("new_rating", requests[1].AttributeLogicalName);
        Assert.Equal(7, requests[1].Value);
        Assert.Equal("Cold", Label(requests[1].Label));
    }

    [Fact]
    public async Task Add_option_on_a_column_with_a_global_choice_adds_it_to_that_choice()
    {
        var column = new PicklistAttributeMetadata { LogicalName = "new_rating", OptionSet = new OptionSetMetadata { IsGlobal = true, Name = "new_ratings" } };
        var (service, client) = Make(request => request is RetrieveAttributeRequest
            ? Responses.Of<RetrieveAttributeResponse>(("AttributeMetadata", column))
            : Responses.Of<InsertOptionValueResponse>(("NewOptionValue", 3)));

        var result = await service.AddChoiceOptionAsync(new AddChoiceOptionBody { Table = "account", Column = "new_rating", Label = "Hot" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<InsertOptionValueRequest>(client);
        Assert.Equal("new_ratings", request.OptionSetName);
        Assert.Null(request.EntityLogicalName);
    }

    [Fact]
    public async Task Add_option_in_a_solution_numbers_from_the_publisher_prefix_and_skips_used_values()
    {
        var set = new OptionSetMetadata(new OptionMetadataCollection
        {
            new(new Label("A", 1033), 100000000),
            new(new Label("B", 1033), 100000001),
        }) { Name = "new_colors", IsGlobal = true };
        var (service, client) = Make(request => request switch
        {
            RetrieveOptionSetRequest => Responses.Of<RetrieveOptionSetResponse>(("OptionSetMetadata", set)),
            _ => Responses.Of<InsertOptionValueResponse>(("NewOptionValue", 100000002)),
        });

        var result = await service.AddChoiceOptionAsync(
            new AddChoiceOptionBody { Choice = "new_colors", Label = "C", Solution = "Core" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Only<InsertOptionValueRequest>(client);
        Assert.Equal(100000002, request.Value);
        Assert.Equal("Core", request.SolutionUniqueName);
    }

    [Fact]
    public async Task Add_option_rejects_giving_both_or_neither()
    {
        var (service, client) = Make();

        var both = await service.AddChoiceOptionAsync(new AddChoiceOptionBody { Choice = "c", Table = "t", Column = "c", Label = "x" }, CancellationToken.None);
        var neither = await service.AddChoiceOptionAsync(new AddChoiceOptionBody { Label = "x" }, CancellationToken.None);

        Assert.All([both.Problem, neither.Problem], p => Assert.Equal("InvalidRequest", p!.Code));
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Get_choice_lists_values_and_labels_and_reports_a_missing_choice()
    {
        var (service, client) = Make(request =>
        {
            var set = new OptionSetMetadata(new OptionMetadataCollection
            {
                new OptionMetadata(new Label("Red", 1033), 1),
                new OptionMetadata(new Label("Blue", 1033), 2),
            }) { Name = "new_colors" };
            return Responses.Of<RetrieveOptionSetResponse>(("OptionSetMetadata", set));
        });

        var found = await service.GetChoiceAsync("new_colors", CancellationToken.None);
        Assert.Equal([(1, "Red"), (2, "Blue")], found.Value!.Select(c => (c.Value, c.Label)));

        client.OnExecute = _ => throw FakeAgentClient.Fault(unchecked((int)0x80040217), "gone");
        var missing = await service.GetChoiceAsync("nope", CancellationToken.None);
        Assert.Equal("NotFound", missing.Problem!.Code);
    }
}
