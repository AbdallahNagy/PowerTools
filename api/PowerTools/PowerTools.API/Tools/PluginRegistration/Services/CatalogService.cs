using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class CatalogService(IPluginRegistrationGateway gateway)
{
    public async Task<CatalogDto> GetAsync(CancellationToken ct)
    {
        var assembliesTask = gateway.RetrieveAllAsync(CatalogQueries.Assemblies(), ct);
        var typesTask = gateway.RetrieveAllAsync(CatalogQueries.Types(), ct);
        var stepsTask = gateway.RetrieveAllAsync(CatalogQueries.Steps(), ct);
        var imagesTask = gateway.RetrieveAllAsync(CatalogQueries.Images(), ct);
        await Task.WhenAll(assembliesTask, typesTask, stepsTask, imagesTask);

        return new CatalogDto(
            assembliesTask.Result.Select(MapAssembly).ToList(),
            typesTask.Result.Select(MapType).ToList(),
            stepsTask.Result.Select(MapStep).ToList(),
            imagesTask.Result.Select(MapImage).ToList());
    }

    private static AssemblyDto MapAssembly(Entity entity) => new(
        entity.Id,
        entity.GetAttributeValue<string>("name") ?? string.Empty,
        entity.GetAttributeValue<string>("version"),
        entity.GetAttributeValue<string>("publickeytoken"),
        entity.GetAttributeValue<string>("culture"),
        GetOption(entity, "isolationmode"),
        GetOption(entity, "sourcetype"),
        entity.GetAttributeValue<bool>("ismanaged"),
        IsSystem(entity),
        entity.GetAttributeValue<DateTime?>("modifiedon"),
        entity.GetAttributeValue<string>("description"));

    private static PluginTypeDto MapType(Entity entity) => new(
        entity.Id,
        GetLookupId(entity, "pluginassemblyid") ?? Guid.Empty,
        entity.GetAttributeValue<string>("typename") ?? string.Empty,
        entity.GetAttributeValue<string>("name"),
        entity.GetAttributeValue<string>("friendlyname"),
        entity.GetAttributeValue<bool>("isworkflowactivity"),
        entity.GetAttributeValue<string>("workflowactivitygroupname"),
        entity.GetAttributeValue<string>("description"),
        entity.GetAttributeValue<bool>("ismanaged"),
        IsSystem(entity));

    private static StepDto MapStep(Entity entity)
    {
        var messageRef = entity.GetAttributeValue<EntityReference>("sdkmessageid");
        var filterRef = entity.GetAttributeValue<EntityReference>("sdkmessagefilterid");
        var userRef = entity.GetAttributeValue<EntityReference>("impersonatinguserid");
        return new StepDto(
            entity.Id,
            entity.GetAttributeValue<string>("name") ?? string.Empty,
            GetLookupId(entity, "plugintypeid") ?? Guid.Empty,
            messageRef?.Id ?? Guid.Empty,
            GetAliasedString(entity, "sdkmessage", "name") ?? string.Empty,
            filterRef?.Id,
            GetAliasedString(entity, "sdkmessagefilter", "primaryobjecttypecode"),
            GetAliasedString(entity, "sdkmessagefilter", "secondaryobjecttypecode"),
            GetOption(entity, "stage"),
            GetOption(entity, "mode"),
            entity.GetAttributeValue<int>("rank"),
            GetOption(entity, "statecode") == RegistrationOptionValues.StateEnabled,
            SplitCsv(entity.GetAttributeValue<string>("filteringattributes")),
            userRef?.Id,
            GetAliasedString(entity, "systemuser", "fullname"),
            entity.GetAttributeValue<string>("description"),
            entity.GetAttributeValue<string>("configuration"),
            entity.GetAttributeValue<EntityReference>("sdkmessageprocessingstepsecureconfigid") is not null,
            GetOption(entity, "supporteddeployment"),
            entity.GetAttributeValue<bool>("asyncautodelete"),
            entity.GetAttributeValue<bool>("ismanaged"),
            IsSystem(entity),
            entity.GetAttributeValue<DateTime?>("modifiedon"));
    }

    private static ImageDto MapImage(Entity entity) => new(
        entity.Id,
        GetLookupId(entity, "sdkmessageprocessingstepid") ?? Guid.Empty,
        entity.GetAttributeValue<string>("name") ?? string.Empty,
        entity.GetAttributeValue<string>("entityalias") ?? string.Empty,
        GetOption(entity, "imagetype"),
        SplitCsv(entity.GetAttributeValue<string>("attributes")),
        entity.GetAttributeValue<string>("messagepropertyname"),
        entity.GetAttributeValue<bool>("ismanaged"),
        IsSystem(entity));

    internal static bool IsSystem(Entity entity) =>
        entity.GetAttributeValue<int>("customizationlevel") == 0;

    internal static int GetOption(Entity entity, string attribute) =>
        entity.GetAttributeValue<OptionSetValue>(attribute)?.Value ?? 0;

    internal static Guid? GetLookupId(Entity entity, string attribute) =>
        entity.GetAttributeValue<EntityReference>(attribute)?.Id;

    internal static string? GetAliasedString(Entity entity, string alias, string attribute)
    {
        if (!entity.Attributes.TryGetValue($"{alias}.{attribute}", out var raw))
            return null;
        var value = raw is AliasedValue aliased ? aliased.Value : raw;
        return value?.ToString();
    }

    internal static IReadOnlyList<string> SplitCsv(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
