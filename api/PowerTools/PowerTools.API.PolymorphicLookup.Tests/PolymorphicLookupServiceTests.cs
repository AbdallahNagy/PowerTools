using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PolymorphicLookup;
using Xunit;

namespace PowerTools.API.PolymorphicLookup.Tests;

public sealed class FakePolymorphicLookupClient : IPolymorphicLookupClient
{
    public List<OrganizationRequest> Executed { get; } = [];
    public List<QueryBase> Queries { get; } = [];
    public List<(int Page, string? Cookie, int Count)> SolutionPages { get; } = [];

    public Func<OrganizationRequest, OrganizationResponse>? OnExecute { get; set; }
    public Func<QueryBase, EntityCollection>? OnRetrieve { get; set; }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Executed.Add(request);
        if (OnExecute is null) return Task.FromResult(new OrganizationResponse());
        return Task.FromResult(OnExecute(request));
    }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        Queries.Add(query);
        if (query is QueryExpression expression && expression.EntityName == "solution")
        {
            SolutionPages.Add((
                expression.PageInfo.PageNumber,
                expression.PageInfo.PagingCookie,
                expression.PageInfo.Count));
        }

        return Task.FromResult(OnRetrieve?.Invoke(query) ?? new EntityCollection());
    }
}

public sealed class PolymorphicLookupServiceTests
{
    private static readonly Guid AttributeId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    [Fact]
    public void Metadata_request_asks_for_side_flags_table_type_and_managed_columns()
    {
        var request = PolymorphicLookupRequests.CreateMetadataRequest();
        var names = request.Query.Properties.PropertyNames;

        Assert.Contains("CanBePrimaryEntityInRelationship", names);
        Assert.Contains("CanBeRelatedEntityInRelationship", names);
        Assert.Contains("IsSolutionAware", names);
        Assert.Contains("TableType", names);
        Assert.Contains("ManyToOneRelationships", names);
        Assert.Contains("IsManaged", request.Query.AttributeQuery.Properties.PropertyNames);
        Assert.Contains("IsCustomizable", request.Query.AttributeQuery.Properties.PropertyNames);
        Assert.Null(request.ClientVersionStamp);

        var conditions = Flatten(request.Query.Criteria).ToArray();
        Assert.Contains(conditions, condition =>
            condition.PropertyName == "CanBePrimaryEntityInRelationship" && Equals(condition.Value, true));
        Assert.Contains(conditions, condition =>
            condition.PropertyName == "CanBeRelatedEntityInRelationship" && Equals(condition.Value, true));
        Assert.Contains(conditions, condition =>
            condition.PropertyName == "IsIntersect" && Equals(condition.Value, false));
        Assert.Contains(
            request.Query.AttributeQuery.Criteria.Conditions,
            condition => condition.PropertyName == "AttributeType");
    }

    [Fact]
    public async Task Solutions_page_until_more_records_is_false_and_keep_only_unmanaged()
    {
        var fake = new FakePolymorphicLookupClient
        {
            OnRetrieve = query =>
            {
                var expression = Assert.IsType<QueryExpression>(query);
                Assert.Equal("solution", expression.EntityName);
                Assert.Contains(expression.Criteria.Conditions, condition =>
                    condition.AttributeName == "ismanaged"
                    && condition.Operator == ConditionOperator.Equal
                    && Equals(condition.Values[0], false));
                var publisher = Assert.Single(expression.LinkEntities);
                Assert.Equal("publisher", publisher.LinkToEntityName);
                Assert.Equal("pub", publisher.EntityAlias);
                Assert.Contains("customizationprefix", publisher.Columns.Columns);

                if (expression.PageInfo.PageNumber == 1)
                {
                    return Page(true, "cookie-2", Solution("One", "First", "new"));
                }

                return Page(false, null, Solution("Two", "Second", "contoso"));
            },
        };

        var result = await new PolymorphicLookupService(fake).GetSolutionsAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal("new", result.Value[0].CustomizationPrefix);
        Assert.Equal("contoso", result.Value[1].CustomizationPrefix);
        Assert.Equal([(1, null, 5000), (2, "cookie-2", 5000)], fake.SolutionPages);
    }

