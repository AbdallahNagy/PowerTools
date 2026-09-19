using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class ImageService(IPluginRegistrationGateway gateway)
{
    public async Task<MutationResultDto> CreateAsync(ImageDraftDto draft, CancellationToken ct)
    {
        var (messageName, stage) = await RequireParentAsync(draft.StepId, ct);
        var problems = ImageDraftValidator.Validate(draft, messageName, stage, isUpdate: false);
        if (problems.Count > 0)
            throw RegistrationException.Validation(problems);

        var id = await gateway.CreateAsync(BuildEntity(draft, id: null, messageName), ct);
        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> UpdateAsync(
        Guid id,
        ImageDraftDto draft,
        CancellationToken ct)
    {
        var existing = await gateway.RetrieveAsync(
            "sdkmessageprocessingstepimage",
            id,
            new ColumnSet("customizationlevel", "ismanaged", "sdkmessageprocessingstepid"),
            ct);
        if (existing is null)
            throw RegistrationException.NotFound("image_not_found", "The step image was not found.");
        EnsureWritable(existing, "image_read_only", "Managed or system images cannot be changed.");

        var (messageName, stage) = await RequireParentAsync(draft.StepId, ct);
        var problems = ImageDraftValidator.Validate(draft, messageName, stage, isUpdate: true);
        if (problems.Count > 0)
            throw RegistrationException.Validation(problems);

        await gateway.UpdateAsync(BuildEntity(draft, id, messageName), ct);
        return new MutationResultDto(id);
    }

    private async Task<(string MessageName, int Stage)> RequireParentAsync(
        Guid stepId,
        CancellationToken ct)
    {
        var step = await gateway.RetrieveAsync(
            "sdkmessageprocessingstep",
            stepId,
            new ColumnSet("stage", "customizationlevel", "ismanaged", "sdkmessageid"),
            ct);
        if (step is null)
            throw RegistrationException.NotFound("step_not_found", "The parent step was not found.");
        EnsureWritable(step, "step_read_only", "Managed or system steps cannot be changed.");

        var messageId = step.GetAttributeValue<EntityReference>("sdkmessageid")?.Id
            ?? Guid.Empty;
        var message = messageId == Guid.Empty
            ? null
            : await gateway.RetrieveAsync("sdkmessage", messageId, new ColumnSet("name"), ct);
        var messageName = message?.GetAttributeValue<string>("name") ?? string.Empty;
        var stage = step.GetAttributeValue<OptionSetValue>("stage")?.Value ?? 0;
        return (messageName, stage);
    }

    private static void EnsureWritable(Entity entity, string code, string message)
    {
        if (entity.GetAttributeValue<bool>("ismanaged")
            || entity.GetAttributeValue<int>("customizationlevel") == 0)
            throw RegistrationException.Conflict(code, message);
    }

    private static Entity BuildEntity(ImageDraftDto draft, Guid? id, string messageName)
    {
        ImageMessageProperties.TryGet(messageName, out var propertyName);
        var entity = id is Guid imageId
            ? new Entity("sdkmessageprocessingstepimage", imageId)
            : new Entity("sdkmessageprocessingstepimage");
        entity["name"] = draft.Name.Trim();
        entity["entityalias"] = draft.EntityAlias.Trim();
        entity["imagetype"] = new OptionSetValue(draft.ImageType);
        entity["attributes"] = string.Join(',', (draft.Attributes ?? [])
            .Select(value => value.Trim())
            .Where(value => value.Length > 0));
        entity["messagepropertyname"] = propertyName;
        entity["sdkmessageprocessingstepid"] = new EntityReference(
            "sdkmessageprocessingstep",
            draft.StepId);
        return entity;
    }
}
