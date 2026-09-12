using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class PluginImageMutationService(PluginImageValidator validator, PluginRegistrationPreflightService preflight,
    IVerifiedMutationExecutor? verifiedMutationExecutor = null)
{
    private readonly IVerifiedMutationExecutor mutationExecutor = verifiedMutationExecutor ?? new VerifiedMutationExecutor();
    private static readonly HashSet<string> Operations = new(["create", "update", "unregister"], StringComparer.Ordinal);

    public async Task<ImageMutationPreflightDto> CreatePreflightAsync(IPluginRegistrationGateway gateway,
        string environment, string operation, ImageDraftDto submitted, CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var current = await ReadAndValidateAsync(gateway, operation, targetId, submitted, cancellationToken);
        var confirmation = operation == "unregister"
            ? new ConfirmationRequirementDto("typedName", $"Type {current.State.ImageName} to unregister this image.", current.State.ImageName)
            : new ConfirmationRequirementDto("explicit", "Confirm every displayed image change.");
        var before = current.CurrentRow is null ? null : Before(current.CurrentRow, current.State.SupportedMessagePropertyName);
        var dependencySnapshot = operation == "unregister" ? DependencySnapshot(current.State.Dependencies) : [];
        var dependencies = dependencySnapshot.Select(x => $"{x.ComponentTypeLabel}: {x.Name}").ToArray();
        var blockers = current.Validation.Blockers.Concat(operation == "unregister" ? current.State.Dependencies.Select(x =>
            new MutationBlockerDto("dependency", $"{x.ComponentTypeLabel} '{x.Name}' depends on this image.")) : []).ToArray();
        var plan = preflight.CreatePlan(Request(environment, operation, targetId, current.Validation.Draft, dependencySnapshot),
            Changes(before, current.Validation.PublicAfter), new MutationImpactDto([current.Validation.PublicAfter.Name], dependencies, []),
            current.Validation.Warnings, blockers, confirmation);
        return new(current.Validation.Draft, plan, before, current.Validation.PublicAfter);
    }

    public async Task<ImageMutationExecutionDto> ExecuteAsync(IPluginRegistrationGateway gateway, string environment,
        string operation, string token, ImageDraftDto submitted, string? typedName, CancellationToken cancellationToken)
    {
        var targetId = TargetId(operation, submitted);
        var initial = await ReadAndValidateAsync(gateway, operation, targetId, submitted, cancellationToken);
        EnsureExecutable(initial.Validation.Blockers, operation == "unregister" ? initial.State.Dependencies : []);
        if (operation == "unregister" && !string.Equals(typedName, initial.State.ImageName, StringComparison.Ordinal))
            throw new ArgumentException("The typed image name does not match exactly.");
        var dependencySnapshot = operation == "unregister" ? DependencySnapshot(initial.State.Dependencies) : [];
        await preflight.ValidateExecutionAsync(token, Request(environment, operation, targetId, initial.Validation.Draft, dependencySnapshot), async ct =>
        {
            var fresh = await ReadAndValidateAsync(gateway, operation, targetId, submitted, ct);
            EnsureExecutable(fresh.Validation.Blockers, operation == "unregister" ? fresh.State.Dependencies : []);
            var freshDependencies = operation == "unregister" ? DependencySnapshot(fresh.State.Dependencies) : [];
            return Request(environment, operation, targetId, fresh.Validation.Draft, freshDependencies);
        }, cancellationToken);

        Guid? id = targetId;
        PluginImageDto? verifiedImage = null;
        async Task<bool> Verify(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            var row = id is null ? null : rows.Images.SingleOrDefault(item => item.Id == id);
            verifiedImage = row is null ? null : Map(row);
            if (operation == "unregister") return row is null;
            var parent = rows.Steps.SingleOrDefault(item => item.Id == submitted.StepId);
            var state = row is null ? null : await gateway.RetrieveImagePreflightStateAsync(submitted.StepId, row.Id,
                initial.Validation.Draft, ct);
            return row is not null && parent is not null
                && parent.VersionNumber > submitted.ExpectedVersions[submitted.StepId]
                && state is not null && ImageMatches(row, state, submitted.StepId, initial.Validation);
        }
        async Task<MutationReconciliationResult> Reconcile(CancellationToken ct)
        {
            var rows = await gateway.RetrieveCatalogRowsAsync(ct);
            if (operation == "unregister")
                return rows.Images.All(item => item.Id != targetId)
                    ? MutationReconciliationResult.Succeeded() : MutationReconciliationResult.Rejected();
            if (operation == "create")
            {
                var candidates = rows.Images.Where(item => item.PluginStepId == submitted.StepId
                    && string.Equals(item.EntityAlias, initial.Validation.Draft.Alias, StringComparison.Ordinal)).ToArray();
                if (candidates.Length == 0) return MutationReconciliationResult.Rejected();
                if (candidates.Length != 1) return MutationReconciliationResult.Contradictory();
                id = candidates[0].Id;
                return await Verify(ct) ? MutationReconciliationResult.Succeeded() : MutationReconciliationResult.Contradictory();
            }
            var target = rows.Images.SingleOrDefault(item => item.Id == targetId);
            if (target is null) return MutationReconciliationResult.Contradictory();
            id = target.Id;
            if (await Verify(ct)) return MutationReconciliationResult.Succeeded();
            return target.VersionNumber == submitted.ExpectedVersions[target.Id]
                ? MutationReconciliationResult.Rejected() : MutationReconciliationResult.Contradictory();
        }
        var execution = await mutationExecutor.ExecuteAsync(async ct =>
        {
            id = await gateway.MutateImageAsync(new(operation, targetId, initial.Validation.Draft,
                submitted.ExpectedVersions[submitted.StepId], targetId is { } imageId ? submitted.ExpectedVersions[imageId] : null), ct);
        }, Reconcile, Verify, cancellationToken);
        var success = execution.Outcome is "succeededAndVerified" or "reconciledAfterCommunicationFailure";
        return new(execution.Outcome, success, verifiedImage, execution.Problem);
    }

    private async Task<ValidatedState> ReadAndValidateAsync(IPluginRegistrationGateway gateway, string operation, Guid? targetId,
        ImageDraftDto draft, CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        foreach (var expected in draft.ExpectedVersions)
        {
            var actual = rows.Steps.Where(item => item.Id == expected.Key).Select(item => (long?)item.VersionNumber)
                .Concat(rows.Images.Where(item => item.Id == expected.Key).Select(item => (long?)item.VersionNumber)).SingleOrDefault();
            if (actual != expected.Value) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        }
        var state = await gateway.RetrieveImagePreflightStateAsync(draft.StepId, targetId, draft, cancellationToken);
        var currentRow = targetId is { } id ? rows.Images.SingleOrDefault(item => item.Id == id) : null;
        if (targetId.HasValue && (currentRow is null || currentRow.PluginStepId != draft.StepId))
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        var effective = operation == "unregister" && currentRow is not null ? draft with
        {
            ImageType = ImageType(currentRow.ImageTypeLabel),
            Alias = currentRow.EntityAlias ?? currentRow.Name,
            Attributes = currentRow.Attributes,
            MessagePropertyName = state.SupportedMessagePropertyName
        } : operation == "update" && currentRow is not null && string.IsNullOrWhiteSpace(draft.Alias)
            ? draft with { Alias = currentRow.EntityAlias ?? currentRow.Name }
            : draft;
        var validation = validator.Validate(effective, new(state.TargetImageId, state.ImageName, state.Message, state.Stage,
            state.PrimaryTable, state.SupportedMessagePropertyName, state.AvailableAttributes, state.DuplicateAlias,
            state.IsManaged, state.IsCustomizable, state.StepVersion, state.CurrentImageVersion, state.StepId)
            { ParentIsManaged = state.ParentIsManaged, ParentIsCustomizable = state.ParentIsCustomizable });
        return new(state, validation, currentRow);
    }
    private static Guid? TargetId(string operation, ImageDraftDto draft)
    {
        if (!Operations.Contains(operation)) throw new ArgumentException("The image operation is not supported.");
        var ids = draft.ExpectedVersions.Keys.Where(id => id != draft.StepId).ToArray();
        if (operation == "create") return null;
        return ids.Length == 1 ? ids[0] : throw new ArgumentException("Exactly one target image version is required.");
    }
    private static MutationPreflightRequest Request(string environment, string operation, Guid? targetId, ImageDraftDto draft, IReadOnlyList<ComponentDependencyDto> dependencies) =>
        new(environment, $"images.{operation}", targetId, new { Draft = draft, Dependencies = dependencies }, draft.ExpectedVersions, null, new Dictionary<string, bool>());
    private static ComponentDependencyDto[] DependencySnapshot(IReadOnlyList<ComponentDependencyDto> dependencies) => dependencies
        .OrderBy(x => x.ComponentId).ThenBy(x => x.ComponentTypeLabel, StringComparer.Ordinal).ThenBy(x => x.Name, StringComparer.Ordinal)
        .Select(x => new ComponentDependencyDto(x.ComponentId, x.Name, x.ComponentTypeLabel, x.SolutionDisplayName,
            x.IsManaged, x.IsCustomizable, x.VersionNumber)).ToArray();
    private static void EnsureExecutable(IReadOnlyList<MutationBlockerDto> blockers, IReadOnlyList<ComponentDependencyDto> dependencies)
    {
        if (blockers.Count > 0 || dependencies.Count > 0) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
    }
    private static ImagePublicValuesDto Before(PluginImageRow row, string messagePropertyName) =>
        new(row.Name, ImageType(row.ImageTypeLabel), row.EntityAlias ?? row.Name, messagePropertyName, row.Attributes);
    private static IReadOnlyList<MutationChangeDto> Changes(ImagePublicValuesDto? before, ImagePublicValuesDto after)
    {
        var pairs = new (string Field, string? Before, string After)[] {
            ("name", before?.Name, after.Name), ("imageType", before?.ImageType.ToString(), after.ImageType.ToString()),
            ("alias", before?.Alias, after.Alias), ("messagePropertyName", before?.MessagePropertyName, after.MessagePropertyName),
            ("attributes", before is null ? null : string.Join(',', before.Attributes), string.Join(',', after.Attributes)) };
        return pairs.Where(x => before is null || !string.Equals(x.Before, x.After, StringComparison.Ordinal))
            .Select(x => new MutationChangeDto(x.Field, x.Before, x.After)).ToArray();
    }
    private static int ImageType(string label) => label.Contains("Both", StringComparison.OrdinalIgnoreCase) ? 2
        : label.Contains("Post", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
    private static bool TypeMatches(string label, int type) => ImageType(label) == type;
    private static bool ImageMatches(PluginImageRow row, PluginImagePreflightState state, Guid stepId,
        PluginImageValidationResult validation) =>
        row.PluginStepId == stepId
        && row.VersionNumber > (validation.Draft.ExpectedVersions.TryGetValue(row.Id, out var expectedVersion) ? expectedVersion : 0)
        && string.Equals(row.Name, validation.PublicAfter.Name, StringComparison.Ordinal)
        && string.Equals(row.EntityAlias, validation.Draft.Alias, StringComparison.Ordinal)
        && string.Equals(state.SupportedMessagePropertyName, validation.Draft.MessagePropertyName, StringComparison.OrdinalIgnoreCase)
        && row.Attributes.Order(StringComparer.OrdinalIgnoreCase)
            .SequenceEqual(validation.Draft.Attributes.Order(StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase)
        && TypeMatches(row.ImageTypeLabel, validation.Draft.ImageType);
    private static PluginImageDto Map(PluginImageRow row) => new(row.Id, row.PluginStepId ?? Guid.Empty, row.Name,
        row.Description, row.ImageTypeLabel, row.EntityAlias, row.Attributes, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, row.SolutionDisplayName);
    private sealed record ValidatedState(PluginImagePreflightState State, PluginImageValidationResult Validation, PluginImageRow? CurrentRow);
}
