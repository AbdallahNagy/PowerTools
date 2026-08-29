using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

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
            assemblies.Select(MapAssembly).ToArray(),
            types.Select(MapType).ToArray(),
            steps.Select(MapStep).ToArray(),
            images.Select(MapImage).ToArray());
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
            Number(entity, "versionnumber"));

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
            secureConfigExists);
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
            Number(entity, "versionnumber"));

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
