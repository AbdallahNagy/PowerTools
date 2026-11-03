using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using static PowerTools.API.Tools.EnvironmentVariables.EnvironmentVariablesQueries;

namespace PowerTools.API.Tools.EnvironmentVariables;

/// <summary>
/// Lists environment variable definitions with their current values, saves values, and creates,
/// updates, and deletes definitions. Secret contents are never read: a Secret value is only the
/// Key Vault reference path.
/// </summary>
public sealed class EnvironmentVariablesService(IEnvironmentVariablesClient client, bool onPremises)
{
    public const int MaxSaveItems = 500;
    public const string SolutionUniqueNameParameter = "SolutionUniqueName";

    public async Task<EnvironmentVariablesResult<IReadOnlyList<EnvironmentVariableDto>>> ListAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var definitions = await ReadAllAsync(Definitions, cancellationToken);
            var values = await ReadAllAsync(Values, cancellationToken);
            var valuesByDefinition = values
                .Where(value => DefinitionOf(value) is not null)
                .GroupBy(value => DefinitionOf(value)!.Value)
                .ToDictionary(group => group.Key, group => group.ToList());
            var solutions = await ManagedSolutionsAsync(
                values.Where(value => Bool(value, "ismanaged")).Select(value => value.Id).ToList(),
                cancellationToken);

