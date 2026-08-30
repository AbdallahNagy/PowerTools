using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginAssemblyDiff
{
    public static AssemblyMutationImpactDto Compare(PluginAssemblyRow? existing, IReadOnlyList<PluginTypeRow> existingTypes, IReadOnlyList<PluginStepRow> existingSteps, IReadOnlyList<PluginImageRow> existingImages, AssemblyInspectionDto inspection, IReadOnlyList<PluginHandlerDependencyRow>? dependencies = null, IReadOnlyList<PluginWorkflowArgumentRow>? workflowArguments = null, bool hasCompleteImpactData = true)
    {
        dependencies ??= [];
        workflowArguments ??= [];
        var oldPlugins = existingTypes.Where(type => !type.IsWorkflowActivity).ToDictionary(type => type.TypeName, StringComparer.Ordinal);
        var oldActivities = existingTypes.Where(type => type.IsWorkflowActivity).ToDictionary(type => type.TypeName, StringComparer.Ordinal);
        var newPlugins = inspection.Plugins.Select(plugin => plugin.TypeName).ToHashSet(StringComparer.Ordinal);
        var newActivities = inspection.WorkflowActivities.ToDictionary(activity => activity.TypeName, StringComparer.Ordinal);
        var assemblyChanged = existing is not null && (existing.Version != inspection.Identity.Version
            || existing.Name != inspection.Identity.Name || existing.Culture != inspection.Identity.Culture
            || existing.PublicKeyToken != inspection.Identity.PublicKeyToken || existing.SourceHash != inspection.Sha256);
        var changedPlugins = assemblyChanged
            ? newPlugins.Where(oldPlugins.ContainsKey).Order().ToArray()
            : [];
        var removedPlugins = oldPlugins.Keys.Where(name => !newPlugins.Contains(name)).Order().ToArray();
        var removedActivities = oldActivities.Keys.Where(name => !newActivities.ContainsKey(name)).Order().ToArray();
        var owned = OwnedRecords(removedPlugins, oldPlugins, existingSteps, existingImages);
        var removedHandlerIds = removedPlugins.Select(name => oldPlugins[name].Id).Concat(removedActivities.Select(name => oldActivities[name].Id)).ToHashSet();
        var affectedDependencies = dependencies.Where(dependency => removedHandlerIds.Contains(dependency.HandlerId)).Select(dependency => $"{dependency.ComponentTypeLabel}: {dependency.Name}").Order().ToArray();
        var differences = ContractDifferences(oldActivities, newActivities, workflowArguments, dependencies);
        var blockers = new List<MutationBlockerDto>();
        if (owned.Length > 0) blockers.Add(new("assembly_removed_handler_has_owned_records", "A removed plug-in still owns registered steps or images."));
        if (removedPlugins.Any(name => dependencies.Any(dependency => dependency.HandlerId == oldPlugins[name].Id))) blockers.Add(new("assembly_removed_handler_has_dependency", "A removed plug-in is referenced by another component or Custom API."));
        if (removedActivities.Any(name => dependencies.Any(dependency => dependency.HandlerId == oldActivities[name].Id))) blockers.Add(new("assembly_removed_workflow_activity", "A removed workflow activity is still referenced."));
        if (differences.Any(difference => difference.IsBreaking && difference.IsReferenced)) blockers.Add(new("assembly_workflow_contract_breaking", "A referenced workflow activity has a breaking argument contract change."));
        if (!hasCompleteImpactData && (removedPlugins.Length > 0 || removedActivities.Length > 0 || differences.Any(difference => difference.IsBreaking))) blockers.Add(new("assembly_impact_data_incomplete", "Dependency and workflow-reference data could not be verified."));
        var warnings = new List<MutationWarningDto>();
        if (existing?.IsManaged == true) warnings.Add(new("assembly_managed", "The existing assembly is managed."));
        if (!hasCompleteImpactData) warnings.Add(new("assembly_impact_data_unavailable", "Dependency impact data is unavailable; removals are blocked."));
        return new AssemblyMutationImpactDto(existing is null ? null : new(existing.Name, existing.Version, existing.Culture ?? "neutral", existing.PublicKeyToken ?? ""), inspection.Identity, existing?.SourceHash, inspection.Sha256, existing?.ContentSize, inspection.Size, existing?.IsolationMode, existing is null ? 2 : existing.IsolationMode, existing?.SourceType, existing is null ? 0 : existing.SourceType, newPlugins.Where(name => !oldPlugins.ContainsKey(name)).Order().ToArray(), newPlugins.Where(name => oldPlugins.ContainsKey(name) && !changedPlugins.Contains(name, StringComparer.Ordinal)).Order().ToArray(), changedPlugins, removedPlugins, newActivities.Keys.Where(name => !oldActivities.ContainsKey(name)).Order().ToArray(), differences.Select(difference => difference.TypeName).Distinct().Order().ToArray(), removedActivities, owned, affectedDependencies, differences, warnings, blockers);
    }

    private static string[] OwnedRecords(IReadOnlyList<string> removedPlugins, IReadOnlyDictionary<string, PluginTypeRow> oldPlugins, IReadOnlyList<PluginStepRow> steps, IReadOnlyList<PluginImageRow> images) => removedPlugins.SelectMany(name =>
    {
        var type = oldPlugins[name];
        return steps.Where(step => step.PluginTypeId == type.Id).SelectMany(step => images.Where(image => image.PluginStepId == step.Id).Select(image => $"{name}: step '{step.Name}', image '{image.Name}'").DefaultIfEmpty($"{name}: step '{step.Name}'"));
    }).Order().ToArray();

    private static IReadOnlyList<WorkflowContractDifferenceDto> ContractDifferences(IReadOnlyDictionary<string, PluginTypeRow> oldActivities, IReadOnlyDictionary<string, WorkflowActivityInspectionDto> newActivities, IReadOnlyList<PluginWorkflowArgumentRow> oldArguments, IReadOnlyList<PluginHandlerDependencyRow> dependencies)
    {
        var differences = new List<WorkflowContractDifferenceDto>();
        foreach (var (typeName, activity) in newActivities.Where(pair => oldActivities.ContainsKey(pair.Key)))
        {
            var oldByName = oldArguments.Where(argument => argument.HandlerId == oldActivities[typeName].Id).ToDictionary(argument => argument.Name, StringComparer.Ordinal);
            var referenced = dependencies.Any(dependency => dependency.HandlerId == oldActivities[typeName].Id);
            foreach (var oldArgument in oldByName.Values)
            {
                var current = activity.Arguments.SingleOrDefault(argument => argument.Name == oldArgument.Name);
                if (current is null) differences.Add(new(typeName, oldArgument.Name, "removed", true, referenced));
                else if (current.TypeName != oldArgument.TypeName || current.Direction != oldArgument.Direction || current.ReferenceTarget != oldArgument.ReferenceTarget || current.IsRequired != oldArgument.IsRequired) differences.Add(new(typeName, oldArgument.Name, "changed", true, referenced));
            }
        }
        return differences;
    }
}
