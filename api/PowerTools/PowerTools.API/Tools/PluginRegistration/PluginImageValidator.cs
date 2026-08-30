using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginImageValidator
{
    public PluginImageValidationResult Validate(ImageDraftDto submitted, PluginImageValidationState state)
    {
        var attributes = submitted.Attributes.Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase).ToArray();
        var alias = submitted.Alias.Trim();
        var property = submitted.MessagePropertyName.Trim();
        var draft = submitted with { Alias = alias, MessagePropertyName = property, Attributes = attributes };
        var blockers = new List<MutationBlockerDto>();
        if (alias.Length == 0) blockers.Add(new("aliasRequired", "Image alias is required."));
        if (state.DuplicateAlias) blockers.Add(new("duplicateAlias", "An image with this alias already exists on the step."));
        if (!string.Equals(property, state.SupportedMessagePropertyName, StringComparison.OrdinalIgnoreCase))
            blockers.Add(new("invalidMessageProperty", $"{state.Message} images require the {state.SupportedMessagePropertyName} message property."));
        if (!IsImageTypeAllowed(state.Message, draft.ImageType))
            blockers.Add(new("invalidImageType", $"The selected image type is not available for {state.Message}."));
        if (draft.ImageType is 1 or 2 && state.Stage != 40)
            blockers.Add(new("invalidImageStage", "Post images require PostOperation."));
        if (submitted.Attributes.Any(value => value.Trim() == "*")) blockers.Add(new("allColumnsNotAllowed", "All columns is not supported; select explicit columns."));
        if (attributes.Length == 0) blockers.Add(new("attributesRequired", "Select at least one image column."));
        if (attributes.Any(value => !state.AvailableAttributes.Contains(value, StringComparer.OrdinalIgnoreCase)))
            blockers.Add(new("invalidAttribute", "Every image column must exist on the step table."));
        if (state.IsManaged) blockers.Add(new("managedComponent", "Managed images cannot be changed here."));
        if (!state.IsCustomizable) blockers.Add(new("nonCustomizable", "This image is not customizable."));
        if (state.ParentIsManaged) blockers.Add(new("managedParent", "The parent step is managed."));
        if (!state.ParentIsCustomizable) blockers.Add(new("nonCustomizableParent", "The parent step is not customizable."));
        if (!draft.ExpectedVersions.TryGetValue(state.StepId, out var stepVersion) || stepVersion != state.StepVersion)
            blockers.Add(new("staleStepVersion", "The parent step changed after it was loaded."));
        if (state.TargetImageId is { } imageId && state.CurrentImageVersion is { } imageVersion
            && (!draft.ExpectedVersions.TryGetValue(imageId, out var expected) || expected != imageVersion))
            blockers.Add(new("staleImageVersion", "The image changed after it was loaded."));
        var name = state.ImageName ?? alias;
        return new(draft, new(name, draft.ImageType, alias, property, attributes), [], blockers);
    }

    private static bool IsImageTypeAllowed(string message, int imageType) => message.ToLowerInvariant() switch
    {
        "create" => imageType == 1,
        "delete" => imageType == 0,
        "update" => imageType is 0 or 1 or 2,
        _ => false
    };
}