            IReadOnlyList<EnvironmentVariableDto> list = definitions
                .Select(definition => ToDto(
                    definition,
                    valuesByDefinition.GetValueOrDefault(definition.Id) ?? [],
                    solutions))
                .ToList();
            return EnvironmentVariablesResult<IReadOnlyList<EnvironmentVariableDto>>.Ok(list);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<IReadOnlyList<EnvironmentVariableDto>>(EnvironmentVariablesFaults.From(ex));
        }
    }

    public async Task<EnvironmentVariablesResult<IReadOnlyList<SolutionDto>>> ListSolutionsAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var rows = await ReadAllAsync((page, cookie) => Solutions(page, cookie), cancellationToken);
            IReadOnlyList<SolutionDto> solutions = rows.Select(ToSolution).ToList();
            return EnvironmentVariablesResult<IReadOnlyList<SolutionDto>>.Ok(solutions);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<IReadOnlyList<SolutionDto>>(EnvironmentVariablesFaults.From(ex));
        }
    }

    public async Task<EnvironmentVariablesResult<CreateDefinitionResponse>> CreateDefinitionAsync(
        CreateDefinitionBody? body,
        CancellationToken cancellationToken)
    {
        if (body?.Type is not int type)
            return Fail<CreateDefinitionResponse>(EnvironmentVariablesFaults.BadRequest("TypeRequired", "Choose a type."));
        if (!EnvironmentVariablesRules.CanCreate(type, onPremises))
        {
            return Fail<CreateDefinitionResponse>(EnvironmentVariablesFaults.BadRequest(
                "UnsupportedType",
                $"{EnvironmentVariablesRules.TypeLabel(type)} variables cannot be created here."));
        }

        try
        {
            var solutionName = string.IsNullOrWhiteSpace(body.SolutionUniqueName) ? null : body.SolutionUniqueName.Trim();
            string? prefix = null;
            if (solutionName is not null)
            {
                var found = await client.RetrieveMultipleAsync(Solutions(1, null, solutionName), cancellationToken);
                var solution = found.Entities.FirstOrDefault();
                if (solution is null)
                {
                    return Fail<CreateDefinitionResponse>(EnvironmentVariablesFaults.BadRequest(
                        "SolutionNotFound",
                        $"No unmanaged solution named {solutionName} was found."));
                }
                prefix = ToSolution(solution).Prefix;
            }

            var schemaName = body.SchemaName?.Trim();
            var displayName = body.DisplayName?.Trim();
            var error = EnvironmentVariablesRules.ValidateSchemaName(schemaName, prefix)
                ?? EnvironmentVariablesRules.ValidateDisplayName(displayName)
                ?? EnvironmentVariablesRules.ValidateDescription(body.Description)
                ?? Prefixed("Default value", EnvironmentVariablesRules.ValidateValue(type, body.DefaultValue, required: false))
                ?? Prefixed("Initial value", EnvironmentVariablesRules.ValidateValue(type, body.InitialValue, required: false));
            if (error is not null)
                return Fail<CreateDefinitionResponse>(EnvironmentVariablesFaults.Invalid(error));

            var definition = new Entity(DefinitionTable)
            {
                ["schemaname"] = schemaName,
                ["displayname"] = displayName,
                ["type"] = new OptionSetValue(type),
            };
            if (!string.IsNullOrEmpty(body.Description)) definition["description"] = body.Description;
            if (!string.IsNullOrEmpty(body.DefaultValue)) definition["defaultvalue"] = body.DefaultValue;
            if (type == (int)EnvironmentVariableType.Secret)
                definition["secretstore"] = new OptionSetValue(SecretStore.AzureKeyVault);

            // The definition goes into the solution; a value is environment specific and does not.
            var create = new CreateRequest { Target = definition };
            if (solutionName is not null) create[SolutionUniqueNameParameter] = solutionName;
            var created = (CreateResponse)await client.ExecuteAsync(create, cancellationToken);
            definition.Id = created.id;

            string? valueId = null;
            string? valueError = null;
            if (!string.IsNullOrEmpty(body.InitialValue))
            {
                try
                {
                    valueId = (await CreateValueAsync(created.id, schemaName!, body.InitialValue, cancellationToken)).ToString("D");
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    valueError = EnvironmentVariablesFaults.From(ex).Message;
                }
            }

            var dto = new EnvironmentVariableDto(
                created.id.ToString("D"),
                schemaName!,
                displayName,
                body.Description,
                type,
                EnvironmentVariablesRules.TypeLabel(type),
                string.IsNullOrEmpty(body.DefaultValue) ? null : body.DefaultValue,
                valueId,
                valueId is null ? null : body.InitialValue,
                type == (int)EnvironmentVariableType.Secret ? SecretStore.AzureKeyVault : null,
                IsManaged: false,
                IsCustomizable: true,
                IsActive: true,
                ValueIsManaged: false,
                ManagedValueSolutions: [],
                ConflictingValues: []);
            return EnvironmentVariablesResult<CreateDefinitionResponse>.Ok(new CreateDefinitionResponse(dto, valueError));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<CreateDefinitionResponse>(EnvironmentVariablesFaults.From(ex));
        }
    }

    public async Task<EnvironmentVariablesResult<DefinitionSavedResponse>> UpdateDefinitionAsync(
        string? id,
        UpdateDefinitionBody? body,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out var definitionId))
            return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.BadRequest("InvalidId", "The definition id is not valid."));
        if (body is null)
            return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.BadRequest("BodyRequired", "Send the fields to change."));
        if (body.SchemaName is not null || body.Type is not null)
        {
            return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.BadRequest(
                "LockedField",
                "The schema name and type cannot be changed after creation."));
        }

        try
        {
            var definition = await ReadDefinitionAsync(definitionId, cancellationToken);
            if (definition is null)
                return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.NotFound("This variable no longer exists."));
            if (ReadOnlyReason(definition) is { } readOnly)
                return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.Conflict("ReadOnly", readOnly));
            if (Bool(definition, "ismanaged") && !IsCustomizable(definition))
            {
                return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.Conflict(
                    "NotCustomizable",
                    "This definition belongs to a managed solution that does not allow customizing it."));
            }

            var type = OptionValue(definition, "type") ?? (int)EnvironmentVariableType.String;
            var error = (body.DisplayName is null ? null : EnvironmentVariablesRules.ValidateDisplayName(body.DisplayName.Trim()))
                ?? EnvironmentVariablesRules.ValidateDescription(body.Description)
                ?? Prefixed("Default value", EnvironmentVariablesRules.ValidateValue(type, body.DefaultValue, required: false));
            if (error is not null)
                return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.Invalid(error));

            var update = new Entity(DefinitionTable, definitionId);
            if (body.DisplayName is not null) update["displayname"] = body.DisplayName.Trim();
            if (body.Description is not null) update["description"] = body.Description.Length == 0 ? null : body.Description;
            if (body.DefaultValue is not null) update["defaultvalue"] = body.DefaultValue.Length == 0 ? null : body.DefaultValue;

            var request = new UpdateRequest { Target = update };
            if (!string.IsNullOrWhiteSpace(body.SolutionUniqueName))
                request[SolutionUniqueNameParameter] = body.SolutionUniqueName.Trim();
            await client.ExecuteAsync(request, cancellationToken);
            return EnvironmentVariablesResult<DefinitionSavedResponse>.Ok(new DefinitionSavedResponse(definitionId.ToString("D")));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<DefinitionSavedResponse>(EnvironmentVariablesFaults.From(ex));
        }
    }

    public async Task<EnvironmentVariablesResult<DeleteDefinitionResponse>> DeleteDefinitionAsync(
        string? id,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out var definitionId))
            return Fail<DeleteDefinitionResponse>(EnvironmentVariablesFaults.BadRequest("InvalidId", "The definition id is not valid."));

        try
        {
            var definition = await ReadDefinitionAsync(definitionId, cancellationToken);
            if (definition is null)
                return Fail<DeleteDefinitionResponse>(EnvironmentVariablesFaults.NotFound("This variable no longer exists."));
            if (Bool(definition, "ismanaged"))
            {
                return Fail<DeleteDefinitionResponse>(EnvironmentVariablesFaults.Conflict(
                    "ManagedDefinition",
                    "This definition belongs to a managed solution. Only uninstalling or upgrading that solution removes it."));
            }

            var dependencies = await DependenciesAsync(DefinitionComponentType, definitionId, cancellationToken);
            if (dependencies.Count > 0)
                return Fail<DeleteDefinitionResponse>(EnvironmentVariablesFaults.HasDependencies("variable", dependencies));

            await client.ExecuteAsync(
                new DeleteRequest { Target = new EntityReference(DefinitionTable, definitionId) },
                cancellationToken);

            // Whether the value cascades is not documented, so report any row left behind.
            var remaining = await client.RetrieveMultipleAsync(ValuesForDefinition(definitionId), cancellationToken);
            IReadOnlyList<string> remainingIds = remaining.Entities.Select(row => row.Id.ToString("D")).ToList();
            return EnvironmentVariablesResult<DeleteDefinitionResponse>.Ok(new DeleteDefinitionResponse(remainingIds));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<DeleteDefinitionResponse>(EnvironmentVariablesFaults.From(ex));
        }
    }

    public async Task<EnvironmentVariablesResult<DeleteValueResponse>> DeleteValueAsync(
        string? id,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out var valueId))
            return Fail<DeleteValueResponse>(EnvironmentVariablesFaults.BadRequest("InvalidId", "The value id is not valid."));

        try
        {
            var found = await client.RetrieveMultipleAsync(ValueById(valueId), cancellationToken);
            var value = found.Entities.FirstOrDefault();
            if (value is null)
                return Fail<DeleteValueResponse>(EnvironmentVariablesFaults.NotFound("This value no longer exists."));
            if (Bool(value, "ismanaged"))
            {
                return Fail<DeleteValueResponse>(EnvironmentVariablesFaults.Conflict(
                    "ManagedValue",
                    "This value was imported with a managed solution. Only a solution upgrade that leaves it out removes it."));
            }

            var dependencies = await DependenciesAsync(ValueComponentType, valueId, cancellationToken);
            if (dependencies.Count > 0)
                return Fail<DeleteValueResponse>(EnvironmentVariablesFaults.HasDependencies("value", dependencies));

            await client.ExecuteAsync(
                new DeleteRequest { Target = new EntityReference(ValueTable, valueId) },
                cancellationToken);
            return EnvironmentVariablesResult<DeleteValueResponse>.Ok(new DeleteValueResponse(valueId.ToString("D")));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<DeleteValueResponse>(EnvironmentVariablesFaults.From(ex));
        }
    }

    /// <summary>
    /// Saves each item on its own, so one failure never stops the rest. Results come back in
    /// request order. A value row is created when the definition has none and updated otherwise.
    /// </summary>
    public async Task<EnvironmentVariablesResult<SaveValuesResponse>> SaveValuesAsync(
        SaveValuesBody? body,
        CancellationToken cancellationToken)
    {
        var items = body?.Items;
        if (items is null || items.Count == 0)
            return Fail<SaveValuesResponse>(EnvironmentVariablesFaults.BadRequest("ItemsRequired", "Send at least one value."));
        if (items.Count > MaxSaveItems)
        {
            return Fail<SaveValuesResponse>(EnvironmentVariablesFaults.BadRequest(
                "TooManyItems",
                $"Send at most {MaxSaveItems} values at once."));
        }

        Dictionary<Guid, Entity> definitions;
        try
        {
            var ids = items
                .Select(item => Guid.TryParse(item.DefinitionId, out var parsed) ? parsed : Guid.Empty)
                .Where(parsed => parsed != Guid.Empty)
                .Distinct()
                .ToList();
            definitions = [];
            foreach (var batch in ids.Chunk(InBatchSize))
            {
                var rows = await client.RetrieveMultipleAsync(DefinitionsById(batch), cancellationToken);
                foreach (var row in rows.Entities) definitions[row.Id] = row;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<SaveValuesResponse>(EnvironmentVariablesFaults.From(ex));
        }

        var results = new List<SaveValueResult>(items.Count);
        foreach (var item in items)
            results.Add(await SaveOneAsync(item, definitions, cancellationToken));
        return EnvironmentVariablesResult<SaveValuesResponse>.Ok(new SaveValuesResponse(results));
    }

    private async Task<SaveValueResult> SaveOneAsync(
        SaveValueItem item,
        IReadOnlyDictionary<Guid, Entity> definitions,
        CancellationToken cancellationToken)
    {
        var key = item.DefinitionId ?? "";
        if (!Guid.TryParse(item.DefinitionId, out var definitionId))
            return new SaveValueResult(key, item.ValueId, false, "The definition id is not valid.");
        if (!definitions.TryGetValue(definitionId, out var definition))
            return new SaveValueResult(key, item.ValueId, false, "This variable no longer exists. Refresh and try again.");
        if (ReadOnlyReason(definition) is { } readOnly)
            return new SaveValueResult(key, item.ValueId, false, readOnly);

        var type = OptionValue(definition, "type") ?? (int)EnvironmentVariableType.String;
        if (EnvironmentVariablesRules.ValidateValue(type, item.Value, required: true) is { } invalid)
            return new SaveValueResult(key, item.ValueId, false, invalid);

        try
        {
            // The one-value rule is only enforced by the maker UI, so read what is there right now.
            var existing = await client.RetrieveMultipleAsync(ValuesForDefinition(definitionId), cancellationToken);
            switch (existing.Entities.Count)
            {
                case > 1:
                    return new SaveValueResult(
                        key,
                        item.ValueId,
                        false,
                        $"This variable has {existing.Entities.Count} value rows. Delete the extra rows before saving.");
                case 1:
                    var row = existing.Entities[0];
                    await client.ExecuteAsync(
                        new UpdateRequest { Target = new Entity(ValueTable, row.Id) { ["value"] = item.Value } },
                        cancellationToken);
                    return new SaveValueResult(key, row.Id.ToString("D"), true, null);
                default:
                    var schemaName = definition.GetAttributeValue<string>("schemaname") ?? "";
                    var created = await CreateValueAsync(definitionId, schemaName, item.Value!, cancellationToken);
                    return new SaveValueResult(key, created.ToString("D"), true, null);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new SaveValueResult(key, item.ValueId, false, EnvironmentVariablesFaults.From(ex).Message);
        }
    }

    private async Task<Guid> CreateValueAsync(
        Guid definitionId,
        string schemaName,
        string value,
        CancellationToken cancellationToken)
    {
        var row = new Entity(ValueTable)
        {
            [DefinitionId] = new EntityReference(DefinitionTable, definitionId),
            ["schemaname"] = schemaName,
            ["value"] = value,
        };
        var response = (CreateResponse)await client.ExecuteAsync(new CreateRequest { Target = row }, cancellationToken);
        return response.id;
    }

    private async Task<Entity?> ReadDefinitionAsync(Guid definitionId, CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveMultipleAsync(DefinitionsById([definitionId]), cancellationToken);
        return rows.Entities.FirstOrDefault();
    }

    private async Task<IReadOnlyList<DependencyDto>> DependenciesAsync(
        int componentType,
        Guid objectId,
        CancellationToken cancellationToken)
    {
        var response = (RetrieveDependenciesForDeleteResponse)await client.ExecuteAsync(
            new RetrieveDependenciesForDeleteRequest { ComponentType = componentType, ObjectId = objectId },
            cancellationToken);
        return (response.EntityCollection?.Entities.ToList() ?? [])
            .Select(row => new DependencyDto(
                OptionValue(row, "dependentcomponenttype") ?? 0,
                (row.GetAttributeValue<Guid?>("dependentcomponentobjectid") ?? Guid.Empty).ToString("D")))
            .ToList();
    }

    private async Task<Dictionary<Guid, List<string>>> ManagedSolutionsAsync(
        IReadOnlyList<Guid> valueIds,
        CancellationToken cancellationToken)
    {
        var names = new Dictionary<Guid, List<string>>();
        foreach (var batch in valueIds.Chunk(InBatchSize))
        {
            var rows = await client.RetrieveMultipleAsync(ManagedValueSolutions(batch), cancellationToken);
            foreach (var row in rows.Entities)
            {
                var objectId = row.GetAttributeValue<Guid?>("objectid");
                if (objectId is null) continue;
                var name = Aliased(row, "sol.friendlyname") ?? Aliased(row, "sol.uniquename");
                if (string.IsNullOrEmpty(name)) continue;
                if (!names.TryGetValue(objectId.Value, out var list)) names[objectId.Value] = list = [];
                if (!list.Contains(name)) list.Add(name);
            }
        }
        return names;
    }

    private async Task<List<Entity>> ReadAllAsync(
        Func<int, string?, QueryExpression> build,
        CancellationToken cancellationToken)
    {
        var rows = new List<Entity>();
        var page = 1;
        string? cookie = null;
        while (true)
        {
            var result = await client.RetrieveMultipleAsync(build(page, cookie), cancellationToken);
            rows.AddRange(result.Entities);
            if (!result.MoreRecords) return rows;
            page++;
            cookie = result.PagingCookie;
        }
    }

    internal static EnvironmentVariableDto ToDto(
        Entity definition,
        IReadOnlyList<Entity> values,
        IReadOnlyDictionary<Guid, List<string>> managedSolutions)
    {
        var type = OptionValue(definition, "type") ?? (int)EnvironmentVariableType.String;
        var single = values.Count == 1 ? values[0] : null;
        IReadOnlyList<ValueRowDto> conflicts = values.Count > 1
            ? values.Select(row => new ValueRowDto(row.Id.ToString("D"), row.GetAttributeValue<string>("value"), Bool(row, "ismanaged"))).ToList()
            : [];
        var solutions = values
            .SelectMany(row => managedSolutions.GetValueOrDefault(row.Id) ?? [])
            .Distinct()
            .ToList();

        return new EnvironmentVariableDto(
            definition.Id.ToString("D"),
            definition.GetAttributeValue<string>("schemaname") ?? "",
            definition.GetAttributeValue<string>("displayname"),
            definition.GetAttributeValue<string>("description"),
            type,
            EnvironmentVariablesRules.TypeLabel(type),
            definition.GetAttributeValue<string>("defaultvalue"),
            single?.Id.ToString("D"),
            single?.GetAttributeValue<string>("value"),
            OptionValue(definition, "secretstore"),
            Bool(definition, "ismanaged"),
            IsCustomizable(definition),
            (OptionValue(definition, "statecode") ?? 0) == 0,
            values.Any(row => Bool(row, "ismanaged")),
            solutions,
            conflicts);
    }

    private static string? ReadOnlyReason(Entity definition) =>
        OptionValue(definition, "type") == (int)EnvironmentVariableType.Secret
            && OptionValue(definition, "secretstore") == SecretStore.Dataverse
            ? "Secrets stored in Dataverse are read-only here. Azure Key Vault is the supported secret store."
            : null;

    private static SolutionDto ToSolution(Entity row) => new(
        row.GetAttributeValue<string>("uniquename") ?? "",
        row.GetAttributeValue<string>("friendlyname") ?? row.GetAttributeValue<string>("uniquename") ?? "",
        Aliased(row, "pub.customizationprefix") ?? "");

    private static Guid? DefinitionOf(Entity value) =>
        value.GetAttributeValue<EntityReference>(DefinitionId)?.Id;

    private static int? OptionValue(Entity row, string attribute) =>
        row.Attributes.TryGetValue(attribute, out var raw) ? raw switch
        {
            OptionSetValue option => option.Value,
            int number => number,
            AliasedValue { Value: OptionSetValue option } => option.Value,
            _ => null,
        } : null;

    private static bool Bool(Entity row, string attribute) =>
        row.Attributes.TryGetValue(attribute, out var raw) && raw is true;

    private static bool IsCustomizable(Entity definition) =>
        !definition.Attributes.TryGetValue("iscustomizable", out var raw) || raw switch
        {
            BooleanManagedProperty property => property.Value,
            bool value => value,
            _ => true,
        };

    private static string? Aliased(Entity row, string alias) =>
        row.Attributes.TryGetValue(alias, out var raw) && raw is AliasedValue { Value: var value }
            ? value?.ToString()
            : null;

    private static string? Prefixed(string field, string? error) => error is null ? null : $"{field}: {error}";

    private static EnvironmentVariablesResult<T> Fail<T>(EnvironmentVariablesProblem problem) =>
        EnvironmentVariablesResult<T>.Fail(problem);
}
