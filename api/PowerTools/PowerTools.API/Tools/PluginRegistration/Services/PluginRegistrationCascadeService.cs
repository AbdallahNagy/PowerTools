using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class PluginRegistrationCascadeService(
    PluginRegistrationDependencyService dependencies,
    PluginRegistrationCapabilityService capabilities,
    PluginRegistrationPreflightService preflight,
    IVerifiedMutationExecutor? verifiedMutationExecutor = null)
{
    private readonly IVerifiedMutationExecutor mutationExecutor = verifiedMutationExecutor ?? new VerifiedMutationExecutor();
    public async Task<CascadeUnregisterPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, CascadeUnregisterDraftDto draft, CancellationToken cancellationToken)
    {
        var snapshot = await BuildSnapshotAsync(gateway, draft, cancellationToken);
        var plan = BuildDeletePlan(snapshot);
        ValidateExpectedVersions(draft, plan);
        var capability = capabilities.GetCapabilities(await gateway.SupportsCascadeTransactionAsync(cancellationToken)).TransactionalCascadeUnregister;
        var blockers = BuildBlockers(snapshot, capability).ToArray();
        var impact = MapImpact(snapshot);
        var request = Request(environment, draft, plan, snapshot.ExternalDependencies, capability);
        var mutationPlan = preflight.CreatePlan(request, [], new MutationImpactDto(
            plan.Select(value => value.LogicalName).ToArray(), snapshot.ExternalDependencies.Select(value => $"{value.ComponentTypeLabel}: {value.Name}").ToArray(),
            plan.Select(value => value.Id.ToString("D")).ToArray()), [], blockers, Confirmation(draft, snapshot, blockers));
        return new(draft, mutationPlan, impact, plan);
    }

    public async Task<CascadeUnregisterExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway, string environment,
        string token, CascadeUnregisterDraftDto draft, string? typedName, bool acknowledged, CancellationToken cancellationToken)
    {
        var initial = await BuildSnapshotAsync(gateway, draft, cancellationToken);
        var initialPlan = BuildDeletePlan(initial);
        ValidateExpectedVersions(draft, initialPlan);
        var capability = capabilities.GetCapabilities(await gateway.SupportsCascadeTransactionAsync(cancellationToken)).TransactionalCascadeUnregister;
        EnsureExecutable(initial, capability, draft, typedName, acknowledged);
        await preflight.ValidateExecutionAsync(token, Request(environment, draft, initialPlan, initial.ExternalDependencies, capability), async ct =>
        {
            var fresh = await BuildSnapshotAsync(gateway, draft, ct);
            var freshPlan = BuildDeletePlan(fresh);
            ValidateExpectedVersions(draft, freshPlan);
            EnsureExecutable(fresh, capability, draft, typedName, acknowledged);
            return Request(environment, draft, freshPlan, fresh.ExternalDependencies, capability);
        }, cancellationToken);
        async Task<bool> Verify(CancellationToken ct)
        {
            var verified = await gateway.RetrieveCatalogRowsAsync(ct);
            return !PlannedIds(initialPlan).Intersect(AllIds(verified)).Any();
        }
        async Task<MutationReconciliationResult> Reconcile(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            var current = CurrentVersions(rows, initialPlan);
            if (current.Count == 0) return MutationReconciliationResult.Succeeded();
            if (current.Count != initialPlan.Count) return MutationReconciliationResult.Contradictory();
            return initialPlan.All(item => current.TryGetValue(item.Id, out var version) && version == item.VersionNumber)
                ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
        }
        var execution = await mutationExecutor.ExecuteAsync(
            ct => gateway.ExecuteCascadeTransactionAsync(initialPlan, ct), Reconcile, Verify, cancellationToken);
        var success = execution.Outcome is "succeededAndVerified" or "reconciledAfterCommunicationFailure";
        return new(execution.Outcome, success, success ? null : MapImpact(initial), execution.Problem);
    }

    private async Task<CascadeDependencySnapshot> BuildSnapshotAsync(IPluginRegistrationGateway gateway,
        CascadeUnregisterDraftDto draft, CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var initial = dependencies.Build(rows, draft);
        var plan = BuildDeletePlan(initial);
        var cascadeDependencies = await gateway.RetrieveCascadeDependenciesAsync(plan, cancellationToken);
        if (cascadeDependencies.Count == 0) return initial;
        var augmented = new PluginRegistrationRows(rows.Assemblies, rows.Types, rows.Steps, rows.Images,
            rows.Dependencies.Concat(cascadeDependencies).ToArray(), rows.WorkflowArguments,
            rows.HasCompleteAssemblyImpactData);
        return dependencies.Build(augmented, draft);
    }

    private static IReadOnlyList<CascadeDeleteRequestDto> BuildDeletePlan(CascadeDependencySnapshot snapshot) =>
        snapshot.Images.Select(value => new CascadeDeleteRequestDto(value.Id, "sdkmessageprocessingstepimage", value.VersionNumber))
            .Concat(snapshot.Steps.Select(value => new CascadeDeleteRequestDto(value.Id, "sdkmessageprocessingstep", value.VersionNumber)))
            .Concat(snapshot.Handlers.Select(value => new CascadeDeleteRequestDto(value.Id, "plugintype", value.VersionNumber)))
            .Concat(snapshot.Assembly is null ? [] : [new CascadeDeleteRequestDto(snapshot.Assembly.Id, "pluginassembly", snapshot.Assembly.VersionNumber)])
            .GroupBy(value => value.Id).Select(group => group.First()).ToArray();
    private static IEnumerable<MutationBlockerDto> BuildBlockers(CascadeDependencySnapshot snapshot, TransactionalCascadeUnregisterCapabilityDto capability)
    {
        if (!capability.Supported) yield return new("transactional_cascade_unsupported", capability.Reason);
        foreach (var value in snapshot.ExternalDependencies) yield return new("external_dependency", $"{value.ComponentTypeLabel} '{value.Name}' is outside this registration hierarchy.");
        foreach (var value in snapshot.Handlers.Where(value => value.IsManaged || !value.IsCustomizable)) yield return new("handler_not_deletable", $"Handler '{value.TypeName}' is managed or non-customizable.");
        foreach (var value in snapshot.Steps.Where(value => value.IsManaged || !value.IsCustomizable)) yield return new("step_not_deletable", $"Step '{value.Name}' is managed or non-customizable.");
        foreach (var value in snapshot.Images.Where(value => value.IsManaged || !value.IsCustomizable)) yield return new("image_not_deletable", $"Image '{value.Name}' is managed or non-customizable.");
        if (snapshot.Assembly is { IsManaged: true } or { IsCustomizable: false }) yield return new("assembly_not_deletable", "The assembly is managed or non-customizable.");
    }
    private static ConfirmationRequirementDto Confirmation(CascadeUnregisterDraftDto draft, CascadeDependencySnapshot snapshot, IReadOnlyList<MutationBlockerDto> blockers) =>
        blockers.Count > 0 ? new("blocked", "Resolve every blocker before deleting registration components.") :
        draft.TargetKind == CascadeTargetKind.Assembly ? new("typedNameAndAcknowledgement", "Acknowledge and type the exact assembly name.", snapshot.Assembly!.Name, true) :
        new("typedName", "Type the complete handler class name.", snapshot.Handlers.Single().TypeName);
    private static void EnsureExecutable(CascadeDependencySnapshot snapshot, TransactionalCascadeUnregisterCapabilityDto capability,
        CascadeUnregisterDraftDto draft, string? typedName, bool acknowledged)
    {
        if (BuildBlockers(snapshot, capability).Any()) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        var expected = draft.TargetKind == CascadeTargetKind.Assembly ? snapshot.Assembly!.Name : snapshot.Handlers.Single().TypeName;
        if (!string.Equals(expected, typedName, StringComparison.Ordinal)) throw new ArgumentException("The typed confirmation does not match exactly.");
        if (draft.TargetKind == CascadeTargetKind.Assembly && !acknowledged)
            throw new ArgumentException("Assembly cascade unregister requires acknowledgement.");
    }
    private static void ValidateExpectedVersions(CascadeUnregisterDraftDto draft, IReadOnlyList<CascadeDeleteRequestDto> plan)
    {
        var actual = plan.ToDictionary(value => value.Id, value => value.VersionNumber);
        if (draft.ExpectedVersions.Count != actual.Count || draft.ExpectedVersions.Any(value => !actual.TryGetValue(value.Key, out var version) || version != value.Value))
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
    }
    private static MutationPreflightRequest Request(string environment, CascadeUnregisterDraftDto draft, IReadOnlyList<CascadeDeleteRequestDto> plan,
        IReadOnlyList<ComponentDependencyDto> dependencies, TransactionalCascadeUnregisterCapabilityDto capability) =>
        new(environment, $"cascade-unregister.{draft.TargetKind}", draft.TargetId, new { Draft = draft, DeletePlan = plan, Dependencies = dependencies, Capability = capability },
            plan.ToDictionary(value => value.Id, value => value.VersionNumber), null,
            new Dictionary<string, bool> { ["transactionalCascadeUnregister"] = capability.Supported });
    private static CascadeImpactDto MapImpact(CascadeDependencySnapshot snapshot) => new(
        snapshot.Assembly is null ? null : new PluginAssemblyDto(snapshot.Assembly.Id, snapshot.Assembly.Name, snapshot.Assembly.Version, snapshot.Assembly.Culture,
            snapshot.Assembly.PublicKeyToken, snapshot.Assembly.SourceType, snapshot.Assembly.IsolationMode, snapshot.Assembly.IsManaged, snapshot.Assembly.IsCustomizable,
            snapshot.Assembly.VersionNumber, [], snapshot.Assembly.Description, snapshot.Assembly.SolutionDisplayName),
        snapshot.Handlers.Select(value => new PluginHandlerDto(value.Id, value.IsWorkflowActivity ? HandlerKind.WorkflowActivity : HandlerKind.Plugin, value.TypeName, value.Name,
            value.FriendlyName, value.Description, value.WorkflowActivityGroupName, value.IsManaged, value.IsCustomizable, value.VersionNumber, [], [], [], value.AssemblyId, value.SolutionDisplayName)).ToArray(),
        snapshot.Steps.Select(value => new PluginStepDto(value.Id, value.PluginTypeId ?? Guid.Empty, value.Name, value.Description, value.MessageLabel, value.PrimaryTableLabel,
            value.SecondaryTableLabel, value.StageLabel, value.ModeLabel, value.Stage, value.Mode, value.Rank, value.IsEnabled, value.IsManaged, value.IsCustomizable,
            value.VersionNumber, value.SecureConfigExists, [], value.SolutionDisplayName)).ToArray(),
        snapshot.Images.Select(value => new PluginImageDto(value.Id, value.PluginStepId ?? Guid.Empty, value.Name, value.Description, value.ImageTypeLabel, value.EntityAlias,
            value.Attributes, value.IsManaged, value.IsCustomizable, value.VersionNumber, value.SolutionDisplayName)).ToArray(), snapshot.ExternalDependencies,
        snapshot.Steps.Count(value => value.IsEnabled));
    private static IEnumerable<Guid> PlannedIds(IEnumerable<CascadeDeleteRequestDto> plan) => plan.Select(value => value.Id);
    private static IEnumerable<Guid> AllIds(PluginRegistrationRows rows) => rows.Assemblies.Select(value => value.Id).Concat(rows.Types.Select(value => value.Id)).Concat(rows.Steps.Select(value => value.Id)).Concat(rows.Images.Select(value => value.Id));
    private static IReadOnlyDictionary<Guid, long> CurrentVersions(PluginRegistrationRows rows,
        IReadOnlyList<CascadeDeleteRequestDto> plan)
    {
        var planned = plan.Select(item => item.Id).ToHashSet();
        return rows.Assemblies.Select(value => (value.Id, value.VersionNumber))
            .Concat(rows.Types.Select(value => (value.Id, value.VersionNumber)))
            .Concat(rows.Steps.Select(value => (value.Id, value.VersionNumber)))
            .Concat(rows.Images.Select(value => (value.Id, value.VersionNumber)))
            .Where(value => planned.Contains(value.Id))
            .ToDictionary(value => value.Id, value => value.VersionNumber);
    }
}
