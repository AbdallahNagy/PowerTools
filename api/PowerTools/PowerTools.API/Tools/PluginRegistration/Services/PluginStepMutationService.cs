using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class PluginStepMutationService(PluginStepValidator validator, PluginRegistrationPreflightService preflight,
    IVerifiedMutationExecutor? verifiedMutationExecutor = null)
{
    private readonly IVerifiedMutationExecutor mutationExecutor = verifiedMutationExecutor ?? new VerifiedMutationExecutor();
    private static readonly HashSet<string> Operations = new(["create", "update", "enable", "disable", "unregister"], StringComparer.Ordinal);

    public async Task<StepMutationPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, string operation, StepDraftDto submitted, CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var current = await ReadAndValidateAsync(gateway, operation, targetId, submitted, cancellationToken);
        var dependencies = operation == "unregister" ? current.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray() : [];
        var blockers = current.Validation.Blockers.Concat(operation == "unregister" ? current.State.Dependencies.Select(item =>
            new MutationBlockerDto("dependency", $"{item.ComponentTypeLabel} '{item.Name}' depends on this step.")) : []).ToArray();
        var request = Request(environment, operation, targetId, current.Validation.Draft, submitted.ExpectedVersions, dependencies,
            current.State.SecureConfigId, current.State.SecureConfigVersion);
        var confirmation = operation == "unregister"
            ? new ConfirmationRequirementDto("typedName", $"Type {current.State.StepName} to unregister this step.", current.State.StepName)
            : operation is "enable" or "disable"
                ? new ConfirmationRequirementDto("explicit", $"Confirm {operation} in {environment}: {current.State.Message} {current.State.PrimaryTable}, stage {current.Validation.Draft.Stage}.")
                : new ConfirmationRequirementDto("explicit", "Confirm every displayed step change.");
        var before = targetId.HasValue ? PublicBefore(current.State) : null;
        var after = current.Validation.PublicAfter with { IsEnabled = operation == "enable" || operation != "disable" && current.Validation.PublicAfter.IsEnabled };
        var plan = preflight.CreatePlan(request, Changes(before, after),
            new MutationImpactDto([current.State.StepName ?? current.State.Message], dependencies, []),
            current.Validation.Warnings, blockers, confirmation);
        return new(current.Validation.Draft with { ReplacementSecureConfiguration = null }, plan, before, after);
    }

    public async Task<StepMutationExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway,
        string environment, string operation, string token, StepDraftDto submitted, string? typedName,
        CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var initial = await ReadAndValidateAsync(gateway, operation, targetId, submitted, cancellationToken);
        EnsureExecutable(initial.Validation.Blockers, operation == "unregister" ? initial.State.Dependencies : []);
        if (operation == "unregister" && !string.Equals(typedName, initial.State.StepName, StringComparison.Ordinal))
            throw new ArgumentException("The typed step name does not match exactly.");
        var dependencies = operation == "unregister" ? initial.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray() : [];
        await preflight.ValidateExecutionAsync(token,
            Request(environment, operation, targetId, initial.Validation.Draft, submitted.ExpectedVersions, dependencies,
                initial.State.SecureConfigId, initial.State.SecureConfigVersion),
            async ct =>
            {
                var fresh = await ReadAndValidateAsync(gateway, operation, targetId, submitted, ct);
                EnsureExecutable(fresh.Validation.Blockers, operation == "unregister" ? fresh.State.Dependencies : []);
                var freshDependencies = operation == "unregister" ? fresh.State.Dependencies.Select(item => $"{item.ComponentTypeLabel}: {item.Name}").ToArray() : [];
                return Request(environment, operation, targetId, fresh.Validation.Draft, submitted.ExpectedVersions, freshDependencies,
                    fresh.State.SecureConfigId, fresh.State.SecureConfigVersion);
            }, cancellationToken);

        var before = PublicBefore(initial.State);
        Guid? mutatedId = targetId;
        PluginStepDto? verifiedStep = null;
        async Task<bool> Verify(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            var row = mutatedId is null ? null : rows.Steps.SingleOrDefault(item => item.Id == mutatedId);
            verifiedStep = row is null ? null : Map(row);
            if (operation == "unregister") return row is null;
            var verifiedState = row is null ? null : await gateway.RetrieveStepPreflightStateAsync(
                submitted.PluginTypeId, row.Id, initial.Validation.Draft, ct);
            return row is not null && verifiedState is not null && StepMatches(row, verifiedState,
                operation, submitted, initial.Validation.Draft);
        }
        async Task<MutationReconciliationResult> Reconcile(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            if (operation == "unregister")
                return rows.Steps.All(item => item.Id != targetId)
                    ? MutationReconciliationResult.Succeeded() : MutationReconciliationResult.Rejected();
            if (operation == "create")
            {
                var candidates = rows.Steps.Where(item => item.PluginTypeId == submitted.PluginTypeId
                    && item.Stage == initial.Validation.Draft.Stage && item.Mode == initial.Validation.Draft.Mode
                    && item.Rank == initial.Validation.Draft.Rank).ToArray();
                if (candidates.Length == 0) return MutationReconciliationResult.Rejected();
                if (candidates.Length != 1) return MutationReconciliationResult.Contradictory();
                mutatedId = candidates[0].Id;
                return await Verify(ct) ? MutationReconciliationResult.Succeeded() : MutationReconciliationResult.Contradictory();
            }
            var target = rows.Steps.SingleOrDefault(item => item.Id == targetId);
            if (target is null) return MutationReconciliationResult.Contradictory();
            mutatedId = target.Id;
            if (await Verify(ct)) return MutationReconciliationResult.Succeeded();
            return target.VersionNumber == submitted.ExpectedVersions[target.Id]
                ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
        }
        var execution = await mutationExecutor.ExecuteAsync(async ct =>
        {
            mutatedId = await gateway.MutateStepAsync(new PluginStepMutationCommand(operation, targetId,
                initial.Validation.Draft, before, submitted.ExpectedVersions[submitted.PluginTypeId],
                targetId is { } id ? submitted.ExpectedVersions[id] : null,
                initial.State.SecureConfigId, initial.State.SecureConfigVersion), ct);
        }, Reconcile, Verify, cancellationToken);
        var success = execution.Outcome is "succeededAndVerified" or "reconciledAfterCommunicationFailure";
        return new(execution.Outcome, success, verifiedStep, execution.Problem);
    }

    private async Task<ValidatedState> ReadAndValidateAsync(IPluginRegistrationGateway gateway, string operation, Guid? targetId,
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
        var operationNormalized = operation is "enable" or "disable" or "unregister" ? operationDraft(targetId, draft, state) : draft;
        var normalizedDraft = NormalizeNullableDraft(operationNormalized, state);
        var validation = validator.Validate(normalizedDraft, new(state.StepName, state.Message, state.PrimaryTable, state.SecondaryTable,
            state.PrimaryIdAttribute, state.AvailableAttributes, state.MessageIsSupported, state.FilterIsSupported,
            state.IsImpersonatingUserEnabled, state.IsOrdinaryPlugin, state.IsParentManaged, state.IsParentCustomizable,
            state.DuplicateExists, state.IsManaged, state.IsCustomizable, state.SecureConfigExists, state.CurrentEnabled,
            state.CurrentVersion, state.PluginTypeId, state.TargetStepId));
        return new(state, validation);
    }

    private static StepDraftDto operationDraft(Guid? targetId, StepDraftDto draft, PluginStepPreflightState state)
    {
        if (targetId is null || state.CurrentSdkMessageId is null || state.CurrentSdkMessageFilterId is null) return draft;
        return draft with { SdkMessageId = state.CurrentSdkMessageId.Value, SdkMessageFilterId = state.CurrentSdkMessageFilterId.Value,
            PrimaryTable = state.PrimaryTable, SecondaryTable = state.SecondaryTable, Stage = state.CurrentStage,
            Mode = state.CurrentMode, Rank = state.CurrentRank, FilteringAttributes = state.CurrentFilteringAttributes ?? [],
            ImpersonatingUserId = state.CurrentImpersonatingUserId, UnsecureConfiguration = state.CurrentUnsecureConfiguration,
            ReplacementSecureConfiguration = null, ImpersonatingUserAction = "keep", UnsecureConfigurationAction = "keep" };
    }

    private static StepDraftDto NormalizeNullableDraft(StepDraftDto draft, PluginStepPreflightState state) => draft with
    {
        ImpersonatingUserId = draft.ImpersonatingUserAction switch
        {
            "keep" => state.CurrentImpersonatingUserId,
            "clear" => null,
            _ => draft.ImpersonatingUserId
        },
        UnsecureConfiguration = draft.UnsecureConfigurationAction switch
        {
            "keep" => state.CurrentUnsecureConfiguration,
            "clear" => null,
            _ => draft.UnsecureConfiguration
        }
    };

    private static Guid? TargetId(string operation, StepDraftDto draft)
    {
        if (!Operations.Contains(operation)) throw new ArgumentException("The step operation is not supported.");
        var ids = draft.ExpectedVersions.Keys.Where(id => id != draft.PluginTypeId).ToArray();
        if (operation == "create") return null;
        return ids.Length == 1 ? ids[0] : throw new ArgumentException("Exactly one target step version is required.");
    }

    private static MutationPreflightRequest Request(string environment, string operation, Guid? targetId,
        StepDraftDto draft, IReadOnlyDictionary<Guid, long> versions, IReadOnlyList<string> dependencies,
        Guid? secureConfigId, long? secureConfigVersion) =>
        new(environment, $"steps.{operation}", targetId, new { Draft = draft, Dependencies = dependencies,
            SecureConfig = new { Id = secureConfigId, Version = secureConfigVersion } }, versions, null,
            new Dictionary<string, bool>());
    private static void EnsureExecutable(IReadOnlyList<MutationBlockerDto> blockers, IReadOnlyList<ComponentDependencyDto> dependencies)
    {
        if (blockers.Count > 0 || dependencies.Count > 0)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
    }
    private static StepPublicValuesDto PublicBefore(PluginStepPreflightState state) => new(state.StepName ?? "Step",
        state.Message, state.PrimaryTable, state.SecondaryTable, state.CurrentStage, state.CurrentMode, state.CurrentRank,
        state.CurrentFilteringAttributes ?? [], state.CurrentImpersonatingUserId, state.CurrentUnsecureConfiguration,
        state.SecureConfigExists, state.CurrentEnabled, "keep");
    private static IReadOnlyList<MutationChangeDto> Changes(StepPublicValuesDto? before, StepPublicValuesDto after)
    {
        var pairs = new (string Field, string? Before, string? After)[] {
            ("message", before?.Message, after.Message), ("primaryTable", before?.PrimaryTable, after.PrimaryTable),
            ("secondaryTable", before?.SecondaryTable, after.SecondaryTable), ("stage", before?.Stage.ToString(), after.Stage.ToString()),
            ("mode", before?.Mode.ToString(), after.Mode.ToString()), ("rank", before?.Rank.ToString(), after.Rank.ToString()),
            ("filteringAttributes", before is null ? null : string.Join(',', before.FilteringAttributes), string.Join(',', after.FilteringAttributes)),
            ("impersonatingUser", before?.ImpersonatingUserId?.ToString(), after.ImpersonatingUserId?.ToString()),
            ("unsecureConfiguration", before?.UnsecureConfiguration, after.UnsecureConfiguration),
            ("secureConfigExists", before?.SecureConfigExists.ToString(), after.SecureConfigExists.ToString()),
            ("secureConfigurationAction", null, after.SecureConfigurationAction),
            ("enabled", before?.IsEnabled.ToString(), after.IsEnabled.ToString()) };
        return pairs.Where(pair => before is null || !string.Equals(pair.Before, pair.After, StringComparison.Ordinal))
            .Select(pair => new MutationChangeDto(pair.Field, pair.Before, pair.After)).ToArray();
    }
    private static PluginStepDto Map(PluginStepRow row) => new(row.Id, row.PluginTypeId ?? Guid.Empty, row.Name,
        row.Description, row.MessageLabel, row.PrimaryTableLabel, row.SecondaryTableLabel, row.StageLabel,
        row.ModeLabel, row.Stage, row.Mode, row.Rank, row.IsEnabled, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, row.SecureConfigExists, [], row.SolutionDisplayName);
    private static bool StepMatches(PluginStepRow row, PluginStepPreflightState state, string operation,
        StepDraftDto submitted, StepDraftDto normalized) =>
        row.PluginTypeId == submitted.PluginTypeId
        && row.VersionNumber > (submitted.ExpectedVersions.TryGetValue(row.Id, out var expectedVersion) ? expectedVersion : 0)
        && (operation != "enable" || row.IsEnabled)
        && (operation != "disable" || !row.IsEnabled)
        && row.Stage == normalized.Stage && row.Mode == normalized.Mode && row.Rank == normalized.Rank
        && state.CurrentSdkMessageId == normalized.SdkMessageId
        && state.CurrentSdkMessageFilterId == normalized.SdkMessageFilterId
        && (state.CurrentFilteringAttributes ?? []).Order(StringComparer.OrdinalIgnoreCase)
            .SequenceEqual(normalized.FilteringAttributes.Order(StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase)
        && (normalized.ImpersonatingUserAction == "keep" || state.CurrentImpersonatingUserId == normalized.ImpersonatingUserId)
        && (normalized.UnsecureConfigurationAction == "keep"
            || string.Equals(state.CurrentUnsecureConfiguration, normalized.UnsecureConfiguration, StringComparison.Ordinal))
        && (normalized.ReplacementSecureConfiguration is null || state.SecureConfigExists);
    private sealed record ValidatedState(PluginStepPreflightState State, PluginStepValidationResult Validation);
}
