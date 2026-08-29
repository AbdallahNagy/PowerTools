using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginAssemblyDiff
{
    public static AssemblyMutationImpactDto Compare(
        PluginAssemblyRow? existing,
        IReadOnlyList<PluginTypeRow> existingTypes,
        IReadOnlyList<PluginStepRow> existingSteps,
        IReadOnlyList<PluginImageRow> existingImages,
        AssemblyInspectionDto inspection)
    {
        var oldPlugins = existingTypes.Where(type => !type.IsWorkflowActivity)
            .ToDictionary(type => type.TypeName, StringComparer.Ordinal);
        var oldActivities = existingTypes.Where(type => type.IsWorkflowActivity)
            .ToDictionary(type => type.TypeName, StringComparer.Ordinal);
        var newPlugins = inspection.Plugins.Select(plugin => plugin.TypeName)
            .ToHashSet(StringComparer.Ordinal);
        var newActivities = inspection.WorkflowActivities.Select(activity => activity.TypeName)
            .ToHashSet(StringComparer.Ordinal);
        var removedPlugins = oldPlugins.Keys.Where(name => !newPlugins.Contains(name)).Order().ToArray();
        var removedActivities = oldActivities.Keys.Where(name => !newActivities.Contains(name)).Order().ToArray();
        var owned = removedPlugins.SelectMany(name =>
        {
            var type = oldPlugins[name];
            return existingSteps.Where(step => step.PluginTypeId == type.Id)
                .SelectMany(step => existingImages.Where(image => image.PluginStepId == step.Id)
                    .Select(image => $"{name}: step '{step.Name}', image '{image.Name}'"))
                .Concat(existingSteps.Where(step => step.PluginTypeId == type.Id)
                    .Where(step => !existingImages.Any(image => image.PluginStepId == step.Id))
                    .Select(step => $"{name}: step '{step.Name}'"));
        }).Order().ToArray();
        var blockers = new List<MutationBlockerDto>();
        if (owned.Length > 0)
            blockers.Add(new MutationBlockerDto("assembly_removed_handler_has_owned_records",
                "A removed plug-in still owns registered steps or images."));
        return new AssemblyMutationImpactDto(
            existing is null ? null : new AssemblyIdentityInspectionDto(existing.Name, existing.Version,
                existing.Culture ?? "neutral", existing.PublicKeyToken ?? ""),
            inspection.Identity,
            newPlugins.Where(name => !oldPlugins.ContainsKey(name)).Order().ToArray(),
            newPlugins.Where(oldPlugins.ContainsKey).Order().ToArray(),
            removedPlugins,
            newActivities.Where(name => !oldActivities.ContainsKey(name)).Order().ToArray(),
            newActivities.Where(oldActivities.ContainsKey).Order().ToArray(),
            removedActivities,
            owned,
            [],
            existing?.IsManaged == true
                ? [new MutationWarningDto("assembly_managed", "The existing assembly is managed.")]
                : [],
            blockers);
    }
}
