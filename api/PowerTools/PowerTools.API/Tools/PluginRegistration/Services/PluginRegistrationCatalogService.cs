using System.Security.Cryptography;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class PluginRegistrationCatalogService(IPluginAssemblyInspector? inspector = null)
{
    private static readonly StringComparer NameComparer =
        StringComparer.OrdinalIgnoreCase;

    public async Task<PluginRegistrationCatalogDto> RetrieveCatalogAsync(
        IPluginRegistrationGateway gateway,
        CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        return Assemble(rows);
    }

    public async Task<PluginHandlerDto> RetrieveWorkflowActivityAsync(
        IPluginRegistrationGateway gateway,
        Guid workflowActivityId,
        CancellationToken cancellationToken)
    {
        var rows = await gateway.RetrieveCatalogRowsAsync(cancellationToken);
        var activity = rows.Types.SingleOrDefault(type =>
            type.Id == workflowActivityId && type.IsWorkflowActivity)
            ?? throw new KeyNotFoundException("The workflow activity was not found.");
        var assembly = rows.Assemblies.SingleOrDefault(item => item.Id == activity.AssemblyId)
            ?? throw new InvalidOperationException("The workflow activity assembly was not found.");
        var detailRows = new PluginRegistrationRows(
            [assembly],
            [activity],
            [],
            [],
            rows.Dependencies.Where(dependency => dependency.HandlerId == activity.Id).ToArray(),
            [],
            rows.HasCompleteAssemblyImpactData);
        var enriched = await EnrichWorkflowContractsAsync(gateway, detailRows, cancellationToken);
        return AssertSingleWorkflowActivity(Assemble(enriched), activity.Id);
    }

    private static PluginHandlerDto AssertSingleWorkflowActivity(
        PluginRegistrationCatalogDto catalog,
        Guid workflowActivityId)
    {
        var activity = catalog.Assemblies.Single().Handlers.Single();
        if (activity.Id != workflowActivityId || activity.Kind != HandlerKind.WorkflowActivity)
            throw new InvalidOperationException("The workflow activity details are incomplete.");
        return activity;
    }

    private async Task<PluginRegistrationRows> EnrichWorkflowContractsAsync(IPluginRegistrationGateway gateway,
        PluginRegistrationRows rows, CancellationToken cancellationToken)
    {
        if (inspector is null || !rows.Types.Any(type => type.IsWorkflowActivity)) return rows;
        var arguments = new List<PluginWorkflowArgumentRow>();
        var dependencies = new List<PluginHandlerDependencyRow>(rows.Dependencies);
        foreach (var assembly in rows.Assemblies)
        {
            var activities = rows.Types.Where(type => type.AssemblyId == assembly.Id && type.IsWorkflowActivity).ToArray();
            if (activities.Length == 0) continue;
            var snapshot = await gateway.RetrieveAssemblyImpactSnapshotAsync(assembly, activities, cancellationToken);
            if (!snapshot.IsComplete || snapshot.Content.Length == 0)
                throw new InvalidOperationException("Workflow argument metadata could not be retrieved safely.");
            dependencies.AddRange(snapshot.Dependencies);
            try
            {
                await using var content = new MemoryStream(snapshot.Content, writable: false);
                var inspection = await inspector.InspectAsync(content, $"{assembly.Name}.dll", snapshot.Content.Length, cancellationToken);
                foreach (var activity in activities)
                {
                    var inspected = inspection.WorkflowActivities.SingleOrDefault(item => item.TypeName == activity.TypeName)
                        ?? throw new InvalidOperationException("Workflow activity metadata is incomplete.");
                    arguments.AddRange(inspected.Arguments.Select(argument => new PluginWorkflowArgumentRow(activity.Id,
                        argument.Name, argument.TypeName, argument.Direction, argument.IsRequired, argument.ReferenceTarget)));
                }
            }
            finally { CryptographicOperations.ZeroMemory(snapshot.Content); }
        }
        return new PluginRegistrationRows(
            rows.Assemblies,
            rows.Types,
            rows.Steps,
            rows.Images,
            dependencies.Distinct().ToArray(),
            arguments,
            rows.HasCompleteAssemblyImpactData);
    }

    private static PluginRegistrationCatalogDto Assemble(PluginRegistrationRows rows)
    {
        var imagesByStep = rows.Images
            .Where(image => image.PluginStepId.HasValue)
            .GroupBy(image => image.PluginStepId!.Value)
            .ToDictionary(group => group.Key, group => group.ToArray());
        var stepsByType = rows.Steps
            .Where(step => step.PluginTypeId.HasValue)
            .GroupBy(step => step.PluginTypeId!.Value)
            .ToDictionary(group => group.Key, group => group.ToArray());
        var typesByAssembly = rows.Types
            .Where(type => type.AssemblyId.HasValue)
            .GroupBy(type => type.AssemblyId!.Value)
            .ToDictionary(group => group.Key, group => group.ToArray());

        var assemblies = rows.Assemblies
            .OrderBy(assembly => assembly.Name, NameComparer)
            .ThenBy(assembly => assembly.Id)
            .Select(assembly => MapAssembly(
                assembly,
                typesByAssembly.GetValueOrDefault(assembly.Id) ?? [],
                stepsByType,
                imagesByStep,
                rows))
            .ToArray();
        return new PluginRegistrationCatalogDto(assemblies);
    }

    private static PluginAssemblyDto MapAssembly(
        PluginAssemblyRow assembly,
        IReadOnlyList<PluginTypeRow> types,
        IReadOnlyDictionary<Guid, PluginStepRow[]> stepsByType,
        IReadOnlyDictionary<Guid, PluginImageRow[]> imagesByStep,
        PluginRegistrationRows rows) =>
        new(
            assembly.Id,
            assembly.Name,
            assembly.Version,
            assembly.Culture,
            assembly.PublicKeyToken,
            assembly.SourceType,
            assembly.IsolationMode,
            assembly.IsManaged,
            assembly.IsCustomizable,
            assembly.VersionNumber,
            types
                .OrderBy(type => type.TypeName, NameComparer)
                .ThenBy(type => type.Id)
                .Select(type => MapHandler(type, stepsByType, imagesByStep, rows))
                .ToArray(),
            assembly.Description,
            assembly.SolutionDisplayName,
            assembly.SourceHash,
            assembly.ContentSize);

    private static PluginHandlerDto MapHandler(
        PluginTypeRow type,
        IReadOnlyDictionary<Guid, PluginStepRow[]> stepsByType,
        IReadOnlyDictionary<Guid, PluginImageRow[]> imagesByStep,
        PluginRegistrationRows rows) =>
        new(
            type.Id,
            type.IsWorkflowActivity ? HandlerKind.WorkflowActivity : HandlerKind.Plugin,
            type.TypeName,
            type.Name,
            type.FriendlyName,
            type.Description,
            type.WorkflowActivityGroupName,
            type.IsManaged,
            type.IsCustomizable,
            type.VersionNumber,
            type.IsWorkflowActivity
                ? []
                : (stepsByType.GetValueOrDefault(type.Id) ?? [])
                    .OrderBy(step => step.Name, NameComparer)
                    .ThenBy(step => step.Id)
                    .Select(step => MapStep(step, imagesByStep))
                    .ToArray(),
            rows.WorkflowArguments.Where(argument => argument.HandlerId == type.Id).Select((argument, position) =>
                new WorkflowArgumentDto(argument.Name, argument.Name, argument.TypeName, argument.Direction,
                    argument.IsRequired, position)).ToArray(),
            rows.Dependencies.Where(dependency => dependency.HandlerId == type.Id).Select(dependency =>
                new ComponentDependencyDto(dependency.ComponentId, dependency.Name, dependency.ComponentTypeLabel,
                    dependency.SolutionDisplayName, dependency.IsManaged, dependency.IsCustomizable,
                    dependency.VersionNumber, dependency.StateLabel)).ToArray(),
            type.AssemblyId,
            type.SolutionDisplayName);

    private static PluginStepDto MapStep(
        PluginStepRow step,
        IReadOnlyDictionary<Guid, PluginImageRow[]> imagesByStep) =>
        new(
            step.Id,
            step.PluginTypeId!.Value,
            step.Name,
            step.Description,
            step.MessageLabel,
            step.PrimaryTableLabel,
            step.SecondaryTableLabel,
            step.StageLabel,
            step.ModeLabel,
            step.Stage,
            step.Mode,
            step.Rank,
            step.IsEnabled,
            step.IsManaged,
            step.IsCustomizable,
            step.VersionNumber,
            step.SecureConfigExists,
            (imagesByStep.GetValueOrDefault(step.Id) ?? [])
                .OrderBy(image => image.Name, NameComparer)
                .ThenBy(image => image.Id)
                .Select(MapImage)
                .ToArray(),
            step.SolutionDisplayName);

    private static PluginImageDto MapImage(PluginImageRow image) =>
        new(
            image.Id,
            image.PluginStepId!.Value,
            image.Name,
            image.Description,
            image.ImageTypeLabel,
            image.EntityAlias,
            image.Attributes,
            image.IsManaged,
            image.IsCustomizable,
            image.VersionNumber,
            image.SolutionDisplayName);
}
