using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginStepValidator
{
    private const int MaxConfigurationLength = 4096;

    public PluginStepValidationResult Validate(StepDraftDto submitted, PluginStepValidationState state)
    {
        var attributes = submitted.FilteringAttributes.Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase).ToArray();
        var draft = submitted with { PrimaryTable = submitted.PrimaryTable.Trim().ToLowerInvariant(),
            SecondaryTable = string.IsNullOrWhiteSpace(submitted.SecondaryTable) ? null : submitted.SecondaryTable.Trim().ToLowerInvariant(),
            FilteringAttributes = attributes };
        var warnings = new List<MutationWarningDto>();
        var blockers = new List<MutationBlockerDto>();
        if (!NullableActions.Contains(draft.ImpersonatingUserAction) || !NullableActions.Contains(draft.UnsecureConfigurationAction)
            || draft.ImpersonatingUserAction == "set" && draft.ImpersonatingUserId is null
            || draft.ImpersonatingUserAction == "clear" && draft.ImpersonatingUserId is not null
            || draft.UnsecureConfigurationAction == "set" && draft.UnsecureConfiguration is null
            || draft.UnsecureConfigurationAction == "clear" && draft.UnsecureConfiguration is not null)
            blockers.Add(new("invalidNullableAction", "Nullable step fields require keep, set, or clear semantics."));
        if (!state.MessageIsSupported || !state.FilterIsSupported
            || !string.Equals(draft.PrimaryTable, state.PrimaryTable, StringComparison.OrdinalIgnoreCase))
            blockers.Add(new("unsupportedMessageFilter", "The selected message and table filter are not supported."));
        if (!string.Equals(draft.SecondaryTable, state.SecondaryTable, StringComparison.OrdinalIgnoreCase))
            blockers.Add(new("unsupportedSecondaryTable", "The selected secondary table does not match the message filter."));
        if (attributes.Any(attribute => !state.AvailableAttributes.Contains(attribute, StringComparer.OrdinalIgnoreCase)))
            blockers.Add(new("invalidFilteringAttribute", "Every filtering attribute must exist on the primary table."));
        if (!state.IsOrdinaryPlugin) blockers.Add(new("ordinaryPluginRequired", "Steps require an ordinary plug-in class."));
        if (state.IsParentManaged) blockers.Add(new("managedParent", "The parent plug-in is managed."));
        if (!state.IsParentCustomizable) blockers.Add(new("nonCustomizableParent", "The parent plug-in is not customizable."));
        if (draft.Stage is not (10 or 20 or 40)) blockers.Add(new("invalidStage", "Select PreValidation, PreOperation, or PostOperation."));
        if (draft.Mode is not (0 or 1) || draft.Mode == 1 && draft.Stage != 40)
            blockers.Add(new("invalidMode", "Asynchronous execution is supported only for PostOperation."));
        if (draft.Rank is < 1 or > 1_000_000) blockers.Add(new("invalidRank", "Execution order must be between 1 and 1,000,000."));
        if (draft.UnsecureConfiguration?.Length > MaxConfigurationLength || draft.ReplacementSecureConfiguration?.Length > MaxConfigurationLength)
            blockers.Add(new("configTooLong", "Step configuration exceeds the supported length."));
        if (state.DuplicateExists) blockers.Add(new("duplicateStep", "An equivalent step registration already exists."));
        if (draft.ImpersonatingUserId.HasValue && !state.IsImpersonatingUserEnabled)
            blockers.Add(new("invalidImpersonatingUser", "The selected impersonating user is not enabled."));
        if (state.IsManaged) blockers.Add(new("managedComponent", "Managed steps cannot be changed here."));
        if (!state.IsCustomizable) blockers.Add(new("nonCustomizable", "This step is not customizable."));
        if (state.TargetStepId is { } stepId && state.CurrentVersion is { } version
            && (!draft.ExpectedVersions.TryGetValue(stepId, out var expected) || expected != version))
            blockers.Add(new("staleVersion", "The step changed after it was loaded."));
        if (string.Equals(state.Message, "Update", StringComparison.OrdinalIgnoreCase))
        {
            if (attributes.Contains(state.PrimaryIdAttribute, StringComparer.OrdinalIgnoreCase))
                blockers.Add(new("primaryKeyFilteringAttribute", "The primary key cannot be an Update filtering attribute."));
            if (attributes.Length == 0)
                warnings.Add(new("updateWithoutFilteringAttributes", "Update steps should select filtering attributes to avoid unnecessary execution."));
        }
        return new(draft, new(state.StepName ?? "New step", state.Message, state.PrimaryTable, draft.SecondaryTable, draft.Stage, draft.Mode,
            draft.Rank, attributes, draft.ImpersonatingUserId, draft.UnsecureConfiguration,
            state.SecureConfigExists || !string.IsNullOrEmpty(draft.ReplacementSecureConfiguration), state.CurrentEnabled,
            draft.ReplacementSecureConfiguration is null ? "keep" : "set"), warnings, blockers);
    }

    private static readonly HashSet<string> NullableActions = new(["keep", "set", "clear"], StringComparer.Ordinal);
}
