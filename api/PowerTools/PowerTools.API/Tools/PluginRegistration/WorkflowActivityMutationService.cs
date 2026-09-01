using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class WorkflowActivityMutationService(PluginRegistrationPreflightService preflight,
    IVerifiedMutationExecutor? verifiedMutationExecutor = null)
{
    private readonly IVerifiedMutationExecutor mutationExecutor = verifiedMutationExecutor ?? new VerifiedMutationExecutor();
    public async Task<WorkflowActivityMutationPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, WorkflowActivityDraftDto draft, CancellationToken cancellationToken)
    {
        var state = await ReadStateAsync(gateway, draft, cancellationToken);
        var current = state.Activity;
        var blockers = Blockers(current);
        var after = Map(current with { Name = draft.Name, FriendlyName = draft.FriendlyName,
            WorkflowActivityGroupName = draft.WorkflowActivityGroupName, Description = draft.Description });
        var plan = preflight.CreatePlan(Request(environment, draft, state), Changes(Map(current), after),
            new MutationImpactDto([current.TypeName], state.Dependencies.Select(DependencyLabel).ToArray(), []), [], blockers,
            new ConfirmationRequirementDto("explicit", "Confirm every displayed workflow activity registration change."));
        return new(draft, plan, Map(current), after);
    }

    public async Task<WorkflowActivityMutationExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway, string environment,
        WorkflowActivityDraftDto draft, string token, CancellationToken cancellationToken)
    {
        var state = await ReadStateAsync(gateway, draft, cancellationToken);
        var current = state.Activity;
        if (Blockers(current).Count > 0) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        await preflight.ValidateExecutionAsync(token, Request(environment, draft, state), async ct =>
        {
            var fresh = await ReadStateAsync(gateway, draft, ct);
            if (Blockers(fresh.Activity).Count > 0) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
            return Request(environment, draft, fresh);
        }, cancellationToken);
        PluginHandlerDto? verifiedActivity = null;
        async Task<bool> Verify(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            var verified = rows.Types.SingleOrDefault(type => type.Id == draft.WorkflowActivityId && type.IsWorkflowActivity);
            if (verified is null) return false;
            verifiedActivity = Map(verified);
            return WorkflowActivityMatches(verified, draft, current.VersionNumber);
        }
        async Task<MutationReconciliationResult> Reconcile(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            var candidate = rows.Types.SingleOrDefault(type => type.Id == draft.WorkflowActivityId && type.IsWorkflowActivity);
            if (candidate is null) return MutationReconciliationResult.Contradictory();
            if (WorkflowActivityMatches(candidate, draft, current.VersionNumber)) return MutationReconciliationResult.Succeeded();
            return candidate.VersionNumber == current.VersionNumber
                ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
        }
        var execution = await mutationExecutor.ExecuteAsync(async ct =>
        {
            await gateway.MutateWorkflowActivityAsync(new(draft.WorkflowActivityId, draft.Name, draft.FriendlyName,
                draft.WorkflowActivityGroupName, draft.Description, current.VersionNumber), ct);
        }, Reconcile, Verify, cancellationToken);
        var success = execution.Outcome is "succeededAndVerified" or "reconciledAfterCommunicationFailure";
        return new(execution.Outcome, success, verifiedActivity, execution.Problem);
    }

    private static async Task<WorkflowActivityMutationState> ReadStateAsync(IPluginRegistrationGateway gateway, WorkflowActivityDraftDto draft, CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var current = rows.Types.SingleOrDefault(type =>
            type.Id == draft.WorkflowActivityId && type.IsWorkflowActivity)
            ?? throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        if (draft.ExpectedVersions.TryGetValue(current.Id, out var expected) && expected != current.VersionNumber)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        var dependencies = Dependencies(rows, current);
        foreach (var dependency in dependencies)
        {
            if (draft.ExpectedVersions.TryGetValue(dependency.ComponentId, out expected)
                && expected != dependency.VersionNumber)
                throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        }
        return new WorkflowActivityMutationState(current, dependencies);
    }
    private static IReadOnlyList<MutationBlockerDto> Blockers(PluginTypeRow current) =>
        current.IsManaged ? [new("workflow_activity_managed", "Managed workflow activities cannot be updated.")]
        : !current.IsCustomizable ? [new("workflow_activity_not_customizable", "This workflow activity is not customizable.")] : [];
    private static MutationPreflightRequest Request(string environment, WorkflowActivityDraftDto draft, WorkflowActivityMutationState state) =>
        new(environment, "workflow-activities.update", state.Activity.Id,
            new { Draft = draft, Dependencies = state.Dependencies.Select(dependency => new
            {
                dependency.ComponentId, dependency.Name, dependency.ComponentTypeLabel, dependency.VersionNumber,
                dependency.StateLabel, dependency.IsManaged, dependency.IsCustomizable, dependency.SolutionDisplayName
            }).ToArray() },
            Versions(state), null, new Dictionary<string, bool>());

    private static IReadOnlyDictionary<Guid, long> Versions(WorkflowActivityMutationState state) =>
        new[] { new KeyValuePair<Guid, long>(state.Activity.Id, state.Activity.VersionNumber) }
            .Concat(state.Dependencies.Where(dependency => dependency.ComponentId != Guid.Empty)
                .Select(dependency => new KeyValuePair<Guid, long>(dependency.ComponentId, dependency.VersionNumber)))
            .OrderBy(pair => pair.Key)
            .ToDictionary(pair => pair.Key, pair => pair.Value);

    private static IReadOnlyList<PluginHandlerDependencyRow> Dependencies(PluginRegistrationRows rows, PluginTypeRow activity) =>
        rows.Dependencies.Where(dependency => dependency.HandlerId == activity.Id)
            .OrderBy(dependency => dependency.ComponentTypeLabel, StringComparer.Ordinal)
            .ThenBy(dependency => dependency.Name, StringComparer.Ordinal)
            .ThenBy(dependency => dependency.ComponentId)
            .ToArray();

    private static string DependencyLabel(PluginHandlerDependencyRow dependency) =>
        $"{dependency.ComponentTypeLabel}: {dependency.Name}";
    private static IReadOnlyList<MutationChangeDto> Changes(PluginHandlerDto before, PluginHandlerDto after) => new[] {
        Change("name", before.Name, after.Name), Change("friendlyName", before.FriendlyName, after.FriendlyName),
        Change("workflowActivityGroupName", before.WorkflowActivityGroupName, after.WorkflowActivityGroupName),
        Change("description", before.Description, after.Description) }.Where(change => change.Before != change.After).ToArray();
    private static MutationChangeDto Change(string field, string? before, string? after) => new(field, before, after);
    private static PluginHandlerDto Map(PluginTypeRow row) => new(row.Id, HandlerKind.WorkflowActivity, row.TypeName, row.Name,
        row.FriendlyName, row.Description, row.WorkflowActivityGroupName, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, [], [], [], row.AssemblyId, row.SolutionDisplayName);
    private static bool WorkflowActivityMatches(PluginTypeRow row, WorkflowActivityDraftDto draft, long expectedVersion) =>
        row.VersionNumber > expectedVersion
        && row.Name == draft.Name && row.FriendlyName == draft.FriendlyName
        && row.WorkflowActivityGroupName == draft.WorkflowActivityGroupName
        && row.Description == draft.Description;

    private sealed record WorkflowActivityMutationState(
        PluginTypeRow Activity,
        IReadOnlyList<PluginHandlerDependencyRow> Dependencies);
}
