using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class UnregisterService(IPluginRegistrationGateway gateway)
{
    public async Task<MutationResultDto> UnregisterImageAsync(Guid id, CancellationToken ct)
    {
        var image = await RequireAsync(
            "sdkmessageprocessingstepimage",
            id,
            "image_not_found",
            "The step image was not found.",
            ct);
        EnsureWritable(image, "image_read_only", "Managed or system images cannot be unregistered.");
        await gateway.DeleteAsync("sdkmessageprocessingstepimage", id, ct);
        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> UnregisterStepAsync(Guid id, CancellationToken ct)
    {
        var step = await RequireAsync(
            "sdkmessageprocessingstep",
            id,
            "step_not_found",
            "The plug-in step was not found.",
            ct,
            "sdkmessageprocessingstepsecureconfigid");
        EnsureWritable(step, "step_read_only", "Managed or system steps cannot be unregistered.");

        var images = Matching(
            await gateway.RetrieveAllAsync(CatalogQueries.ImagesForStep(id), ct),
            "sdkmessageprocessingstepid",
            id);
        var requests = new OrganizationRequestCollection();
        foreach (var image in images)
        {
            requests.Add(new DeleteRequest
            {
                Target = new EntityReference("sdkmessageprocessingstepimage", image.Id),
            });
        }

        requests.Add(new DeleteRequest
        {
            Target = new EntityReference("sdkmessageprocessingstep", id),
        });

        var secure = step.GetAttributeValue<EntityReference>("sdkmessageprocessingstepsecureconfigid");
        if (secure is not null)
        {
            requests.Add(new DeleteRequest
            {
                Target = new EntityReference("sdkmessageprocessingstepsecureconfig", secure.Id),
            });
        }

        await gateway.ExecuteAsync(
            new ExecuteTransactionRequest
            {
                Requests = requests,
                ReturnResponses = false,
            },
            ct);
        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> UnregisterTypeAsync(Guid id, CancellationToken ct)
    {
        var type = await RequireAsync(
            "plugintype",
            id,
            "type_not_found",
            "The plug-in type was not found.",
            ct);
        EnsureWritable(type, "type_read_only", "Managed or system types cannot be unregistered.");

        var steps = Matching(
            await gateway.RetrieveAllAsync(CatalogQueries.StepsForType(id), ct),
            "plugintypeid",
            id);
        if (steps.Count > 0)
        {
            throw RegistrationException.Conflict(
                "has_steps",
                "Unregister the plug-in steps that use this type before unregistering the type.");
        }

        await EnsureNoDependenciesAsync(
            RegistrationOptionValues.ComponentTypePluginType,
            id,
            ignoreComponentTypes: [RegistrationOptionValues.ComponentTypeSdkMessageProcessingStep],
            ct);

        await gateway.DeleteAsync("plugintype", id, ct);
        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> UnregisterAssemblyAsync(Guid id, CancellationToken ct)
    {
        var assembly = await RequireAsync(
            "pluginassembly",
            id,
            "assembly_not_found",
            "The plug-in assembly was not found.",
            ct);
        EnsureWritable(
            assembly,
            "assembly_read_only",
            "Managed or system assemblies cannot be unregistered.");

        var types = Matching(
            await gateway.RetrieveAllAsync(CatalogQueries.TypesForAssembly(id), ct),
            "pluginassemblyid",
            id);
        foreach (var type in types)
        {
            var steps = Matching(
                await gateway.RetrieveAllAsync(CatalogQueries.StepsForType(type.Id), ct),
                "plugintypeid",
                type.Id);
            if (steps.Count > 0)
            {
                throw RegistrationException.Conflict(
                    "has_steps",
                    "Unregister the plug-in steps that use this assembly before unregistering the assembly.");
            }
        }

        await EnsureNoDependenciesAsync(
            RegistrationOptionValues.ComponentTypePluginAssembly,
            id,
            ignoreComponentTypes: [RegistrationOptionValues.ComponentTypePluginType],
            ct);

        var requests = new OrganizationRequestCollection();
        foreach (var type in types)
        {
            requests.Add(new DeleteRequest
            {
                Target = new EntityReference("plugintype", type.Id),
            });
        }

        requests.Add(new DeleteRequest
        {
            Target = new EntityReference("pluginassembly", id),
        });

        await gateway.ExecuteAsync(
            new ExecuteTransactionRequest
            {
                Requests = requests,
                ReturnResponses = false,
            },
            ct);
        return new MutationResultDto(id);
    }

    private async Task EnsureNoDependenciesAsync(
        int componentType,
        Guid objectId,
        IReadOnlyList<int> ignoreComponentTypes,
        CancellationToken ct)
    {
        var response = await gateway.ExecuteAsync(
            new RetrieveDependenciesForDeleteRequest
            {
                ComponentType = componentType,
                ObjectId = objectId,
            },
            ct);

        var dependents = GetDependents(response)
            .Select(MapDependent)
            .Where(item => item is not null && !ignoreComponentTypes.Contains(item.Value.Type))
            .Select(item => item!.Value)
            .ToList();
        if (dependents.Count == 0)
            return;

        throw RegistrationException.Conflict(
            "has_dependencies",
            "Other Dataverse components still depend on this registration.",
            dependents.Select(item => new RegistrationProblem(
                "assembly",
                "has_dependencies",
                $"Component type {item.Type} ({item.Id})")).ToList());
    }

    private async Task<Entity> RequireAsync(
        string entityName,
        Guid id,
        string notFoundCode,
        string notFoundMessage,
        CancellationToken ct,
        params string[] extraColumns)
    {
        var columns = extraColumns.Concat(["customizationlevel", "ismanaged"]).Distinct().ToArray();
        var entity = await gateway.RetrieveAsync(entityName, id, new ColumnSet(columns), ct);
        if (entity is null)
            throw RegistrationException.NotFound(notFoundCode, notFoundMessage);
        return entity;
    }

    private static void EnsureWritable(Entity entity, string code, string message)
    {
        if (entity.GetAttributeValue<bool>("ismanaged")
            || entity.GetAttributeValue<int>("customizationlevel") == 0)
        {
            throw RegistrationException.Conflict(code, message);
        }
    }

    private static List<Entity> Matching(
        IReadOnlyList<Entity> rows,
        string lookup,
        Guid id) =>
        rows.Where(row => row.GetAttributeValue<EntityReference>(lookup)?.Id == id).ToList();

    private static IEnumerable<Entity> GetDependents(OrganizationResponse response)
    {
        if (response is RetrieveDependenciesForDeleteResponse typed
            && typed.EntityCollection is not null)
        {
            return typed.EntityCollection.Entities;
        }

        if (response.Results.TryGetValue("EntityCollection", out var raw)
            && raw is EntityCollection collection)
        {
            return collection.Entities;
        }

        return [];
    }

    private static (int Type, Guid Id)? MapDependent(Entity entity)
    {
        var type = entity.GetAttributeValue<OptionSetValue>("dependentcomponenttype")?.Value
            ?? entity.GetAttributeValue<int>("dependentcomponenttype");
        var id = entity.GetAttributeValue<Guid>("dependentcomponentobjectid");
        if (id == Guid.Empty
            && entity.GetAttributeValue<EntityReference>("dependentcomponentobjectid") is EntityReference reference)
        {
            id = reference.Id;
        }

        if (type == 0 && id == Guid.Empty)
            return null;
        return (type, id);
    }
}
