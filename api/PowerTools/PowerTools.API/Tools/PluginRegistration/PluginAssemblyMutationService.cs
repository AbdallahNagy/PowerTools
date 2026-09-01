using System.Security.Cryptography;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginAssemblyMutationService(
    IPluginAssemblyInspector inspector,
    PluginRegistrationPreflightService preflight,
    PluginRegistrationCatalogService catalogService,
    IVerifiedMutationExecutor? verifiedMutationExecutor = null)
{
    private readonly IVerifiedMutationExecutor mutationExecutor = verifiedMutationExecutor ?? new VerifiedMutationExecutor();
    public async Task<AssemblyMutationPreflightDto> CreatePreflightAsync(
        IPluginRegistrationGateway gateway,
        string environment,
        AssemblyMutationDraftDto submittedDraft,
        Stream content,
        long length,
        IReadOnlyDictionary<string, bool> capabilities,
        CancellationToken cancellationToken)
    {
        var inspection = await inspector.InspectAsync(content, submittedDraft.FileName, length, cancellationToken);
        var draft = Normalize(submittedDraft, inspection, capabilities);
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var target = FindTarget(rows, draft);
        EnsureExpectedTarget(draft, target, rows);
        var impactState = await BuildImpactStateAsync(gateway, rows, target, draft, inspection, cancellationToken);
        var impact = impactState.Impact;
        var request = BuildRequest(environment, draft, rows, impactState.Target, impact, capabilities);
        var changes = BuildChanges(impactState.Target, inspection);
        var plan = preflight.CreatePlan(request, changes,
            new MutationImpactDto(impact.OwnedStepsAndImages, impact.Dependencies, impact.OwnedStepsAndImages),
            impact.Warnings, impact.Blockers,
            impact.Blockers.Count > 0
                ? new ConfirmationRequirementDto("blocked", "Resolve every blocker before executing.")
                : new ConfirmationRequirementDto("explicit", "Confirm this assembly mutation."));
        return new AssemblyMutationPreflightDto(draft, plan, impact);
    }

    public async Task<AssemblyMutationExecutionDto> ExecuteAsync(
        IPluginRegistrationGateway gateway,
        string environment,
        string token,
        AssemblyMutationDraftDto submittedDraft,
        Stream content,
        long length,
        IReadOnlyDictionary<string, bool> capabilities,
        CancellationToken cancellationToken)
    {
        var bytes = await ReadContentAsync(content, length, cancellationToken);
        try
        {
            var inspection = await inspector.InspectAsync(new MemoryStream(bytes, writable: false), submittedDraft.FileName, bytes.Length, cancellationToken);
            var draft = Normalize(submittedDraft, inspection, capabilities);
            var submittedRows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
            var submittedTarget = FindTarget(submittedRows, draft);
            EnsureExpectedTarget(draft, submittedTarget, submittedRows);
            var submittedImpactState = await BuildImpactStateAsync(gateway, submittedRows, submittedTarget, draft, inspection, cancellationToken);
            EnsureImpactIsExecutable(submittedImpactState.Impact);
            await preflight.ValidateExecutionAsync(token,
                BuildRequest(environment, draft, submittedRows, submittedImpactState.Target, submittedImpactState.Impact, capabilities),
                async ct =>
                {
                    var current = await gateway.RetrieveCatalogRowsAsync(ct);
                    var target = FindTarget(current, draft);
                    EnsureExpectedTarget(draft, target, current);
                    var impactState = await BuildImpactStateAsync(gateway, current, target, draft, inspection, ct);
                    EnsureImpactIsExecutable(impactState.Impact);
                    return BuildRequest(environment, draft, current, impactState.Target, impactState.Impact, capabilities);
                }, cancellationToken);

            var command = new PluginAssemblyMutationCommand(draft.AssemblyId, inspection, bytes, draft.RequestedIsolationMode, draft.RequestedSourceType);
            Guid? assemblyId = draft.AssemblyId;
            PluginAssemblyDto? verified = null;
            async Task<bool> Verify(CancellationToken ct)
            {
                if (assemblyId is null) return false;
                var catalog = await catalogService.RetrieveCatalogAsync(gateway, ct);
                verified = catalog.Assemblies.SingleOrDefault(assembly => assembly.Id == assemblyId);
                var rows = await gateway.RetrieveCatalogRowsAsync(ct);
                var verifiedRow = rows.Assemblies.SingleOrDefault(assembly => assembly.Id == assemblyId);
                var verifiedSnapshot = await LoadImpactSnapshotAsync(gateway, verifiedRow,
                    rows.Types.Where(type => type.AssemblyId == assemblyId).ToArray(), ct);
                return verified is not null && AssemblyMatches(verified, verifiedSnapshot, draft, inspection);
            }
            async Task<MutationReconciliationResult> Reconcile(CancellationToken ct)
            {
                var rows = await gateway.RetrieveCatalogRowsAsync(ct);
                var candidate = draft.AssemblyId is { } targetId
                    ? rows.Assemblies.SingleOrDefault(value => value.Id == targetId)
                    : rows.Assemblies.SingleOrDefault(value => string.Equals(value.Name, inspection.Identity.Name, StringComparison.Ordinal));
                if (candidate is null)
                    return draft.Operation == "register" ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
                assemblyId = candidate.Id;
                if (await Verify(ct)) return MutationReconciliationResult.Succeeded();
                return submittedImpactState.Target is { } before && candidate.VersionNumber == before.VersionNumber
                    ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
            }
            var execution = await mutationExecutor.ExecuteAsync(async ct =>
            {
                assemblyId = draft.Operation == "register"
                    ? await gateway.RegisterAssemblyAsync(command, ct)
                    : await gateway.UpdateAssemblyAsync(command, ct);
            }, Reconcile, Verify, cancellationToken);
            var success = execution.Outcome is "succeededAndVerified" or "reconciledAfterCommunicationFailure";
            return new AssemblyMutationExecutionDto(execution.Outcome, success, verified, execution.Problem);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private static AssemblyMutationDraftDto Normalize(AssemblyMutationDraftDto submitted, AssemblyInspectionDto inspection, IReadOnlyDictionary<string, bool> capabilities)
    {
        var isUpdate = string.Equals(submitted.Operation, "update", StringComparison.Ordinal);
        if (isUpdate != submitted.AssemblyId.HasValue)
            throw new ArgumentException("The assembly operation and target do not match.");
        if (!isUpdate && !string.Equals(submitted.Operation, "register", StringComparison.Ordinal))
            throw new ArgumentException("The assembly operation is not supported.");
        var allowsNonDefault = capabilities.TryGetValue("onPremisesAssemblyOptions", out var allowed) && allowed;
        if (!allowsNonDefault && (submitted.RequestedIsolationMode != 2 || submitted.RequestedSourceType != 0))
            throw new ArgumentException("Online assembly registration requires Sandbox isolation and Database storage.");
        return submitted with { FileName = Path.GetFileName(submitted.FileName), Inspection = inspection,
            RequestedIsolationMode = allowsNonDefault ? submitted.RequestedIsolationMode : 2,
            RequestedSourceType = allowsNonDefault ? submitted.RequestedSourceType : 0 };
    }

    private static MutationPreflightRequest BuildRequest(string environment, AssemblyMutationDraftDto draft, PluginRegistrationRows rows, PluginAssemblyRow? target, AssemblyMutationImpactDto impact, IReadOnlyDictionary<string, bool> capabilities) =>
        new(environment, $"assemblies.{draft.Operation}", draft.AssemblyId,
            new AssemblyMutationPlanRequest(draft with { Inspection = draft.Inspection with { Diagnostics = [], Plugins = [], WorkflowActivities = [] } }, impact),
            BuildVersions(rows, target), draft.Inspection.Sha256, capabilities);

    private static IReadOnlyDictionary<Guid, long> BuildVersions(PluginRegistrationRows rows, PluginAssemblyRow? target)
    {
        var versions = new Dictionary<Guid, long>();
        if (target is not null) versions[target.Id] = target.VersionNumber;
        foreach (var type in TypesFor(rows, target)) versions[type.Id] = type.VersionNumber;
        return versions;
    }

    private static PluginAssemblyRow? FindTarget(PluginRegistrationRows rows, AssemblyMutationDraftDto draft) =>
        draft.AssemblyId is { } id ? rows.Assemblies.SingleOrDefault(assembly => assembly.Id == id) : null;
    private static void EnsureExpectedTarget(AssemblyMutationDraftDto draft, PluginAssemblyRow? target, PluginRegistrationRows rows)
    {
        if (draft.Operation != "update") return;
        if (target is null) throw new ArgumentException("The selected assembly no longer exists.");
        if (draft.ExpectedAssemblyVersionNumber != target.VersionNumber)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        foreach (var expected in draft.ExpectedHandlerVersionNumbers)
        {
            var current = rows.Types.SingleOrDefault(type => type.Id == expected.Key);
            if (current is null || current.AssemblyId != target.Id || current.VersionNumber != expected.Value)
                throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        }
    }
    private static IReadOnlyList<PluginTypeRow> TypesFor(PluginRegistrationRows rows, PluginAssemblyRow? assembly) =>
        assembly is null ? [] : rows.Types.Where(type => type.AssemblyId == assembly.Id).ToArray();
    private static void EnsureImpactIsExecutable(AssemblyMutationImpactDto impact)
    {
        if (impact.Blockers.Count > 0)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
    }
    private static IReadOnlyList<MutationChangeDto> BuildChanges(PluginAssemblyRow? existing, AssemblyInspectionDto inspection) =>
        [new("identity", existing?.Name, inspection.Identity.Name), new("version", existing?.Version, inspection.Identity.Version), new("sha256", null, inspection.Sha256)];
    private static bool TypesMatch(PluginAssemblyDto assembly, AssemblyInspectionDto inspection) =>
        assembly.Handlers.Where(handler => handler.Kind == HandlerKind.Plugin).Select(handler => handler.TypeName).Order()
            .SequenceEqual(inspection.Plugins.Select(plugin => plugin.TypeName).Order(), StringComparer.Ordinal)
        && assembly.Handlers.Where(handler => handler.Kind == HandlerKind.WorkflowActivity).Select(handler => handler.TypeName).Order()
            .SequenceEqual(inspection.WorkflowActivities.Select(activity => activity.TypeName).Order(), StringComparer.Ordinal);
    private static bool AssemblyMatches(PluginAssemblyDto assembly, LoadedImpactSnapshot snapshot,
        AssemblyMutationDraftDto draft, AssemblyInspectionDto inspection) =>
        string.Equals(assembly.Name, inspection.Identity.Name, StringComparison.Ordinal)
        && string.Equals(assembly.Version, inspection.Identity.Version, StringComparison.Ordinal)
        && string.Equals(assembly.Culture ?? "neutral", inspection.Identity.Culture, StringComparison.Ordinal)
        && string.Equals(assembly.PublicKeyToken ?? "", inspection.Identity.PublicKeyToken, StringComparison.Ordinal)
        && assembly.IsolationMode == draft.RequestedIsolationMode
        && assembly.SourceType == draft.RequestedSourceType
        && assembly.VersionNumber > (draft.ExpectedAssemblyVersionNumber ?? 0)
        && snapshot.IsComplete
        && string.Equals(snapshot.Sha256, inspection.Sha256, StringComparison.OrdinalIgnoreCase)
        && snapshot.Size == inspection.Size
        && TypesMatch(assembly, inspection);
    private static async Task<byte[]> ReadContentAsync(Stream content, long length, CancellationToken cancellationToken)
    {
        if (length <= 0 || length > PluginAssemblyInspector.MaxAssemblyBytes) throw new ArgumentException("The assembly content is invalid.");
        using var memory = new MemoryStream((int)length);
        await content.CopyToAsync(memory, cancellationToken);
        return memory.ToArray();
    }

    private async Task<LoadedImpactSnapshot> LoadImpactSnapshotAsync(
        IPluginRegistrationGateway gateway,
        PluginAssemblyRow? assembly,
        IReadOnlyList<PluginTypeRow> handlers,
        CancellationToken cancellationToken)
    {
        if (assembly is null) return new(null, null, [], [], true);
        var snapshot = await gateway.RetrieveAssemblyImpactSnapshotAsync(assembly, handlers, cancellationToken);
        try
        {
            if (!snapshot.IsComplete || snapshot.Content.Length == 0)
                return new(null, null, snapshot.Dependencies, [], false);
            AssemblyInspectionDto oldInspection;
            try
            {
                oldInspection = await inspector.InspectAsync(new MemoryStream(snapshot.Content, writable: false),
                    $"{assembly.Name}.dll", snapshot.Content.Length, cancellationToken);
            }
            catch (AssemblyInspectionValidationException)
            {
                return new(null, null, snapshot.Dependencies, [], false);
            }
            var arguments = oldInspection.WorkflowActivities.SelectMany(activity =>
            {
                var handler = handlers.SingleOrDefault(type => type.IsWorkflowActivity && type.TypeName == activity.TypeName);
                return handler is null ? [] : activity.Arguments.Select(argument => new PluginWorkflowArgumentRow(
                    handler.Id, argument.Name, argument.TypeName, argument.Direction, argument.IsRequired, argument.ReferenceTarget));
            }).ToArray();
            return new(oldInspection.Sha256, oldInspection.Size, snapshot.Dependencies, arguments, true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(snapshot.Content);
        }
    }

    private sealed record LoadedImpactSnapshot(
        string? Sha256,
        long? Size,
        IReadOnlyList<PluginHandlerDependencyRow> Dependencies,
        IReadOnlyList<PluginWorkflowArgumentRow> WorkflowArguments,
        bool IsComplete);

    private async Task<AssemblyMutationImpactState> BuildImpactStateAsync(
        IPluginRegistrationGateway gateway,
        PluginRegistrationRows rows,
        PluginAssemblyRow? target,
        AssemblyMutationDraftDto draft,
        AssemblyInspectionDto inspection,
        CancellationToken cancellationToken)
    {
        var existingTypes = TypesFor(rows, target);
        var snapshot = await LoadImpactSnapshotAsync(gateway, target, existingTypes, cancellationToken);
        var targetWithSource = target is null
            ? null
            : target with { SourceHash = snapshot.Sha256, ContentSize = snapshot.Size };
        var impact = PluginAssemblyDiff.Compare(targetWithSource, existingTypes, rows.Steps, rows.Images,
            inspection, snapshot.Dependencies, snapshot.WorkflowArguments, snapshot.IsComplete) with
        {
            CurrentIsolationMode = draft.RequestedIsolationMode,
            CurrentSourceType = draft.RequestedSourceType
        };
        return new(targetWithSource, impact);
    }

    private sealed record AssemblyMutationImpactState(
        PluginAssemblyRow? Target,
        AssemblyMutationImpactDto Impact);

    private sealed record AssemblyMutationPlanRequest(
        AssemblyMutationDraftDto Draft,
        AssemblyMutationImpactDto Impact);
}
