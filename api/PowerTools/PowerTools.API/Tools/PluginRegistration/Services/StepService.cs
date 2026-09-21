using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class StepService(IPluginRegistrationGateway gateway)
{
    public async Task<MutationResultDto> CreateAsync(StepDraftDto draft, CancellationToken ct)
    {
        var messageName = await RequireMessageNameAsync(draft.MessageId, ct);
        string? primaryEntity = null;
        if (string.IsNullOrWhiteSpace(draft.Name) && draft.FilterId is Guid filterId)
            primaryEntity = await TryGetPrimaryEntityAsync(filterId, ct);
        draft = StepDraftValidator.ApplyCreateName(draft, messageName, primaryEntity);
        var problems = StepDraftValidator.Validate(draft, messageName, isUpdate: false);
        if (problems.Count > 0)
            throw RegistrationException.Validation(problems);

        Guid? secureId = null;
        if (draft.SecureConfigurationAction == "replace")
        {
            secureId = await gateway.CreateAsync(
                new Entity("sdkmessageprocessingstepsecureconfig")
                {
                    ["secureconfig"] = draft.SecureConfiguration,
                },
                ct);
        }

        try
        {
            var id = await gateway.CreateAsync(
                BuildStepEntity(draft, id: null, isUpdate: false, secureId),
                ct);
            return new MutationResultDto(id);
        }
        catch
        {
            if (secureId is Guid createdSecureId)
            {
                try
                {
                    await gateway.DeleteAsync(
                        "sdkmessageprocessingstepsecureconfig",
                        createdSecureId,
                        ct);
                }
                catch
                {
                    // Best-effort orphan cleanup.
                }
            }

            throw;
        }
    }

    public async Task<MutationResultDto> UpdateAsync(
        Guid id,
        StepDraftDto draft,
        CancellationToken ct)
    {
        var existing = await RequireStepAsync(id, ct);
        EnsureWritable(existing);

        var messageName = await RequireMessageNameAsync(draft.MessageId, ct);
        var problems = StepDraftValidator.Validate(draft, messageName, isUpdate: true);
        if (problems.Count > 0)
            throw RegistrationException.Validation(problems);

        var existingSecure = existing.GetAttributeValue<EntityReference>(
            "sdkmessageprocessingstepsecureconfigid");
        Guid? secureId = existingSecure?.Id;

        if (draft.SecureConfigurationAction == "replace")
        {
            if (secureId is Guid existingId)
            {
                await gateway.UpdateAsync(
                    new Entity("sdkmessageprocessingstepsecureconfig", existingId)
                    {
                        ["secureconfig"] = draft.SecureConfiguration,
                    },
                    ct);
            }
            else
            {
                secureId = await gateway.CreateAsync(
                    new Entity("sdkmessageprocessingstepsecureconfig")
                    {
                        ["secureconfig"] = draft.SecureConfiguration,
                    },
                    ct);
            }
        }

        var entity = BuildStepEntity(draft, id, isUpdate: true, secureId);
        if (draft.SecureConfigurationAction == "clear")
            entity["sdkmessageprocessingstepsecureconfigid"] = null;

        await gateway.UpdateAsync(entity, ct);

        if (draft.SecureConfigurationAction == "clear" && existingSecure is not null)
        {
            await gateway.DeleteAsync(
                "sdkmessageprocessingstepsecureconfig",
                existingSecure.Id,
                ct);
        }

        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> SetEnabledAsync(
        Guid id,
        bool enabled,
        CancellationToken ct)
    {
        var existing = await RequireStepAsync(id, ct);
        EnsureWritable(existing);
        await gateway.UpdateAsync(
            new Entity("sdkmessageprocessingstep", id)
            {
                ["statecode"] = new OptionSetValue(
                    enabled
                        ? RegistrationOptionValues.StateEnabled
                        : RegistrationOptionValues.StateDisabled),
                ["statuscode"] = new OptionSetValue(
                    enabled
                        ? RegistrationOptionValues.StatusEnabled
                        : RegistrationOptionValues.StatusDisabled),
            },
            ct);
        return new MutationResultDto(id);
    }

    private async Task<string> RequireMessageNameAsync(Guid messageId, CancellationToken ct)
    {
        var message = await gateway.RetrieveAsync(
            "sdkmessage",
            messageId,
            new ColumnSet("name"),
            ct);
        if (message is null)
            throw RegistrationException.NotFound("message_not_found", "The selected message was not found.");
        return message.GetAttributeValue<string>("name") ?? string.Empty;
    }

    private async Task<string?> TryGetPrimaryEntityAsync(Guid filterId, CancellationToken ct)
    {
        var filter = await gateway.RetrieveAsync(
            "sdkmessagefilter",
            filterId,
            new ColumnSet("primaryobjecttypecode"),
            ct);
        return filter?.GetAttributeValue<string>("primaryobjecttypecode");
    }

    private async Task<Entity> RequireStepAsync(Guid id, CancellationToken ct)
    {
        var step = await gateway.RetrieveAsync(
            "sdkmessageprocessingstep",
            id,
            new ColumnSet(
                "sdkmessageprocessingstepsecureconfigid",
                "customizationlevel",
                "ismanaged"),
            ct);
        if (step is null)
            throw RegistrationException.NotFound("step_not_found", "The plug-in step was not found.");
        return step;
    }

    private static void EnsureWritable(Entity step)
    {
        if (step.GetAttributeValue<bool>("ismanaged")
            || step.GetAttributeValue<int>("customizationlevel") == 0)
        {
            throw RegistrationException.Conflict(
                "step_read_only",
                "Managed or system steps cannot be changed.");
        }
    }

    private static Entity BuildStepEntity(
        StepDraftDto draft,
        Guid? id,
        bool isUpdate,
        Guid? secureId)
    {
        var entity = id is Guid stepId
            ? new Entity("sdkmessageprocessingstep", stepId)
            : new Entity("sdkmessageprocessingstep");

        entity["name"] = draft.Name.Trim();
        entity["plugintypeid"] = new EntityReference("plugintype", draft.PluginTypeId);
        entity["sdkmessageid"] = new EntityReference("sdkmessage", draft.MessageId);
        entity["stage"] = new OptionSetValue(draft.Stage);
        entity["mode"] = new OptionSetValue(draft.Mode);
        entity["rank"] = draft.Rank;
        entity["supporteddeployment"] = new OptionSetValue(draft.SupportedDeployment);
        entity["asyncautodelete"] = draft.AsyncAutoDelete;
        entity["description"] = draft.Description;
        entity["configuration"] = draft.Configuration;

        if (draft.FilterId is Guid filterId)
            entity["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", filterId);
        else if (isUpdate)
            entity["sdkmessagefilterid"] = null;

        if (draft.FilteringAttributes is { Count: > 0 })
            entity["filteringattributes"] = string.Join(',', draft.FilteringAttributes);
        else if (isUpdate)
            entity["filteringattributes"] = "";

        if (draft.ImpersonatingUserId is Guid userId)
            entity["impersonatinguserid"] = new EntityReference("systemuser", userId);
        else if (isUpdate)
            entity["impersonatinguserid"] = null;

        if (secureId is Guid configId)
            entity["sdkmessageprocessingstepsecureconfigid"] =
                new EntityReference("sdkmessageprocessingstepsecureconfig", configId);

        return entity;
    }
}
