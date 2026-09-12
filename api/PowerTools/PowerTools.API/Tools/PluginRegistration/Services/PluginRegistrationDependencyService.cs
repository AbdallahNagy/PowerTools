using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class PluginRegistrationDependencyService
{
    public CascadeDependencySnapshot Build(PluginRegistrationRows rows, CascadeUnregisterDraftDto draft)
    {
        var assembly = draft.TargetKind == CascadeTargetKind.Assembly
            ? rows.Assemblies.SingleOrDefault(value => value.Id == draft.TargetId)
            : null;
        var targetHandler = draft.TargetKind == CascadeTargetKind.Assembly
            ? null : rows.Types.SingleOrDefault(value => value.Id == draft.TargetId);
        if (draft.TargetKind == CascadeTargetKind.Assembly && assembly is null ||
            draft.TargetKind != CascadeTargetKind.Assembly && targetHandler is null)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
        if (targetHandler is not null && (draft.TargetKind == CascadeTargetKind.Plugin) == targetHandler.IsWorkflowActivity)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);

        var handlers = assembly is not null
            ? rows.Types.Where(value => value.AssemblyId == assembly.Id).OrderBy(value => value.IsWorkflowActivity).ThenBy(value => value.TypeName, StringComparer.Ordinal).ToArray()
            : [targetHandler!];
        var ordinaryIds = handlers.Where(value => !value.IsWorkflowActivity).Select(value => value.Id).ToHashSet();
        var steps = rows.Steps.Where(value => value.PluginTypeId is { } id && ordinaryIds.Contains(id)).OrderBy(value => value.Id).ToArray();
        var stepIds = steps.Select(value => value.Id).ToHashSet();
        var images = rows.Images.Where(value => value.PluginStepId is { } id && stepIds.Contains(id)).OrderBy(value => value.Id).ToArray();
        var ownedIds = handlers.Select(value => value.Id).Concat(steps.Select(value => value.Id)).Concat(images.Select(value => value.Id))
            .Append(assembly?.Id ?? Guid.Empty).Where(id => id != Guid.Empty).ToHashSet();
        var dependencies = rows.Dependencies.Where(value => ownedIds.Contains(value.HandlerId))
            .Where(value => value.IsExternal || value.ComponentId == Guid.Empty || !ownedIds.Contains(value.ComponentId))
            .OrderBy(value => value.ComponentId).ThenBy(value => value.ComponentTypeLabel, StringComparer.Ordinal).ThenBy(value => value.Name, StringComparer.Ordinal)
            .Select(value => new ComponentDependencyDto(value.ComponentId, value.Name, value.ComponentTypeLabel,
                value.SolutionDisplayName, value.IsManaged, value.IsCustomizable, value.VersionNumber, value.StateLabel)).ToArray();
        return new(assembly, handlers, steps, images, dependencies);
    }
}

public sealed record CascadeDependencySnapshot(
    PluginAssemblyRow? Assembly,
    IReadOnlyList<PluginTypeRow> Handlers,
    IReadOnlyList<PluginStepRow> Steps,
    IReadOnlyList<PluginImageRow> Images,
    IReadOnlyList<ComponentDependencyDto> ExternalDependencies);
