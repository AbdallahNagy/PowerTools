using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Validation;

public static class ImageDraftValidator
{
    public static IReadOnlyList<RegistrationProblem> Validate(
        ImageDraftDto draft,
        string stepMessageName,
        int stepStage,
        bool isUpdate)
    {
        var problems = new List<RegistrationProblem>();
        if (string.IsNullOrWhiteSpace(draft.Name))
            problems.Add(new("name", "required", "Image name is required."));
        if (string.IsNullOrWhiteSpace(draft.EntityAlias))
            problems.Add(new("entityAlias", "required", "Entity alias is required."));
        if (draft.StepId == Guid.Empty)
            problems.Add(new("stepId", "required", "A parent step is required."));

        if (draft.ImageType is < RegistrationOptionValues.ImagePre
            or > RegistrationOptionValues.ImageBoth)
            problems.Add(new("imageType", "invalid", "Image type must be Pre, Post, or Both."));

        var attributes = (draft.Attributes ?? [])
            .Select(value => value.Trim())
            .Where(value => value.Length > 0)
            .ToList();
        if (attributes.Count == 0)
            problems.Add(new("attributes", "required", "Select at least one attribute. All-columns images are not allowed."));
        if (attributes.Any(value => value == "*"))
            problems.Add(new("attributes", "all_columns", "All-columns images are not allowed. Select explicit attributes."));

        if (!ImageMessageProperties.TryGet(stepMessageName, out _))
            problems.Add(new("stepId", "image_unsupported_message", $"Images are not supported for the {stepMessageName} message."));

        if (string.Equals(stepMessageName, "Create", StringComparison.OrdinalIgnoreCase)
            && draft.ImageType != RegistrationOptionValues.ImagePost)
            problems.Add(new("imageType", "create_pre_image", "Create steps cannot register a pre-image."));

        if (stepStage is RegistrationOptionValues.StagePreValidation
                or RegistrationOptionValues.StagePreOperation
            && draft.ImageType != RegistrationOptionValues.ImagePre)
            problems.Add(new("imageType", "pre_stage_image", "Pre-validation and Pre-operation steps only support pre-images."));

        _ = isUpdate;
        return problems;
    }
}
