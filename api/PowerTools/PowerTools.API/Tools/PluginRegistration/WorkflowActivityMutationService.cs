using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class WorkflowActivityMutationService(PluginRegistrationPreflightService preflight)
{
    public async Task<WorkflowActivityMutationPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, WorkflowActivityDraftDto draft, CancellationToken cancellationToken)
    {
        var current = await ReadCurrentAsync(gateway, draft, cancellationToken);
        var blockers = Blockers(current);
        var after = Map(current with { Name = draft.Name, FriendlyName = draft.FriendlyName,
            WorkflowActivityGroupName = draft.WorkflowActivityGroupName, Description = draft.Description });
        var plan = preflight.CreatePlan(Request(environment, draft, current), Changes(Map(current), after),
            new MutationImpactDto([current.TypeName], [], []), [], blockers,
            new ConfirmationRequirementDto("explicit", "Confirm every displayed workflow activity registration change."));
        return new(draft, plan, Map(current), after);
    }

    public async Task<WorkflowActivityMutationExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway, string environment,
        WorkflowActivityDraftDto draft, string token, CancellationToken cancellationToken)
    {
        var current = await ReadCurrentAsync(gateway, draft, cancellationToken);
        if (Blockers(current).Count > 0) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        await preflight.ValidateExecutionAsync(token, Request(environment, draft, current), async ct =>
        {
            var fresh = await ReadCurrentAsync(gateway, draft, ct);
            if (Blockers(fresh).Count > 0) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
            return Request(environment, draft, fresh);
        }, cancellationToken);
        await gateway.MutateWorkflowActivityAsync(new(draft.WorkflowActivityId, draft.Name, draft.FriendlyName,
            draft.WorkflowActivityGroupName, draft.Description, current.VersionNumber), cancellationToken);
        var verified = await ReadCurrentAsync(gateway, draft with { ExpectedVersions = new Dictionary<Guid, long>() }, cancellationToken);
        var match = verified.Name == draft.Name && verified.FriendlyName == draft.FriendlyName
            && verified.WorkflowActivityGroupName == draft.WorkflowActivityGroupName && verified.Description == draft.Description;
        return new(match ? "succeededAndVerified" : "verificationFailed", match, match ? Map(verified) : null);
    }

    private static async Task<PluginTypeRow> ReadCurrentAsync(IPluginRegistrationGateway gateway, WorkflowActivityDraftDto draft, CancellationToken cancellationToken)
    {
        var current = (await gateway.RetrieveCatalogRowsAsync(cancellationToken)).Types.SingleOrDefault(type =>
            type.Id == draft.WorkflowActivityId && type.IsWorkflowActivity)
            ?? throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        if (draft.ExpectedVersions.TryGetValue(current.Id, out var expected) && expected != current.VersionNumber)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        return current;
    }
    private static IReadOnlyList<MutationBlockerDto> Blockers(PluginTypeRow current) =>
        current.IsManaged ? [new("workflow_activity_managed", "Managed workflow activities cannot be updated.")]
        : !current.IsCustomizable ? [new("workflow_activity_not_customizable", "This workflow activity is not customizable.")] : [];
    private static MutationPreflightRequest Request(string environment, WorkflowActivityDraftDto draft, PluginTypeRow current) =>
        new(environment, "workflow-activities.update", current.Id, new { Draft = draft },
            new Dictionary<Guid, long> { [current.Id] = current.VersionNumber }, null, new Dictionary<string, bool>());
    private static IReadOnlyList<MutationChangeDto> Changes(PluginHandlerDto before, PluginHandlerDto after) => new[] {
        Change("name", before.Name, after.Name), Change("friendlyName", before.FriendlyName, after.FriendlyName),
        Change("workflowActivityGroupName", before.WorkflowActivityGroupName, after.WorkflowActivityGroupName),
        Change("description", before.Description, after.Description) }.Where(change => change.Before != change.After).ToArray();
    private static MutationChangeDto Change(string field, string? before, string? after) => new(field, before, after);
    private static PluginHandlerDto Map(PluginTypeRow row) => new(row.Id, HandlerKind.WorkflowActivity, row.TypeName, row.Name,
        row.FriendlyName, row.Description, row.WorkflowActivityGroupName, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, [], [], [], row.AssemblyId, row.SolutionDisplayName);
}
