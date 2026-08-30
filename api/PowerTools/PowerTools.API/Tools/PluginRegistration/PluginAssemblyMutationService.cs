using System.Security.Cryptography;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginAssemblyMutationService(
    IPluginAssemblyInspector inspector,
    PluginRegistrationPreflightService preflight,
    PluginRegistrationCatalogService catalogService)
{
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
        var existingTypes = TypesFor(rows, target);
        var snapshot = await LoadImpactSnapshotAsync(gateway, target, existingTypes, cancellationToken);
        target = target is null ? null : target with { SourceHash = snapshot.Sha256, ContentSize = snapshot.Size };
        var impact = PluginAssemblyDiff.Compare(target, existingTypes, rows.Steps, rows.Images,
            inspection, snapshot.Dependencies, snapshot.WorkflowArguments, snapshot.IsComplete) with
        {
            CurrentIsolationMode = draft.RequestedIsolationMode,
            CurrentSourceType = draft.RequestedSourceType
        };
        var request = BuildRequest(environment, draft, rows, target, capabilities);
        var changes = BuildChanges(target, inspection);
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
            EnsureExpectedTarget(draft, FindTarget(submittedRows, draft), submittedRows);
            await preflight.ValidateExecutionAsync(token,
                BuildRequest(environment, draft, submittedRows, FindTarget(submittedRows, draft), capabilities),
                async ct =>
                {
                    var current = await gateway.RetrieveCatalogRowsAsync(ct);
                    var target = FindTarget(current, draft);
                    EnsureExpectedTarget(draft, target, current);
                    return BuildRequest(environment, draft, current, target, capabilities);
                }, cancellationToken);

            var command = new PluginAssemblyMutationCommand(draft.AssemblyId, inspection, bytes, draft.RequestedIsolationMode, draft.RequestedSourceType);
            var assemblyId = draft.Operation == "register"
                ? await gateway.RegisterAssemblyAsync(command, cancellationToken)
                : await gateway.UpdateAssemblyAsync(command, cancellationToken);
            var catalog = await catalogService.RetrieveCatalogAsync(gateway, cancellationToken);
            var verified = catalog.Assemblies.SingleOrDefault(assembly => assembly.Id == assemblyId);
            var verifiedRow = (await gateway.RetrieveCatalogRowsAsync(cancellationToken)).Assemblies
                .SingleOrDefault(assembly => assembly.Id == assemblyId);
            var verifiedSnapshot = await LoadImpactSnapshotAsync(gateway, verifiedRow, [], cancellationToken);
            if (verified is null || !string.Equals(verified.Name, inspection.Identity.Name, StringComparison.Ordinal)
                || !string.Equals(verified.Version, inspection.Identity.Version, StringComparison.Ordinal)
                || !string.Equals(verified.Culture ?? "neutral", inspection.Identity.Culture, StringComparison.Ordinal)
                || !string.Equals(verified.PublicKeyToken ?? "", inspection.Identity.PublicKeyToken, StringComparison.Ordinal)
                || verified.IsolationMode != draft.RequestedIsolationMode
                || verified.SourceType != draft.RequestedSourceType
                || !verifiedSnapshot.IsComplete
                || !string.Equals(verifiedSnapshot.Sha256, inspection.Sha256, StringComparison.OrdinalIgnoreCase)
                || verifiedSnapshot.Size != inspection.Size
                || !TypesMatch(verified, inspection))
                return new AssemblyMutationExecutionDto("verificationFailed", false, verified);
            return new AssemblyMutationExecutionDto("succeededAndVerified", true, verified);
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

    private static MutationPreflightRequest BuildRequest(string environment, AssemblyMutationDraftDto draft, PluginRegistrationRows rows, PluginAssemblyRow? target, IReadOnlyDictionary<string, bool> capabilities) =>
        new(environment, $"assemblies.{draft.Operation}", draft.AssemblyId, draft with { Inspection = draft.Inspection with { Diagnostics = [], Plugins = [], WorkflowActivities = [] } },
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
    private static IReadOnlyList<MutationChangeDto> BuildChanges(PluginAssemblyRow? existing, AssemblyInspectionDto inspection) =>
        [new("identity", existing?.Name, inspection.Identity.Name), new("version", existing?.Version, inspection.Identity.Version), new("sha256", null, inspection.Sha256)];
    private static bool TypesMatch(PluginAssemblyDto assembly, AssemblyInspectionDto inspection) =>
        assembly.Handlers.Where(handler => handler.Kind == HandlerKind.Plugin).Select(handler => handler.TypeName).Order()
            .SequenceEqual(inspection.Plugins.Select(plugin => plugin.TypeName).Order(), StringComparer.Ordinal)
        && assembly.Handlers.Where(handler => handler.Kind == HandlerKind.WorkflowActivity).Select(handler => handler.TypeName).Order()
            .SequenceEqual(inspection.WorkflowActivities.Select(activity => activity.TypeName).Order(), StringComparer.Ordinal);
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
}
