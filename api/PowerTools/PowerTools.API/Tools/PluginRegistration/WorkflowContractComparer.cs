using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed record WorkflowContractSnapshot(
    string TypeName,
    IReadOnlyList<WorkflowArgumentDto> Arguments,
    bool IsReferenced);

public sealed record WorkflowContractComparison(
    IReadOnlyList<WorkflowContractDifferenceDto> Differences)
{
    public bool HasBreakingChanges => Differences.Any(difference => difference.IsBreaking && difference.IsReferenced);
}

public static class WorkflowContractComparer
{
    public static WorkflowContractComparison Compare(
        WorkflowContractSnapshot existing,
        IReadOnlyList<WorkflowArgumentDto> currentArguments)
    {
        ArgumentNullException.ThrowIfNull(existing);
        ArgumentNullException.ThrowIfNull(currentArguments);

        var differences = new List<WorkflowContractDifferenceDto>();
        var before = existing.Arguments.ToDictionary(argument => argument.Name, StringComparer.Ordinal);
        var after = currentArguments.ToDictionary(argument => argument.Name, StringComparer.Ordinal);
        foreach (var argument in before.Values)
        {
            if (!after.TryGetValue(argument.Name, out var current))
                differences.Add(Difference(existing, argument.Name, "removed"));
            else if (!Equivalent(argument, current))
                differences.Add(Difference(existing, argument.Name,
                    argument.Direction != current.Direction ? "direction-changed" : "type-changed"));
        }
        foreach (var argument in after.Values.Where(argument =>
                     argument.Direction == WorkflowArgumentDirection.Input && argument.IsRequired && !before.ContainsKey(argument.Name)))
            differences.Add(Difference(existing, argument.Name, "added-required"));

        return new WorkflowContractComparison(differences);
    }

    private static WorkflowContractDifferenceDto Difference(WorkflowContractSnapshot existing, string argument, string change) =>
        new(existing.TypeName, argument, change, true, existing.IsReferenced);

    private static bool Equivalent(WorkflowArgumentDto left, WorkflowArgumentDto right) =>
        string.Equals(left.TypeName, right.TypeName, StringComparison.Ordinal)
        && left.Direction == right.Direction
        && left.IsRequired == right.IsRequired;
}
