using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginImageMutationService(PluginImageValidator validator, PluginRegistrationPreflightService preflight)
{
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
        var dependencies = operation == "unregister" ? current.State.Dependencies.Select(x => $"{x.ComponentTypeLabel}: {x.Name}").ToArray() : [];
        var blockers = current.Validation.Blockers.Concat(operation == "unregister" ? current.State.Dependencies.Select(x =>
            new MutationBlockerDto("dependency", $"{x.ComponentTypeLabel} '{x.Name}' depends on this image.")) : []).ToArray();
        var plan = preflight.CreatePlan(Request(environment, operation, targetId, current.Validation.Draft, dependencies),
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
        var dependencies = operation == "unregister" ? initial.State.Dependencies.Select(x => $"{x.ComponentTypeLabel}: {x.Name}").ToArray() : [];
        await preflight.ValidateExecutionAsync(token, Request(environment, operation, targetId, initial.Validation.Draft, dependencies), async ct =>
        {
            var fresh = await ReadAndValidateAsync(gateway, operation, targetId, submitted, ct);
            EnsureExecutable(fresh.Validation.Blockers, operation == "unregister" ? fresh.State.Dependencies : []);
            var freshDependencies = operation == "unregister" ? fresh.State.Dependencies.Select(x => $"{x.ComponentTypeLabel}: {x.Name}").ToArray() : [];
            return Request(environment, operation, targetId, fresh.Validation.Draft, freshDependencies);
        }, cancellationToken);

        var id = await gateway.MutateImageAsync(new(operation, targetId, initial.Validation.Draft,
            submitted.ExpectedVersions[submitted.StepId], targetId is { } imageId ? submitted.ExpectedVersions[imageId] : null), cancellationToken);
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var row = rows.Images.SingleOrDefault(item => item.Id == id);
        if (operation == "unregister")
            return row is null ? new("succeededAndVerified", true, null) : new("verificationFailed", false, Map(row));
        var parent = rows.Steps.SingleOrDefault(item => item.Id == submitted.StepId);
        var verifiedState = row is null ? null : await gateway.RetrieveImagePreflightStateAsync(submitted.StepId, id,
            initial.Validation.Draft, cancellationToken);
        if (row is null || parent is null || parent.VersionNumber <= submitted.ExpectedVersions[submitted.StepId]
            || verifiedState is null || row.PluginStepId != submitted.StepId
            || !string.Equals(row.Name, initial.Validation.PublicAfter.Name, StringComparison.Ordinal)
            || !string.Equals(row.EntityAlias, initial.Validation.Draft.Alias, StringComparison.Ordinal)
            || !string.Equals(verifiedState.SupportedMessagePropertyName, initial.Validation.Draft.MessagePropertyName, StringComparison.OrdinalIgnoreCase)
            || !row.Attributes.Order(StringComparer.OrdinalIgnoreCase).SequenceEqual(initial.Validation.Draft.Attributes, StringComparer.OrdinalIgnoreCase)
            || !TypeMatches(row.ImageTypeLabel, initial.Validation.Draft.ImageType))
            return new("verificationFailed", false, row is null ? null : Map(row));
        return new("succeededAndVerified", true, Map(row));
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
    private static MutationPreflightRequest Request(string environment, string operation, Guid? targetId, ImageDraftDto draft, IReadOnlyList<string> dependencies) =>
        new(environment, $"images.{operation}", targetId, new { Draft = draft, Dependencies = dependencies }, draft.ExpectedVersions, null, new Dictionary<string, bool>());
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
    private static PluginImageDto Map(PluginImageRow row) => new(row.Id, row.PluginStepId ?? Guid.Empty, row.Name,
        row.Description, row.ImageTypeLabel, row.EntityAlias, row.Attributes, row.IsManaged, row.IsCustomizable,
        row.VersionNumber, row.SolutionDisplayName);
    private sealed record ValidatedState(PluginImagePreflightState State, PluginImageValidationResult Validation, PluginImageRow? CurrentRow);
}
