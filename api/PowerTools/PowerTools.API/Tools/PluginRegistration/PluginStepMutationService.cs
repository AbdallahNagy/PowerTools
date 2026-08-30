using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginStepMutationService(PluginStepValidator validator, PluginRegistrationPreflightService preflight)
{
    private static readonly HashSet<string> Operations = new(["create", "update", "enable", "disable", "unregister"], StringComparer.Ordinal);

    public async Task<StepMutationPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, string operation, StepDraftDto submitted, CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var current = await ReadAndValidateAsync(gateway, targetId, submitted, cancellationToken);
        var dependencies = current.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray();
        var blockers = current.Validation.Blockers.Concat(current.State.Dependencies.Select(item =>
            new MutationBlockerDto("dependency", $"{item.ComponentTypeLabel} '{item.Name}' depends on this step."))).ToArray();
        var request = Request(environment, operation, targetId, current.Validation.Draft, submitted.ExpectedVersions, dependencies);
        var confirmation = operation == "unregister"
            ? new ConfirmationRequirementDto("typedName", $"Type {current.State.StepName} to unregister this step.", current.State.StepName)
            : operation is "enable" or "disable"
                ? new ConfirmationRequirementDto("explicit", $"Confirm {operation} in {environment}: {current.State.Message} {current.State.PrimaryTable}, stage {current.Validation.Draft.Stage}.")
                : new ConfirmationRequirementDto("explicit", "Confirm every displayed step change.");
        var plan = preflight.CreatePlan(request, Changes(current.Validation.PublicAfter),
            new MutationImpactDto([current.State.StepName ?? current.State.Message], dependencies, []),
            current.Validation.Warnings, blockers, confirmation);
        return new(submitted with { ReplacementSecureConfiguration = null }, plan, current.Validation.PublicAfter);
    }

    public async Task<StepMutationExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway,
        string environment, string operation, string token, StepDraftDto submitted, string? typedName,
        CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var initial = await ReadAndValidateAsync(gateway, targetId, submitted, cancellationToken);
        EnsureExecutable(initial.Validation.Blockers, initial.State.Dependencies);
        if (operation == "unregister" && !string.Equals(typedName, initial.State.StepName, StringComparison.Ordinal))
            throw new ArgumentException("The typed step name does not match exactly.");
        var dependencies = initial.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray();
        await preflight.ValidateExecutionAsync(token,
            Request(environment, operation, targetId, initial.Validation.Draft, submitted.ExpectedVersions, dependencies),
            async ct =>
            {
                var fresh = await ReadAndValidateAsync(gateway, targetId, submitted, ct);
                EnsureExecutable(fresh.Validation.Blockers, fresh.State.Dependencies);
                var freshDependencies = fresh.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray();
                return Request(environment, operation, targetId, fresh.Validation.Draft, submitted.ExpectedVersions, freshDependencies);
            }, cancellationToken);

        var mutatedId = await gateway.MutateStepAsync(operation, targetId, initial.Validation.Draft, cancellationToken);
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var row = rows.Steps.SingleOrDefault(item => item.Id == mutatedId);
        if (operation == "unregister")
            return row is null ? new("succeededAndVerified", true, null) : new("verificationFailed", false, Map(row));
        var verifiedState = row is null ? null : await gateway.RetrieveStepPreflightStateAsync(
            submitted.PluginTypeId, mutatedId, initial.Validation.Draft, cancellationToken);
        if (row is null || verifiedState is null || row.PluginTypeId != submitted.PluginTypeId
            || operation == "enable" && !row.IsEnabled || operation == "disable" && row.IsEnabled
            || row.Stage != initial.Validation.Draft.Stage || row.Mode != initial.Validation.Draft.Mode
            || row.Rank != initial.Validation.Draft.Rank
            || verifiedState.CurrentSdkMessageId != initial.Validation.Draft.SdkMessageId
            || verifiedState.CurrentSdkMessageFilterId != initial.Validation.Draft.SdkMessageFilterId
            || !(verifiedState.CurrentFilteringAttributes ?? []).Order(StringComparer.OrdinalIgnoreCase)
                .SequenceEqual(initial.Validation.Draft.FilteringAttributes.Order(StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase)
            || verifiedState.CurrentImpersonatingUserId != initial.Validation.Draft.ImpersonatingUserId
            || initial.Validation.Draft.UnsecureConfiguration is not null
                && !string.Equals(verifiedState.CurrentUnsecureConfiguration, initial.Validation.Draft.UnsecureConfiguration, StringComparison.Ordinal)
            || initial.Validation.Draft.ReplacementSecureConfiguration is not null && !verifiedState.SecureConfigExists)
            return new("verificationFailed", false, row is null ? null : Map(row));
        return new("succeededAndVerified", true, Map(row));
    }

    private async Task<ValidatedState> ReadAndValidateAsync(IPluginRegistrationGateway gateway, Guid? targetId,
        StepDraftDto draft, CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        foreach (var expected in draft.ExpectedVersions)
        {
            var actual = rows.Types.Where(item => item.Id == expected.Key).Select(item => (long?)item.VersionNumber)
                .Concat(rows.Steps.Where(item => item.Id == expected.Key).Select(item => (long?)item.VersionNumber)).SingleOrDefault();
            if (actual != expected.Value) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        }
        var state = await gateway.RetrieveStepPreflightStateAsync(draft.PluginTypeId, targetId, draft, cancellationToken);
        var validation = validator.Validate(draft, new(state.Message, state.PrimaryTable, state.PrimaryIdAttribute,
            state.MessageIsSupported, state.FilterIsSupported, state.IsImpersonatingUserEnabled, state.DuplicateExists,
            state.IsManaged, state.IsCustomizable, state.SecureConfigExists, state.CurrentVersion, state.PluginTypeId, state.TargetStepId));
        return new(state, validation);
    }

    private static Guid? TargetId(string operation, StepDraftDto draft)
    {
        if (!Operations.Contains(operation)) throw new ArgumentException("The step operation is not supported.");
        var ids = draft.ExpectedVersions.Keys.Where(id => id != draft.PluginTypeId).ToArray();
        if (operation == "create") return null;
        return ids.Length == 1 ? ids[0] : throw new ArgumentException("Exactly one target step version is required.");
    }

    private static MutationPreflightRequest Request(string environment, string operation, Guid? targetId,
        StepDraftDto draft, IReadOnlyDictionary<Guid, long> versions, IReadOnlyList<string> dependencies) =>
        new(environment, $"steps.{operation}", targetId, new { Draft = draft, Dependencies = dependencies }, versions, null,
            new Dictionary<string, bool>());
    private static void EnsureExecutable(IReadOnlyList<MutationBlockerDto> blockers, IReadOnlyList<ComponentDependencyDto> dependencies)
    {
        if (blockers.Count > 0 || dependencies.Count > 0)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
    }
    private static IReadOnlyList<MutationChangeDto> Changes(StepPublicValuesDto after) =>
        [new("message", null, after.Message), new("table", null, after.PrimaryTable),
         new("stage", null, after.Stage.ToString()), new("mode", null, after.Mode.ToString()),
         new("rank", null, after.Rank.ToString()), new("secureConfigExists", null, after.SecureConfigExists.ToString())];
    private static PluginStepDto Map(PluginStepRow row) => new(row.Id, row.PluginTypeId ?? Guid.Empty, row.Name,
        row.Description, row.MessageLabel, row.PrimaryTableLabel, row.SecondaryTableLabel, row.StageLabel,
        row.ModeLabel, row.Stage, row.Mode, row.Rank, row.IsEnabled, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, row.SecureConfigExists, [], row.SolutionDisplayName);
    private sealed record ValidatedState(PluginStepPreflightState State, PluginStepValidationResult Validation);
}