    [Fact]
    public async Task Create_sends_polymorphic_request_and_does_not_rewrite_elastic_delete_cascade()
    {
        var fake = HappyPath(TableType: "Elastic", solutionAware: false);
        var body = CreateBody(relationships: [Relationship("account"), Relationship("contact")]);

        var result = await new PolymorphicLookupService(fake).CreateAsync(body, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(AttributeId, result.Value!.AttributeId);
        var request = Assert.Single(fake.Executed, item => item.RequestName == "CreatePolymorphicLookupAttribute");
        Assert.Equal("Contoso", request["SolutionUniqueName"]);
        var lookup = Assert.IsType<LookupAttributeMetadata>(request["Lookup"]);
        Assert.Equal("new_CustomerId", lookup.SchemaName);
        var label = Assert.Single(lookup.DisplayName.LocalizedLabels);
        Assert.Equal(1033, label.LanguageCode);
        Assert.Equal("Customer", label.Label);
        var relationships = Assert.IsAssignableFrom<OneToManyRelationshipMetadata[]>(request["OneToManyRelationships"]);
        Assert.Equal(2, relationships.Length);
        Assert.All(relationships, relationship =>
        {
            Assert.Null(relationship.ReferencedAttribute);
            Assert.Equal(CascadeType.RemoveLink, relationship.CascadeConfiguration.Delete);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.Assign);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.Merge);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.Reparent);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.Share);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.Unshare);
            Assert.Equal(CascadeType.NoCascade, relationship.CascadeConfiguration.RollupView);
            Assert.Null(relationship.CascadeConfiguration.Archive);
        });
        Assert.DoesNotContain(fake.Executed, item => item.RequestName is "PublishXml" or "PublishAllXml" or "AddSolutionComponent");
    }

    [Fact]
    public async Task Create_truncates_relationship_schema_names_to_100_characters()
    {
        var fake = HappyPath();
        var body = CreateBody(relationships:
        [
            Relationship("account", schemaName: "new_" + new string('A', 120)),
            Relationship("contact"),
        ]);

        var result = await new PolymorphicLookupService(fake).CreateAsync(body, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.Single(fake.Executed, item => item.RequestName == "CreatePolymorphicLookupAttribute");
        var relationships = Assert.IsAssignableFrom<OneToManyRelationshipMetadata[]>(request["OneToManyRelationships"]);
        Assert.Equal(100, relationships[0].SchemaName.Length);
        Assert.StartsWith("new_", relationships[0].SchemaName);
    }

    [Fact]
    public async Task Create_rejects_zero_relationships_before_calling_dataverse()
    {
        var fake = HappyPath();
        var result = await new PolymorphicLookupService(fake).CreateAsync(
            CreateBody(relationships: []),
            CancellationToken.None);

        Assert.Equal("RelationshipsMissingFromCreatePolymorphicLookupAttribute", result.Problem!.Code);
        Assert.Empty(fake.Executed);
    }

    [Fact]
    public async Task Create_allows_one_relationship_because_the_service_requires_only_one()
    {
        var fake = HappyPath();
        var result = await new PolymorphicLookupService(fake).CreateAsync(
            CreateBody(relationships: [Relationship("account")]),
            CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Contains(fake.Executed, item => item.RequestName == "CreatePolymorphicLookupAttribute");
    }

    [Fact]
    public async Task Create_refuses_a_solution_aware_referencing_table_before_create()
    {
        var fake = HappyPath(solutionAware: true);
        var result = await new PolymorphicLookupService(fake).CreateAsync(
            CreateBody(relationships: [Relationship("account"), Relationship("contact")]),
            CancellationToken.None);

        Assert.Equal("PolymorphicLookupNotSupportedInSolutionAwareEntity", result.Problem!.Code);
        Assert.DoesNotContain(fake.Executed, item => item.RequestName == "CreatePolymorphicLookupAttribute");
    }

    [Fact]
    public async Task Create_maps_duplicate_schema_name_instead_of_treating_it_as_not_polymorphic()
    {
        var fake = HappyPath(onCreate: _ => throw Fault(PolymorphicLookupFaults.DuplicateAttributeSchemaName, "new_CustomerId"));
        var result = await new PolymorphicLookupService(fake).CreateAsync(
            CreateBody(relationships: [Relationship("account"), Relationship("contact")]),
            CancellationToken.None);

        Assert.Equal("DuplicateAttributeSchemaName", result.Problem!.Code);
        Assert.Contains("DuplicateAttributeSchemaName", result.Problem.Message);
        Assert.DoesNotContain("not a polymorphic lookup", result.Problem.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(PolymorphicLookupFaults.CascadeBehaviorNotSupportedInPolymorphicLookup, "CascadeBehaviorNotSupportedInPolymorphicLookup")]
    [InlineData(PolymorphicLookupFaults.LastPolymorphicRelationshipCannotBeDeleted, "LastPolymorphicRelationshipCannotBeDeleted")]
    [InlineData(PolymorphicLookupFaults.PolymorphicLookupStyleCannotBeUpdated, "PolymorphicLookupStyleCannotBeUpdated")]
    [InlineData(PolymorphicLookupFaults.CannotCreateSelfReferentialPolymorphicLookup, "CannotCreateSelfReferentialPolymorphicLookup")]
    [InlineData(PolymorphicLookupFaults.EntityCanOnlyBeReferencedOnceInPolymorphicLookup, "EntityCanOnlyBeReferencedOnceInPolymorphicLookup")]
    [InlineData(PolymorphicLookupFaults.CreatePolymorphicLookupAttributeApiIsNotActive, "CreatePolymorphicLookupAttributeApiIsNotActive")]
    [InlineData(PolymorphicLookupFaults.RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity, "RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity")]
    [InlineData(PolymorphicLookupFaults.RelationshipsMissingFromCreatePolymorphicLookupAttribute, "RelationshipsMissingFromCreatePolymorphicLookupAttribute")]
    public void Documented_polymorphic_faults_keep_their_meaning(int errorCode, string code)
    {
        var problem = PolymorphicLookupFaults.Describe(errorCode);
        Assert.NotNull(problem);
        Assert.Equal(code, problem.Code);
        Assert.DoesNotContain("not a polymorphic lookup", problem.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Add_relationship_sends_create_one_to_many_with_solution_and_referential_cascade()
    {
        var fake = HappyPath();
        var result = await new PolymorphicLookupService(fake).AddRelationshipAsync(
            new AddRelationshipBody
            {
                SolutionUniqueName = "Contoso",
                ReferencingEntityLogicalName = "incident",
                ReferencingAttributeLogicalName = "new_customerid",
                Relationship = Relationship("account"),
            },
            CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.Single(fake.Executed.OfType<CreateOneToManyRequest>());
        Assert.Equal("Contoso", request.SolutionUniqueName);
        Assert.Equal("new_customerid", request.Lookup.LogicalName);
        Assert.Equal("account", request.OneToManyRelationship.ReferencedEntity);
        Assert.Equal("incident", request.OneToManyRelationship.ReferencingEntity);
        Assert.Equal("new_customerid", request.OneToManyRelationship.ReferencingAttribute);
        Assert.Equal("accountid", request.OneToManyRelationship.ReferencedAttribute);
        Assert.Equal(CascadeType.RemoveLink, request.OneToManyRelationship.CascadeConfiguration.Delete);
        Assert.Null(request.OneToManyRelationship.CascadeConfiguration.Archive);
    }

    [Fact]
    public async Task Update_relationship_merges_labels_and_omits_solution_unique_name()
    {
        var fake = HappyPath();
        var result = await new PolymorphicLookupService(fake).UpdateRelationshipAsync(
            "new_AccountId",
            new UpdateRelationshipBody
            {
                ReferencingEntityLogicalName = "incident",
                IsValidForAdvancedFind = false,
                AssociatedMenuBehavior = "UseLabel",
                AssociatedMenuGroup = "Sales",
                AssociatedMenuOrder = 10001,
                AssociatedMenuLabel = "Accounts",
                Cascade = ValidCascade(),
            },
            CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.Single(fake.Executed.OfType<UpdateRelationshipRequest>());
        Assert.True(request.MergeLabels);
        Assert.False(request.Parameters.Contains("SolutionUniqueName"));
        var relationship = Assert.IsType<OneToManyRelationshipMetadata>(request.Relationship);
        Assert.Equal(CascadeType.RemoveLink, relationship.CascadeConfiguration.Delete);
        Assert.Equal(AssociatedMenuBehavior.UseLabel, relationship.AssociatedMenuConfiguration.Behavior);
    }

    [Fact]
    public async Task Delete_relationship_uses_the_schema_name_and_stops_when_metadata_is_missing()
    {
        var fake = HappyPath();
        var deleted = await new PolymorphicLookupService(fake).DeleteRelationshipAsync(
            "new_AccountId",
            "incident",
            CancellationToken.None);

        Assert.Null(deleted.Problem);
        var request = Assert.Single(fake.Executed.OfType<DeleteRelationshipRequest>());
        Assert.Equal("new_AccountId", request.Name);
        Assert.False(request.Parameters.Contains("SolutionUniqueName"));

        var missing = new FakePolymorphicLookupClient
        {
            OnExecute = execute => execute is RetrieveEntityRequest
                ? EntityResponse(Table("incident", related: true, relationships: []))
                : throw new InvalidOperationException(execute.RequestName),
        };
        var result = await new PolymorphicLookupService(missing).DeleteRelationshipAsync(
            "new_Missing",
            "incident",
            CancellationToken.None);

        Assert.Equal("RelationshipNotFound", result.Problem!.Code);
        Assert.DoesNotContain(missing.Executed, item => item is DeleteRelationshipRequest);
    }

    [Fact]
    public async Task Delete_attribute_targets_the_table_and_column_without_a_solution()
    {
        var fake = new FakePolymorphicLookupClient();
        var result = await new PolymorphicLookupService(fake).DeleteAttributeAsync(
            "incident",
            "new_customerid",
            CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.Single(fake.Executed.OfType<DeleteAttributeRequest>());
        Assert.Equal("incident", request.EntityLogicalName);
        Assert.Equal("new_customerid", request.LogicalName);
        Assert.False(request.Parameters.Contains("SolutionUniqueName"));
    }

    [Fact]
    public void Invalid_cascade_is_rejected_without_an_elastic_override()
    {
        var problem = PolymorphicLookupRules.ValidateCascade(new CascadeBody
        {
            Assign = "NoCascade",
            Merge = "NoCascade",
            Reparent = "NoCascade",
            Share = "NoCascade",
            Unshare = "NoCascade",
            RollupView = "NoCascade",
            Delete = "NoCascade",
        });

        Assert.Equal("CascadeBehaviorNotSupportedInPolymorphicLookup", problem!.Code);
    }

    private static FakePolymorphicLookupClient HappyPath(
        string? TableType = "Standard",
        bool solutionAware = false,
        Func<OrganizationRequest, OrganizationResponse>? onCreate = null)
    {
        return new FakePolymorphicLookupClient
        {
            OnRetrieve = query =>
            {
                var expression = (QueryExpression)query;
                if (expression.EntityName == "organization")
                {
                    var organization = new Entity("organization");
                    organization["languagecode"] = 1033;
                    return new EntityCollection([organization]);
                }

                return new EntityCollection([Solution("Contoso", "Contoso Solution", "new")]);
            },
            OnExecute = request =>
            {
                if (request is RetrieveEntityRequest retrieve)
                {
                    if (retrieve.LogicalName == "account")
                    {
                        return EntityResponse(Table("account", primary: true, primaryId: "accountid"));
                    }

                    return EntityResponse(Table(
                        "incident",
                        related: true,
                        tableType: TableType,
                        solutionAware: solutionAware,
                        lookups: [Lookup()],
                        relationships: [ExistingRelationship()]));
                }

                if (request.RequestName == "CreatePolymorphicLookupAttribute")
                {
                    if (onCreate is not null) return onCreate(request);
                    var response = new OrganizationResponse();
                    response.Results["AttributeId"] = AttributeId;
                    return response;
                }

                return new OrganizationResponse();
            },
        };
    }

    private static CreatePolymorphicLookupBody CreateBody(List<RelationshipBody> relationships) => new()
    {
        SolutionUniqueName = "Contoso",
        ReferencingEntityLogicalName = "incident",
        DisplayName = "Customer",
        SchemaName = "new_CustomerId",
        Relationships = relationships,
    };

    private static RelationshipBody Relationship(string referenced, string? schemaName = null) => new()
    {
        ReferencedEntityLogicalName = referenced,
        SchemaName = schemaName ?? $"new_{referenced}Id",
        IsValidForAdvancedFind = true,
        AssociatedMenuBehavior = "UseCollectionName",
        AssociatedMenuGroup = "Details",
        AssociatedMenuOrder = 10000,
        Cascade = ValidCascade(),
    };

    private static CascadeBody ValidCascade() => new()
    {
        Assign = "NoCascade",
        Merge = "NoCascade",
        Reparent = "NoCascade",
        Share = "NoCascade",
        Unshare = "NoCascade",
        RollupView = "NoCascade",
        Delete = "RemoveLink",
    };

    private static Entity Solution(string uniqueName, string friendlyName, string prefix)
    {
        var solution = new Entity("solution");
        solution["uniquename"] = uniqueName;
        solution["friendlyname"] = friendlyName;
        solution["version"] = "1.0.0.0";
        solution["pub.customizationprefix"] = new AliasedValue("publisher", "customizationprefix", prefix);
        solution["pub.friendlyname"] = new AliasedValue("publisher", "friendlyname", friendlyName);
        return solution;
    }

    private static EntityCollection Page(bool moreRecords, string? cookie, params Entity[] entities)
    {
        var collection = new EntityCollection(entities.ToList())
        {
            MoreRecords = moreRecords,
            PagingCookie = cookie,
        };
        return collection;
    }

    private static EntityMetadata Table(
        string logicalName,
        bool primary = false,
        bool related = false,
        string? primaryId = null,
        string? tableType = null,
        bool solutionAware = false,
        LookupAttributeMetadata[]? lookups = null,
        OneToManyRelationshipMetadata[]? relationships = null)
    {
        var entity = new EntityMetadata
        {
            LogicalName = logicalName,
            SchemaName = logicalName,
            IsSolutionAware = solutionAware,
        };
        if (tableType is not null) entity.TableType = tableType;
        Set(entity, "PrimaryIdAttribute", primaryId ?? logicalName + "id");
        Set(entity, "IsIntersect", false);
        Set(entity, "CanBePrimaryEntityInRelationship", new BooleanManagedProperty(primary));
        Set(entity, "CanBeRelatedEntityInRelationship", new BooleanManagedProperty(related));
        if (lookups is not null) Set(entity, "Attributes", lookups);
        if (relationships is not null) Set(entity, "ManyToOneRelationships", relationships);
        return entity;
    }

    private static void Set(object target, string propertyName, object? value)
    {
        var property = target.GetType().GetProperty(propertyName);
        var setter = property?.GetSetMethod(nonPublic: true);
        Assert.NotNull(setter);
        setter.Invoke(target, [value]);
    }

    private static LookupAttributeMetadata Lookup() => new()
    {
        LogicalName = "new_customerid",
        SchemaName = "new_CustomerId",
        DisplayName = new Label("Customer", 1033),
    };

    private static OneToManyRelationshipMetadata ExistingRelationship() => new()
    {
        SchemaName = "new_AccountId",
        ReferencedEntity = "account",
        ReferencingEntity = "incident",
        ReferencingAttribute = "new_customerid",
        ReferencedAttribute = "accountid",
        IsValidForAdvancedFind = true,
        CascadeConfiguration = PolymorphicLookupRules.PolymorphicCascade(),
        AssociatedMenuConfiguration = new AssociatedMenuConfiguration
        {
            Behavior = AssociatedMenuBehavior.UseCollectionName,
            Group = AssociatedMenuGroup.Details,
            Order = 10000,
        },
    };

    private static RetrieveEntityResponse EntityResponse(EntityMetadata entity)
    {
        var response = new RetrieveEntityResponse();
        response.Results["EntityMetadata"] = entity;
        return response;
    }

    private static FaultException<OrganizationServiceFault> Fault(int errorCode, string message) =>
        new(new OrganizationServiceFault { ErrorCode = errorCode, Message = message }, message);

    private static IEnumerable<MetadataConditionExpression> Flatten(MetadataFilterExpression? filter)
    {
        if (filter is null) yield break;
        foreach (var condition in filter.Conditions) yield return condition;
        foreach (var child in filter.Filters)
        {
            foreach (var condition in Flatten(child)) yield return condition;
        }
    }
}
