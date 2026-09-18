using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Validation;

public static class StepDraftValidator
{
    public static readonly HashSet<string> FilteringAttributeMessages = new(
        StringComparer.OrdinalIgnoreCase)
    {
        "Update",
        "Create",
        "CreateMultiple",
        "UpdateMultiple",
    };

    public static IReadOnlyList<RegistrationProblem> Validate(
        StepDraftDto draft,
        string messageName,
        bool isUpdate)
    {
        var problems = new List<RegistrationProblem>();
        if (string.IsNullOrWhiteSpace(draft.Name))
            problems.Add(new("name", "required", "Step name is required."));
        else if (draft.Name.Length > RegistrationOptionValues.NameMaxLength)
            problems.Add(new("name", "too_long", $"Step name cannot exceed {RegistrationOptionValues.NameMaxLength} characters."));

        if (draft.PluginTypeId == Guid.Empty)
            problems.Add(new("pluginTypeId", "required", "A plug-in type is required."));
        if (draft.MessageId == Guid.Empty)
            problems.Add(new("messageId", "required", "A message is required."));
        if (draft.FilterId == Guid.Empty)
            problems.Add(new("filterId", "invalid", "Do not send an empty filter id."));

        if (!RegistrationOptionValues.WritableStages.Contains(draft.Stage))
            problems.Add(new("stage", "invalid", "Stage must be Pre-validation, Pre-operation, or Post-operation."));
        if (draft.Mode is not (RegistrationOptionValues.ModeSynchronous or RegistrationOptionValues.ModeAsynchronous))
            problems.Add(new("mode", "invalid", "Mode must be synchronous or asynchronous."));
        if (draft.Mode == RegistrationOptionValues.ModeAsynchronous
            && draft.Stage != RegistrationOptionValues.StagePostOperation)
            problems.Add(new("mode", "async_requires_post", "Asynchronous steps must run in Post-operation."));

        if (draft.Rank < 0)
            problems.Add(new("rank", "invalid", "Execution order cannot be negative."));
        if (draft.SupportedDeployment is < 0 or > 2)
            problems.Add(new("supportedDeployment", "invalid", "Deployment must be server, offline, or both."));

        var attributes = draft.FilteringAttributes ?? [];
        if (attributes.Count > 0
            && !FilteringAttributeMessages.Contains(messageName))
            problems.Add(new(
                "filteringAttributes",
                "unsupported_message",
                $"Filtering attributes are not used for the {messageName} message."));

        if (draft.Configuration is { Length: > RegistrationOptionValues.ConfigurationMaxLength })
            problems.Add(new(
                "configuration",
                "too_long",
                $"Unsecure configuration cannot exceed {RegistrationOptionValues.ConfigurationMaxLength} characters."));

        var action = draft.SecureConfigurationAction?.Trim() ?? "";
        if (action is not ("keep" or "replace" or "clear"))
            problems.Add(new("secureConfigurationAction", "invalid", "Secure configuration action must be keep, replace, or clear."));
        else if (action == "replace" && string.IsNullOrWhiteSpace(draft.SecureConfiguration))
            problems.Add(new("secureConfiguration", "required", "Replacement secure configuration is required."));
        else if (!isUpdate && action == "clear")
            problems.Add(new("secureConfigurationAction", "invalid", "Clear is only valid when updating an existing step."));

        return problems;
    }
}
