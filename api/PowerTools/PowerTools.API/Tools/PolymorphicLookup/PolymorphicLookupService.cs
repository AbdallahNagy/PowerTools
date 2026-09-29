using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.PolymorphicLookup;

public sealed record ServiceResult<T>(T? Value, PolymorphicLookupProblem? Problem)
{
    public static ServiceResult<T> Ok(T value) => new(value, null);

    public static ServiceResult<T> Fail(PolymorphicLookupProblem problem) => new(default, problem);
}

public sealed class PolymorphicLookupService(IPolymorphicLookupClient client)
{
    public async Task<ServiceResult<PolymorphicMetadataDto>> GetMetadataAsync(CancellationToken cancellationToken)
    {
        try
        {
            var languageCode = await RequireLanguageCodeAsync(cancellationToken);
            var response = (RetrieveMetadataChangesResponse)await client.ExecuteAsync(
                PolymorphicLookupRequests.CreateMetadataRequest(),
                cancellationToken);
            return ServiceResult<PolymorphicMetadataDto>.Ok(
                PolymorphicLookupRequests.MapMetadata(response.EntityMetadata, languageCode));
        }
        catch (Exception ex)
        {
            return ServiceResult<PolymorphicMetadataDto>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<IReadOnlyList<UnmanagedSolutionDto>>> GetSolutionsAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var solutions = await RetrieveSolutionsAsync(uniqueName: null, cancellationToken);
            return ServiceResult<IReadOnlyList<UnmanagedSolutionDto>>.Ok(
                PolymorphicLookupRequests.MapSolutions(solutions));
        }
        catch (Exception ex)
        {
            return ServiceResult<IReadOnlyList<UnmanagedSolutionDto>>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<AttributeIdDto>> CreateAsync(
        CreatePolymorphicLookupBody body,
        CancellationToken cancellationToken)
    {
        try
        {
            var problem = ValidateCreate(body);
            if (problem is not null) return ServiceResult<AttributeIdDto>.Fail(problem);

            var solution = await RequireSolutionAsync(body.SolutionUniqueName!, cancellationToken);
            problem = PolymorphicLookupRules.ValidatePrefix(
                body.SchemaName!,
                solution.CustomizationPrefix,
                "Lookup schema name");
            if (problem is not null) return ServiceResult<AttributeIdDto>.Fail(problem);

            foreach (var relationship in body.Relationships!)
            {
                problem = PolymorphicLookupRules.ValidatePrefix(
                    relationship.SchemaName!,
                    solution.CustomizationPrefix,
                    "Relationship schema name");
                if (problem is not null) return ServiceResult<AttributeIdDto>.Fail(problem);
            }

            var referencing = await RetrieveEntityAsync(
                body.ReferencingEntityLogicalName!,
                EntityFilters.Entity,
                cancellationToken);
            problem = RefuseSolutionAware(referencing);
            if (problem is not null) return ServiceResult<AttributeIdDto>.Fail(problem);

            var languageCode = await RequireLanguageCodeAsync(cancellationToken);
            var relationships = body.Relationships
                .Select(relationship => PolymorphicLookupRules.BuildRelationship(
                    relationship,
                    body.ReferencingEntityLogicalName!,
                    referencingAttribute: null,
                    referencedAttribute: null,
                    languageCode))
                .ToArray();

            var request = new OrganizationRequest("CreatePolymorphicLookupAttribute")
            {
                ["Lookup"] = new LookupAttributeMetadata
                {
                    SchemaName = body.SchemaName,
                    DisplayName = new Label(body.DisplayName, languageCode),
                },
                ["OneToManyRelationships"] = relationships,
                ["SolutionUniqueName"] = body.SolutionUniqueName,
            };

            var response = await client.ExecuteAsync(request, cancellationToken);
            if (!response.Results.TryGetValue("AttributeId", out var raw) || raw is not Guid attributeId)
            {
                return ServiceResult<AttributeIdDto>.Fail(PolymorphicLookupFaults.Local(
                    "AttributeIdMissing",
                    "CreatePolymorphicLookupAttribute did not return an attribute id."));
            }

            return ServiceResult<AttributeIdDto>.Ok(new AttributeIdDto(attributeId));
        }
        catch (PolymorphicLookupValidationException ex)
        {
            return ServiceResult<AttributeIdDto>.Fail(ex.Problem);
        }
        catch (Exception ex)
        {
            return ServiceResult<AttributeIdDto>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<SchemaNameDto>> AddRelationshipAsync(
        AddRelationshipBody body,
        CancellationToken cancellationToken)
    {
        try
        {
            var problem = ValidateAdd(body);
            if (problem is not null) return ServiceResult<SchemaNameDto>.Fail(problem);

            var solution = await RequireSolutionAsync(body.SolutionUniqueName!, cancellationToken);
            problem = PolymorphicLookupRules.ValidatePrefix(
                body.Relationship!.SchemaName!,
                solution.CustomizationPrefix,
                "Relationship schema name");
            if (problem is not null) return ServiceResult<SchemaNameDto>.Fail(problem);

            var referencing = await RetrieveEntityAsync(
                body.ReferencingEntityLogicalName!,
                EntityFilters.Entity | EntityFilters.Attributes,
                cancellationToken);
            problem = RefuseSolutionAware(referencing);
            if (problem is not null) return ServiceResult<SchemaNameDto>.Fail(problem);

            var lookup = (referencing.Attributes ?? [])
                .OfType<LookupAttributeMetadata>()
                .FirstOrDefault(attribute => string.Equals(
                    attribute.LogicalName,
                    body.ReferencingAttributeLogicalName,
                    StringComparison.OrdinalIgnoreCase));
            if (lookup is null)
            {
                return ServiceResult<SchemaNameDto>.Fail(PolymorphicLookupFaults.Local(
                    "LookupNotFound",
                    $"No lookup column '{body.ReferencingAttributeLogicalName}' was found on '{body.ReferencingEntityLogicalName}'."));
            }

            var referenced = await RetrieveEntityAsync(
                body.Relationship.ReferencedEntityLogicalName!,
                EntityFilters.Entity,
                cancellationToken);

            var languageCode = await RequireLanguageCodeAsync(cancellationToken);
            var relationship = PolymorphicLookupRules.BuildRelationship(
                body.Relationship,
                body.ReferencingEntityLogicalName!,
                lookup.LogicalName,
                referenced.PrimaryIdAttribute,
                languageCode);

            var request = new CreateOneToManyRequest
            {
                Lookup = lookup,
                OneToManyRelationship = relationship,
                SolutionUniqueName = body.SolutionUniqueName,
            };
            await client.ExecuteAsync(request, cancellationToken);
            return ServiceResult<SchemaNameDto>.Ok(new SchemaNameDto(relationship.SchemaName));
        }
        catch (PolymorphicLookupValidationException ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(ex.Problem);
        }
        catch (Exception ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<SchemaNameDto>> UpdateRelationshipAsync(
        string schemaName,
        UpdateRelationshipBody body,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(body.ReferencingEntityLogicalName))
            {
                return ServiceResult<SchemaNameDto>.Fail(PolymorphicLookupFaults.Local(
                    "ReferencingEntityRequired",
                    "A referencing table is required."));
            }

            var cascadeProblem = PolymorphicLookupRules.ValidateCascade(body.Cascade);
            if (cascadeProblem is not null) return ServiceResult<SchemaNameDto>.Fail(cascadeProblem);

            var entity = await RetrieveEntityAsync(
                body.ReferencingEntityLogicalName,
                EntityFilters.Relationships,
                cancellationToken);
            var relationship = FindRelationship(entity, schemaName);
            if (relationship is null)
            {
                return ServiceResult<SchemaNameDto>.Fail(RelationshipNotFound(schemaName, body.ReferencingEntityLogicalName));
            }

            var languageCode = await RequireLanguageCodeAsync(cancellationToken);
            relationship.CascadeConfiguration = PolymorphicLookupRules.ToCascadeConfiguration(body.Cascade);
            relationship.IsValidForAdvancedFind = body.IsValidForAdvancedFind ?? relationship.IsValidForAdvancedFind;
            relationship.AssociatedMenuConfiguration ??= new AssociatedMenuConfiguration();
            relationship.AssociatedMenuConfiguration.Behavior =
                PolymorphicLookupRules.ParseMenuBehavior(body.AssociatedMenuBehavior);
            relationship.AssociatedMenuConfiguration.Group =
                PolymorphicLookupRules.ParseMenuGroup(body.AssociatedMenuGroup);
            relationship.AssociatedMenuConfiguration.Order =
                body.AssociatedMenuOrder ?? relationship.AssociatedMenuConfiguration.Order;
            if (body.AssociatedMenuLabel is not null)
            {
                relationship.AssociatedMenuConfiguration.Label = string.IsNullOrWhiteSpace(body.AssociatedMenuLabel)
                    ? null
                    : new Label(body.AssociatedMenuLabel, languageCode);
            }

            var request = new UpdateRelationshipRequest
            {
                Relationship = relationship,
                MergeLabels = true,
            };
            await client.ExecuteAsync(request, cancellationToken);
            return ServiceResult<SchemaNameDto>.Ok(new SchemaNameDto(relationship.SchemaName ?? schemaName));
        }
        catch (PolymorphicLookupValidationException ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(ex.Problem);
        }
        catch (Exception ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<SchemaNameDto>> DeleteRelationshipAsync(
        string schemaName,
        string? referencingEntityLogicalName,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(referencingEntityLogicalName))
            {
                return ServiceResult<SchemaNameDto>.Fail(PolymorphicLookupFaults.Local(
                    "ReferencingEntityRequired",
                    "A referencing table is required."));
            }

            var entity = await RetrieveEntityAsync(
                referencingEntityLogicalName,
                EntityFilters.Relationships,
                cancellationToken);
            var relationship = FindRelationship(entity, schemaName);
            if (relationship is null)
            {
                return ServiceResult<SchemaNameDto>.Fail(RelationshipNotFound(schemaName, referencingEntityLogicalName));
            }

            var request = new DeleteRelationshipRequest { Name = relationship.SchemaName ?? schemaName };
            await client.ExecuteAsync(request, cancellationToken);
            return ServiceResult<SchemaNameDto>.Ok(new SchemaNameDto(request.Name));
        }
        catch (Exception ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(MapException(ex));
        }
    }

    public async Task<ServiceResult<SchemaNameDto>> DeleteAttributeAsync(
        string entityLogicalName,
        string attributeLogicalName,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = new DeleteAttributeRequest
            {
                EntityLogicalName = entityLogicalName,
                LogicalName = attributeLogicalName,
            };
            await client.ExecuteAsync(request, cancellationToken);
            return ServiceResult<SchemaNameDto>.Ok(new SchemaNameDto(attributeLogicalName));
        }
        catch (Exception ex)
        {
            return ServiceResult<SchemaNameDto>.Fail(MapException(ex));
        }
    }

    private async Task<UnmanagedSolutionDto> RequireSolutionAsync(
        string uniqueName,
        CancellationToken cancellationToken)
    {
        var solution = await RequireUnmanagedSolutionAsync(uniqueName, cancellationToken);
        if (solution.Problem is not null)
        {
            throw new PolymorphicLookupValidationException(solution.Problem);
        }

        return solution.Value!;
    }

    private async Task<int> RequireLanguageCodeAsync(CancellationToken cancellationToken)
    {
        var language = await RetrieveLanguageCodeAsync(cancellationToken);
        if (language.Problem is not null)
        {
            throw new PolymorphicLookupValidationException(language.Problem);
        }

        return language.Value;
    }

    private async Task<ServiceResult<UnmanagedSolutionDto>> RequireUnmanagedSolutionAsync(
        string uniqueName,
        CancellationToken cancellationToken)
    {
        var solutions = PolymorphicLookupRequests.MapSolutions(
            await RetrieveSolutionsAsync(uniqueName, cancellationToken));
        var solution = solutions.FirstOrDefault(item =>
            string.Equals(item.UniqueName, uniqueName, StringComparison.Ordinal));
        if (solution is null || string.IsNullOrWhiteSpace(solution.CustomizationPrefix))
        {
            return ServiceResult<UnmanagedSolutionDto>.Fail(PolymorphicLookupFaults.Local(
                "UnmanagedSolutionRequired",
                "Choose an unmanaged solution whose publisher has a customization prefix."));
        }

        return ServiceResult<UnmanagedSolutionDto>.Ok(solution);
    }

    private async Task<List<Entity>> RetrieveSolutionsAsync(string? uniqueName, CancellationToken cancellationToken)
    {
        var query = PolymorphicLookupRequests.CreateSolutionQuery(1, null, uniqueName);
        var results = new List<Entity>();
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var page = await client.RetrieveMultipleAsync(query, cancellationToken);
            results.AddRange(page.Entities);
            if (!page.MoreRecords) break;

            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }

        return results;
    }

    private async Task<ServiceResult<int>> RetrieveLanguageCodeAsync(CancellationToken cancellationToken)
    {
        var page = await client.RetrieveMultipleAsync(
            PolymorphicLookupRequests.CreateOrganizationLanguageQuery(),
            cancellationToken);
        var code = page.Entities.FirstOrDefault()?.GetAttributeValue<int?>("languagecode");
        if (code is null or 0)
        {
            return ServiceResult<int>.Fail(PolymorphicLookupFaults.Local(
                "OrganizationLanguageMissing",
                "The organization base language could not be read."));
        }

        return ServiceResult<int>.Ok(code.Value);
    }

    private async Task<EntityMetadata> RetrieveEntityAsync(
        string logicalName,
        EntityFilters filters,
        CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityResponse)await client.ExecuteAsync(
            PolymorphicLookupRequests.CreateEntityRequest(logicalName, filters),
            cancellationToken);
        return response.EntityMetadata
            ?? throw new PolymorphicLookupValidationException(PolymorphicLookupFaults.Local(
                "EntityNotFound",
                $"Table '{logicalName}' was not found."));
    }

    private static PolymorphicLookupProblem? RefuseSolutionAware(EntityMetadata entity)
    {
        if (entity.IsSolutionAware == true)
        {
            return PolymorphicLookupFaults.Describe(
                PolymorphicLookupFaults.PolymorphicLookupNotSupportedInSolutionAwareEntity);
        }

        return null;
    }

    private static OneToManyRelationshipMetadata? FindRelationship(EntityMetadata entity, string schemaName) =>
        (entity.ManyToOneRelationships ?? []).FirstOrDefault(relationship =>
            string.Equals(relationship.SchemaName, schemaName, StringComparison.OrdinalIgnoreCase));

    private static PolymorphicLookupProblem RelationshipNotFound(string schemaName, string entityLogicalName) =>
        PolymorphicLookupFaults.Local(
            "RelationshipNotFound",
            $"No relationship named '{schemaName}' was found on '{entityLogicalName}'.");

    private static PolymorphicLookupProblem? ValidateCreate(CreatePolymorphicLookupBody body)
    {
        if (string.IsNullOrWhiteSpace(body.SolutionUniqueName))
        {
            return PolymorphicLookupFaults.Local("SolutionRequired", "An unmanaged solution is required.");
        }

        if (string.IsNullOrWhiteSpace(body.ReferencingEntityLogicalName))
        {
            return PolymorphicLookupFaults.Local("ReferencingEntityRequired", "A referencing table is required.");
        }

        if (string.IsNullOrWhiteSpace(body.DisplayName))
        {
            return PolymorphicLookupFaults.Local("DisplayNameRequired", "A display name is required.");
        }

        var schema = PolymorphicLookupRules.ValidateSchemaName(body.SchemaName, "Lookup schema name");
        if (schema is not null) return schema;

        var relationships = body.Relationships ?? [];
        if (relationships.Count == 0)
        {
            return PolymorphicLookupFaults.Describe(
                PolymorphicLookupFaults.RelationshipsMissingFromCreatePolymorphicLookupAttribute);
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var relationship in relationships)
        {
            var relationshipProblem = ValidateRelationship(relationship, body.ReferencingEntityLogicalName);
            if (relationshipProblem is not null) return relationshipProblem;

            if (!seen.Add(relationship.ReferencedEntityLogicalName!))
            {
                return PolymorphicLookupFaults.Describe(
                    PolymorphicLookupFaults.EntityCanOnlyBeReferencedOnceInPolymorphicLookup);
            }
        }

        return null;
    }

    private static PolymorphicLookupProblem? ValidateAdd(AddRelationshipBody body)
    {
        if (string.IsNullOrWhiteSpace(body.SolutionUniqueName))
        {
            return PolymorphicLookupFaults.Local("SolutionRequired", "An unmanaged solution is required.");
        }

        if (string.IsNullOrWhiteSpace(body.ReferencingEntityLogicalName)
            || string.IsNullOrWhiteSpace(body.ReferencingAttributeLogicalName))
        {
            return PolymorphicLookupFaults.Local(
                "ReferencingEntityRequired",
                "The referencing table and lookup column are required.");
        }

        if (body.Relationship is null)
        {
            return PolymorphicLookupFaults.Describe(
                PolymorphicLookupFaults.RelationshipsMissingFromCreatePolymorphicLookupAttribute);
        }

        return ValidateRelationship(body.Relationship, body.ReferencingEntityLogicalName);
    }

    private static PolymorphicLookupProblem? ValidateRelationship(
        RelationshipBody relationship,
        string referencingEntityLogicalName)
    {
        if (string.IsNullOrWhiteSpace(relationship.ReferencedEntityLogicalName))
        {
            return PolymorphicLookupFaults.Local("ReferencedEntityRequired", "A referenced table is required.");
        }

        if (string.Equals(
                relationship.ReferencedEntityLogicalName,
                referencingEntityLogicalName,
                StringComparison.OrdinalIgnoreCase))
        {
            return PolymorphicLookupFaults.Describe(
                PolymorphicLookupFaults.CannotCreateSelfReferentialPolymorphicLookup);
        }

        var schema = PolymorphicLookupRules.ValidateSchemaName(relationship.SchemaName, "Relationship schema name");
        if (schema is not null) return schema;

        return PolymorphicLookupRules.ValidateCascade(relationship.Cascade);
    }

    private static PolymorphicLookupProblem MapException(Exception exception)
    {
        if (exception is PolymorphicLookupValidationException validation)
        {
            return validation.Problem;
        }

        var fault = exception as FaultException<OrganizationServiceFault>
            ?? exception.InnerException as FaultException<OrganizationServiceFault>;
        if (fault is not null)
        {
            var known = PolymorphicLookupFaults.Describe(fault.Detail.ErrorCode);
            if (known is not null) return known;
        }

        return PolymorphicLookupFaults.Local("DataverseFault", DataverseErrorFormatter.Format(exception));
    }
}
