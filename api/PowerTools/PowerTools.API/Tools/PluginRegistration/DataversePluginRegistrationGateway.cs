using System.Security.Cryptography;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class DataversePluginRegistrationGatewayFactory
    : IPluginRegistrationGatewayFactory
{
    public IPluginRegistrationGateway Create(IOrganizationServiceAsync2 service) =>
        new DataversePluginRegistrationGateway(service);
}

public sealed class DataversePluginRegistrationGateway(
    IOrganizationServiceAsync2 service) : IPluginRegistrationGateway
{
    public async Task<StepOptionsDto> RetrieveStepOptionsAsync(CancellationToken cancellationToken)
    {
        var messages = await RetrieveAllPagesAsync(new QueryExpression("sdkmessage")
        {
            ColumnSet = new ColumnSet("sdkmessageid", "name"),
            Criteria = new FilterExpression(LogicalOperator.And)
            {
                Conditions = { new("isprivate", ConditionOperator.Equal, false) }
            }
        }, cancellationToken);
        var filters = await RetrieveAllPagesAsync(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid", "sdkmessageid", "primaryobjecttypecode", "secondaryobjecttypecode")
        }, cancellationToken);
        var users = await RetrieveAllPagesAsync(new QueryExpression("systemuser")
        {
            ColumnSet = new ColumnSet("systemuserid", "fullname"),
            Criteria = new FilterExpression(LogicalOperator.And)
            {
                Conditions = { new("isdisabled", ConditionOperator.Equal, false), new("accessmode", ConditionOperator.NotEqual, 3) }
            }
        }, cancellationToken);
        var primaryIds = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var availableAttributes = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var logicalName in filters.Select(row => Text(row, "primaryobjecttypecode"))
            .Where(value => value.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var response = (RetrieveEntityResponse)await service.ExecuteAsync(new RetrieveEntityRequest
            {
                LogicalName = logicalName,
                EntityFilters = EntityFilters.Entity | EntityFilters.Attributes,
                RetrieveAsIfPublished = true
            }, cancellationToken);
            primaryIds[logicalName] = response.EntityMetadata.PrimaryIdAttribute;
            availableAttributes[logicalName] = response.EntityMetadata.Attributes
                .Select(attribute => attribute.LogicalName).Where(name => !string.IsNullOrWhiteSpace(name)).ToArray()!;
        }
        return new(
            messages.Select(row => new StepOptionDto(row.Id, Text(row, "name"))).OrderBy(row => row.Name).ToArray(),
            filters.Select(row => new StepMessageFilterOptionDto(row.Id, LookupId(row, "sdkmessageid") ?? Guid.Empty,
                Text(row, "primaryobjecttypecode"), NullableText(row, "secondaryobjecttypecode"),
                primaryIds.GetValueOrDefault(Text(row, "primaryobjecttypecode"), $"{Text(row, "primaryobjecttypecode")}id"),
                availableAttributes.GetValueOrDefault(Text(row, "primaryobjecttypecode"), []))).ToArray(),
            users.Select(row => new StepOptionDto(row.Id, Text(row, "fullname"))).OrderBy(row => row.Name).ToArray());
    }

    public async Task<PluginStepPreflightState> RetrieveStepPreflightStateAsync(Guid pluginTypeId,
        Guid? targetStepId, StepDraftDto draft, CancellationToken cancellationToken)
    {
        var options = await RetrieveStepOptionsAsync(cancellationToken);
        var message = options.Messages.SingleOrDefault(item => item.Id == draft.SdkMessageId);
        var filter = options.Filters.SingleOrDefault(item => item.Id == draft.SdkMessageFilterId
            && item.MessageId == draft.SdkMessageId);
        var userValid = !draft.ImpersonatingUserId.HasValue || options.EnabledUsers.Any(item => item.Id == draft.ImpersonatingUserId);
        var rows = await RetrieveCatalogRowsAsync(cancellationToken);
        var target = targetStepId is { } id ? rows.Steps.SingleOrDefault(item => item.Id == id) : null;
        var plugin = rows.Types.SingleOrDefault(item => item.Id == pluginTypeId);
        Entity? targetDetails = null;
        if (targetStepId is { } detailId)
            targetDetails = await service.RetrieveAsync("sdkmessageprocessingstep", detailId,
                new ColumnSet("sdkmessageid", "sdkmessagefilterid", "filteringattributes", "impersonatinguserid",
                    "configuration", "sdkmessageprocessingstepsecureconfigid"), cancellationToken);
        var secureConfigId = targetDetails is null ? null : LookupId(targetDetails, "sdkmessageprocessingstepsecureconfigid");
        long? secureConfigVersion = null;
        if (secureConfigId is { } secureId)
        {
            var secure = await service.RetrieveAsync("sdkmessageprocessingstepsecureconfig", secureId,
                new ColumnSet("versionnumber"), cancellationToken);
            secureConfigVersion = Number(secure, "versionnumber");
        }
        var duplicate = rows.Steps.Any(item => item.Id != targetStepId && item.PluginTypeId == pluginTypeId
            && string.Equals(item.MessageLabel, message?.Name, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.PrimaryTableLabel, filter?.PrimaryTable, StringComparison.OrdinalIgnoreCase)
            && item.Stage == draft.Stage && item.Mode == draft.Mode && item.Rank == draft.Rank);
        var dependencies = targetStepId is { } stepId
            ? await RetrieveDependenciesAsync(stepId, 92, cancellationToken)
            : [];
        return new(message?.Name ?? "", filter?.PrimaryTable ?? draft.PrimaryTable,
            filter?.PrimaryIdAttribute ?? $"{draft.PrimaryTable}id", message is not null, filter is not null,
            userValid, duplicate, target?.IsManaged ?? false, target?.IsCustomizable ?? true,
            targetDetails is not null && LookupId(targetDetails, "sdkmessageprocessingstepsecureconfigid").HasValue,
            target?.VersionNumber, pluginTypeId, targetStepId, target?.Name, dependencies,
            targetDetails is null ? null : LookupId(targetDetails, "sdkmessageid"),
            targetDetails is null ? null : LookupId(targetDetails, "sdkmessagefilterid"),
            targetDetails is null ? null : (NullableText(targetDetails, "filteringattributes") ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            targetDetails is null ? null : LookupId(targetDetails, "impersonatinguserid"),
            targetDetails is null ? null : NullableText(targetDetails, "configuration"),
            target?.Stage ?? draft.Stage, target?.Mode ?? draft.Mode, target?.Rank ?? draft.Rank,
            target?.IsEnabled ?? true)
        {
            SecondaryTable = filter?.SecondaryTable,
            AvailableAttributes = filter?.AvailableAttributes ?? [],
            IsOrdinaryPlugin = plugin is { IsWorkflowActivity: false },
            IsParentManaged = plugin?.IsManaged ?? false,
            IsParentCustomizable = plugin?.IsCustomizable ?? false,
            SecureConfigId = secureConfigId,
            SecureConfigVersion = secureConfigVersion
        };
    }

    public async Task<StepEditDetailsDto> RetrieveStepEditDetailsAsync(Guid stepId, CancellationToken cancellationToken)
    {
        var rows = await RetrieveCatalogRowsAsync(cancellationToken);
        var step = rows.Steps.Single(item => item.Id == stepId);
        var plugin = rows.Types.Single(item => item.Id == step.PluginTypeId);
        var details = await service.RetrieveAsync("sdkmessageprocessingstep", stepId,
            new ColumnSet("sdkmessageid", "sdkmessagefilterid", "filteringattributes", "impersonatinguserid",
                "configuration", "sdkmessageprocessingstepsecureconfigid"), cancellationToken);
        var options = await RetrieveStepOptionsAsync(cancellationToken);
        var filterId = LookupId(details, "sdkmessagefilterid") ?? Guid.Empty;
        var filter = options.Filters.Single(item => item.Id == filterId);
        return new(stepId, plugin.Id, LookupId(details, "sdkmessageid") ?? Guid.Empty, filterId,
            filter.PrimaryTable, filter.SecondaryTable, step.Stage, step.Mode, step.Rank,
            (NullableText(details, "filteringattributes") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            LookupId(details, "impersonatinguserid"), NullableText(details, "configuration"),
            LookupId(details, "sdkmessageprocessingstepsecureconfigid").HasValue,
            new Dictionary<Guid, long> { [plugin.Id] = plugin.VersionNumber, [step.Id] = step.VersionNumber });
    }

    public async Task<Guid> MutateStepAsync(PluginStepMutationCommand command,
        CancellationToken cancellationToken)
    {
        var operation = command.Operation;
        var targetStepId = command.TargetStepId;
        var draft = command.Draft;
        var parent = await service.RetrieveAsync("plugintype", draft.PluginTypeId, new ColumnSet("versionnumber"), cancellationToken);
        if (Number(parent, "versionnumber") != command.ExpectedPluginVersion)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        var stepId = targetStepId ?? Guid.NewGuid();
        var requests = new OrganizationRequestCollection();
        if (operation == "unregister")
        {
            requests.Add(new DeleteRequest { Target = new EntityReference("sdkmessageprocessingstep", stepId)
                { RowVersion = command.ExpectedStepVersion?.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
        }
        else
        {
            var entity = new Entity("sdkmessageprocessingstep", stepId)
            {
                ["plugintypeid"] = new EntityReference("plugintype", draft.PluginTypeId),
                ["sdkmessageid"] = new EntityReference("sdkmessage", draft.SdkMessageId),
                ["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", draft.SdkMessageFilterId),
                ["stage"] = new OptionSetValue(draft.Stage), ["mode"] = new OptionSetValue(draft.Mode),
                ["rank"] = draft.Rank, ["filteringattributes"] = string.Join(',', draft.FilteringAttributes)
            };
            if (command.ExpectedStepVersion is { } expectedStepVersion)
                entity.RowVersion = expectedStepVersion.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (draft.UnsecureConfigurationAction == "set") entity["configuration"] = draft.UnsecureConfiguration;
            else if (draft.UnsecureConfigurationAction == "clear") entity["configuration"] = null;
            if (draft.ImpersonatingUserAction == "set" && draft.ImpersonatingUserId is { } userId)
                entity["impersonatinguserid"] = new EntityReference("systemuser", userId);
            else if (draft.ImpersonatingUserAction == "clear") entity["impersonatinguserid"] = null;
            if (operation == "create")
            {
                entity["name"] = $"{draft.PrimaryTable} step";
                requests.Add(new CreateRequest { Target = entity });
            }
            else
            {
                if (operation is "enable" or "disable")
                {
                    entity.Attributes.Clear();
                    entity["statecode"] = new OptionSetValue(operation == "enable" ? 0 : 1);
                    entity["statuscode"] = new OptionSetValue(operation == "enable" ? 1 : 2);
                }
                requests.Add(new UpdateRequest { Target = entity, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
            }
            if (draft.ReplacementSecureConfiguration is not null)
            {
                var existingSecureId = command.ExpectedSecureConfigId;
                var secureId = existingSecureId ?? Guid.NewGuid();
                var secure = new Entity("sdkmessageprocessingstepsecureconfig", secureId)
                {
                    ["secureconfig"] = draft.ReplacementSecureConfiguration
                };
                if (command.ExpectedSecureConfigVersion is { } expectedSecureVersion)
                    secure.RowVersion = expectedSecureVersion.ToString(System.Globalization.CultureInfo.InvariantCulture);
                requests.Insert(0, existingSecureId.HasValue
                    ? new UpdateRequest { Target = secure, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches }
                    : new CreateRequest { Target = secure });
                entity["sdkmessageprocessingstepsecureconfigid"] = new EntityReference("sdkmessageprocessingstepsecureconfig", secureId);
            }
        }
        var transaction = new ExecuteTransactionRequest { Requests = requests, ReturnResponses = true };
        await service.ExecuteAsync(transaction, cancellationToken);
        return stepId;
    }

    private async Task<IReadOnlyList<ComponentDependencyDto>> RetrieveDependenciesAsync(Guid id, int componentType,
        CancellationToken cancellationToken)
    {
        var request = new OrganizationRequest("RetrieveDependenciesForDelete")
        {
            ["ComponentType"] = componentType,
            ["ObjectId"] = id
        };
        var response = await service.ExecuteAsync(request, cancellationToken);
        if (!response.Results.TryGetValue("EntityDependencies", out var value) || value is not EntityCollection collection)
            return [];
        return collection.Entities.Select(entity =>
        {
            var reference = entity.GetAttributeValue<EntityReference>("dependentcomponentobjectid");
            return new ComponentDependencyDto(reference?.Id ?? Guid.Empty, reference?.Name ?? "External component",
                reference?.LogicalName ?? "Solution component", null, false, true, 0);
        }).ToArray();
    }
    public async Task<PluginAssemblyImpactSnapshot> RetrieveAssemblyImpactSnapshotAsync(
        PluginAssemblyRow assembly,
        IReadOnlyList<PluginTypeRow> handlers,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var entity = await service.RetrieveAsync("pluginassembly", assembly.Id,
            new ColumnSet("content"), cancellationToken);
        var encoded = entity.GetAttributeValue<string>("content");
        if (string.IsNullOrWhiteSpace(encoded))
            return new PluginAssemblyImpactSnapshot([], [], false);

        byte[] content;
        try { content = Convert.FromBase64String(encoded); }
        catch (FormatException) { return new PluginAssemblyImpactSnapshot([], [], false); }

        try
        {
            var dependencies = new List<PluginHandlerDependencyRow>();
            foreach (var handler in handlers)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var request = new OrganizationRequest("RetrieveDependenciesForDelete")
                {
                    ["ComponentType"] = 90,
                    ["ObjectId"] = handler.Id
                };
                var response = await service.ExecuteAsync(request, cancellationToken);
                if (response.Results.TryGetValue("EntityDependencies", out var value)
                    && value is EntityCollection collection)
                {
                    dependencies.AddRange(collection.Entities.Select(dependency => MapDependency(handler.Id, dependency)));
                }
            }
            return new PluginAssemblyImpactSnapshot(content, dependencies, true);
        }
        catch
        {
            CryptographicOperations.ZeroMemory(content);
            throw;
        }
    }
    public async Task<Guid> RegisterAssemblyAsync(
        PluginAssemblyMutationCommand command,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var entity = CreateAssemblyEntity(command);
        return await service.CreateAsync(entity, cancellationToken);
    }

    public async Task<Guid> UpdateAssemblyAsync(
        PluginAssemblyMutationCommand command,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        if (command.AssemblyId is not { } id || id == Guid.Empty)
            throw new ArgumentException("An assembly id is required for update.", nameof(command));
        var entity = CreateAssemblyEntity(command);
        entity.Id = id;
        await service.UpdateAsync(entity, cancellationToken);
        return id;
    }

    public async Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(
        CancellationToken cancellationToken)
    {
        var assemblies = await RetrieveAllPagesAsync(
            PluginRegistrationCatalogQueries.CreateAssemblyQuery(),
            cancellationToken);
        var types = await RetrieveAllPagesAsync(
            PluginRegistrationCatalogQueries.CreateTypeQuery(),
            cancellationToken);
        var steps = await RetrieveAllPagesAsync(
            PluginRegistrationCatalogQueries.CreateStepQuery(),
            cancellationToken);
        var images = await RetrieveAllPagesAsync(
            PluginRegistrationCatalogQueries.CreateImageQuery(),
            cancellationToken);

        return new PluginRegistrationRows(
            MapDistinct(assemblies, MapAssembly, (row, solution) => row with
            {
                SolutionDisplayName = solution
            }),
            MapDistinct(types, MapType, (row, solution) => row with
            {
                SolutionDisplayName = solution
            }),
            MapDistinct(steps, MapStep, (row, solution) => row with
            {
                SolutionDisplayName = solution
            }),
            MapDistinct(images, MapImage, (row, solution) => row with
            {
                SolutionDisplayName = solution
            }));
    }

    private async Task<IReadOnlyList<Entity>> RetrieveAllPagesAsync(
        QueryExpression query,
        CancellationToken cancellationToken)
    {
        var entities = new List<Entity>();
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var page = await service.RetrieveMultipleAsync(query, cancellationToken);
            entities.AddRange(page.Entities);
            if (!page.MoreRecords)
            {
                return entities;
            }

            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }
    }

    private static Entity CreateAssemblyEntity(PluginAssemblyMutationCommand command)
    {
        var identity = command.Inspection.Identity;
        return new Entity("pluginassembly")
        {
            ["name"] = identity.Name,
            ["version"] = identity.Version,
            ["culture"] = identity.Culture,
            ["publickeytoken"] = identity.PublicKeyToken,
            ["sourcetype"] = new OptionSetValue(command.SourceType),
            ["isolationmode"] = new OptionSetValue(command.IsolationMode),
            ["content"] = Convert.ToBase64String(command.Content)
        };
    }

    private static PluginHandlerDependencyRow MapDependency(Guid handlerId, Entity dependency)
    {
        var type = dependency.GetAttributeValue<OptionSetValue>("dependentcomponenttype")?.Value ?? 0;
        var reference = dependency.GetAttributeValue<EntityReference>("dependentcomponentobjectid");
        var id = reference?.Id ?? dependency.GetAttributeValue<Guid?>("dependentcomponentobjectid") ?? Guid.Empty;
        var isCustomApi = reference?.LogicalName is "customapi"
            or "customapirequestparameter"
            or "customapiresponseproperty";
        var label = isCustomApi ? "Custom API" : $"Component type {type}";
        var name = reference?.Name ?? (id == Guid.Empty ? "Unknown component" : id.ToString("D"));
        return new PluginHandlerDependencyRow(handlerId, name, label, isCustomApi, id != Guid.Empty);
    }

    private static PluginAssemblyRow MapAssembly(Entity entity) =>
        new(
            entity.Id,
            Text(entity, "name"),
            Text(entity, "version"),
            NullableText(entity, "culture"),
            NullableText(entity, "publickeytoken"),
            Option(entity, "sourcetype"),
            Option(entity, "isolationmode"),
            entity.GetAttributeValue<bool>("ismanaged"),
            ManagedBoolean(entity, "iscustomizable"),
            Number(entity, "versionnumber"),
            null,
            NullableText(entity, "description"));

    private static PluginTypeRow MapType(Entity entity) =>
        new(
            entity.Id,
            LookupId(entity, "pluginassemblyid"),
            Text(entity, "typename"),
            Text(entity, "name"),
            NullableText(entity, "friendlyname"),
            NullableText(entity, "description"),
            NullableText(entity, "workflowactivitygroupname"),
            entity.GetAttributeValue<bool>("isworkflowactivity"),
            entity.GetAttributeValue<bool>("ismanaged"),
            ManagedBoolean(entity, "iscustomizable"),
            Number(entity, "versionnumber"),
            null);

    private static PluginStepRow MapStep(Entity entity)
    {
        var secureConfigExists = LookupId(
            entity,
            "sdkmessageprocessingstepsecureconfigid").HasValue;
        var messageLabel = AliasedText(entity, "message.name")
            ?? LookupName(entity, "sdkmessageid")
            ?? "";

        return new PluginStepRow(
            entity.Id,
            LookupId(entity, "plugintypeid"),
            Text(entity, "name"),
            NullableText(entity, "description"),
            messageLabel,
            AliasedText(entity, "filter.primaryobjecttypecode"),
            AliasedText(entity, "filter.secondaryobjecttypecode"),
            FormattedOrOption(entity, "stage"),
            FormattedOrOption(entity, "mode"),
            Option(entity, "stage"),
            Option(entity, "mode"),
            entity.GetAttributeValue<int?>("rank") ?? 0,
            Option(entity, "statecode") == 0,
            entity.GetAttributeValue<bool>("ismanaged"),
            ManagedBoolean(entity, "iscustomizable"),
            Number(entity, "versionnumber"),
            secureConfigExists,
            null);
    }

    private static PluginImageRow MapImage(Entity entity) =>
        new(
            entity.Id,
            LookupId(entity, "sdkmessageprocessingstepid"),
            Text(entity, "name"),
            NullableText(entity, "description"),
            FormattedOrOption(entity, "imagetype"),
            NullableText(entity, "entityalias"),
            (NullableText(entity, "attributes") ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            entity.GetAttributeValue<bool>("ismanaged"),
            ManagedBoolean(entity, "iscustomizable"),
            Number(entity, "versionnumber"),
            null);

    private static IReadOnlyList<TRow> MapDistinct<TRow>(
        IReadOnlyList<Entity> entities,
        Func<Entity, TRow> map,
        Func<TRow, string?, TRow> withSolutionDisplay)
        where TRow : class
    {
        return entities
            .GroupBy(entity => entity.Id)
            .Select(group => withSolutionDisplay(
                map(group.First()),
                SolutionDisplay(group)))
            .ToArray();
    }

    private static string? SolutionDisplay(IEnumerable<Entity> entities)
    {
        var names = entities
            .Select(entity => AliasedText(entity, "solution.friendlyname"))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!)
            .GroupBy(name => name, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderBy(name => name, StringComparer.Ordinal).First())
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(name => name, StringComparer.Ordinal)
            .ToArray();
        return names.Length == 0 ? null : string.Join(", ", names);
    }

    private static string Text(Entity entity, string attribute) =>
        entity.GetAttributeValue<string>(attribute) ?? "";

    private static string? NullableText(Entity entity, string attribute) =>
        entity.GetAttributeValue<string>(attribute);

    private static Guid? LookupId(Entity entity, string attribute) =>
        entity.GetAttributeValue<EntityReference>(attribute)?.Id;

    private static string? LookupName(Entity entity, string attribute) =>
        entity.GetAttributeValue<EntityReference>(attribute)?.Name;

    private static int Option(Entity entity, string attribute) =>
        entity.GetAttributeValue<OptionSetValue>(attribute)?.Value ?? 0;

    private static long Number(Entity entity, string attribute) =>
        entity.GetAttributeValue<long?>(attribute) ?? 0;

    private static bool ManagedBoolean(Entity entity, string attribute) =>
        entity.GetAttributeValue<BooleanManagedProperty>(attribute)?.Value
        ?? entity.GetAttributeValue<bool?>(attribute)
        ?? false;

    private static string FormattedOrOption(Entity entity, string attribute) =>
        entity.FormattedValues.TryGetValue(attribute, out var value)
            ? value
            : Option(entity, attribute).ToString();

    private static string? AliasedText(Entity entity, string attribute) =>
        entity.GetAttributeValue<AliasedValue>(attribute)?.Value as string;
}
