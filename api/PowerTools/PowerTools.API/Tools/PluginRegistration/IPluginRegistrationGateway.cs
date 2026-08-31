using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public interface IPluginRegistrationGateway
{
    Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(
        CancellationToken cancellationToken);

    Task<Guid> RegisterAssemblyAsync(
        PluginAssemblyMutationCommand command,
        CancellationToken cancellationToken) =>
        Task.FromException<Guid>(new NotSupportedException(
            "Assembly registration is not supported by this gateway."));

    Task<Guid> UpdateAssemblyAsync(
        PluginAssemblyMutationCommand command,
        CancellationToken cancellationToken) =>
        Task.FromException<Guid>(new NotSupportedException(
            "Assembly update is not supported by this gateway."));

    Task<PluginAssemblyImpactSnapshot> RetrieveAssemblyImpactSnapshotAsync(
        PluginAssemblyRow assembly,
        IReadOnlyList<PluginTypeRow> handlers,
        CancellationToken cancellationToken) =>
        Task.FromResult(new PluginAssemblyImpactSnapshot([], [], false));

    Task<StepOptionsDto> RetrieveStepOptionsAsync(CancellationToken cancellationToken) =>
        Task.FromResult(new StepOptionsDto([], [], []));

    Task<PluginStepPreflightState> RetrieveStepPreflightStateAsync(
        Guid pluginTypeId, Guid? targetStepId, StepDraftDto draft, CancellationToken cancellationToken) =>
        Task.FromException<PluginStepPreflightState>(new NotSupportedException("Step preflight is not supported by this gateway."));

    Task<StepEditDetailsDto> RetrieveStepEditDetailsAsync(Guid stepId, CancellationToken cancellationToken) =>
        Task.FromException<StepEditDetailsDto>(new NotSupportedException("Step edit details are not supported by this gateway."));

    Task<Guid> MutateStepAsync(PluginStepMutationCommand command,
        CancellationToken cancellationToken) =>
        Task.FromException<Guid>(new NotSupportedException("Step mutation is not supported by this gateway."));

    Task<PluginImagePreflightState> RetrieveImagePreflightStateAsync(Guid stepId, Guid? imageId,
        ImageDraftDto draft, CancellationToken cancellationToken) =>
        Task.FromException<PluginImagePreflightState>(new NotSupportedException("Image preflight is not supported by this gateway."));

    Task<Guid> MutateImageAsync(PluginImageMutationCommand command, CancellationToken cancellationToken) =>
        Task.FromException<Guid>(new NotSupportedException("Image mutation is not supported by this gateway."));

    Task<Guid> MutateWorkflowActivityAsync(WorkflowActivityMutationCommand command, CancellationToken cancellationToken) =>
        Task.FromException<Guid>(new NotSupportedException("Workflow activity mutation is not supported by this gateway."));

    Task ExecuteCascadeTransactionAsync(IReadOnlyList<CascadeDeleteRequestDto> deletes,
        CancellationToken cancellationToken) =>
        Task.FromException(new NotSupportedException("Transactional cascade unregister is not supported by this gateway."));

    Task<IReadOnlyList<PluginHandlerDependencyRow>> RetrieveCascadeDependenciesAsync(
        IReadOnlyList<CascadeDeleteRequestDto> deletes, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<PluginHandlerDependencyRow>>([]);

    // This remains false until the release gate has a safe, non-mutating Dataverse capability probe.
    Task<bool> SupportsCascadeTransactionAsync(CancellationToken cancellationToken) => Task.FromResult(false);
}

public interface IPluginRegistrationGatewayFactory
{
    IPluginRegistrationGateway Create(IOrganizationServiceAsync2 service);
}

public sealed record PluginRegistrationRows(
    IReadOnlyList<PluginAssemblyRow> Assemblies,
    IReadOnlyList<PluginTypeRow> Types,
    IReadOnlyList<PluginStepRow> Steps,
    IReadOnlyList<PluginImageRow> Images,
    IReadOnlyList<PluginHandlerDependencyRow>? DependencyRows = null,
    IReadOnlyList<PluginWorkflowArgumentRow>? WorkflowArgumentRows = null,
    bool HasCompleteAssemblyImpactData = false)
{
    public IReadOnlyList<PluginHandlerDependencyRow> Dependencies { get; init; } = DependencyRows ?? [];
    public IReadOnlyList<PluginWorkflowArgumentRow> WorkflowArguments { get; init; } = WorkflowArgumentRows ?? [];
}

public sealed record PluginAssemblyRow(
    Guid Id,
    string Name,
    string Version,
    string? Culture,
    string? PublicKeyToken,
    int SourceType,
    int IsolationMode,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    string? SolutionDisplayName,
    string? Description = null,
    string? SourceHash = null,
    long? ContentSize = null);

public sealed record PluginHandlerDependencyRow(
    Guid HandlerId,
    string Name,
    string ComponentTypeLabel,
    bool IsCustomApi,
    bool IsExternal,
    Guid ComponentId = default,
    string? SolutionDisplayName = null,
    bool IsManaged = false,
    bool IsCustomizable = true,
    long VersionNumber = 0,
    string? StateLabel = null);

public sealed record PluginWorkflowArgumentRow(
    Guid HandlerId,
    string Name,
    string TypeName,
    WorkflowArgumentDirection Direction,
    bool IsRequired,
    string? ReferenceTarget);

public sealed record PluginAssemblyImpactSnapshot(
    byte[] Content,
    IReadOnlyList<PluginHandlerDependencyRow> Dependencies,
    bool IsComplete);

public sealed record PluginTypeRow(
    Guid Id,
    Guid? AssemblyId,
    string TypeName,
    string Name,
    string? FriendlyName,
    string? Description,
    string? WorkflowActivityGroupName,
    bool IsWorkflowActivity,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    string? SolutionDisplayName);

public sealed record PluginStepRow(
    Guid Id,
    Guid? PluginTypeId,
    string Name,
    string? Description,
    string MessageLabel,
    string? PrimaryTableLabel,
    string? SecondaryTableLabel,
    string StageLabel,
    string ModeLabel,
    int Stage,
    int Mode,
    int Rank,
    bool IsEnabled,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    bool SecureConfigExists,
    string? SolutionDisplayName);

public sealed record PluginImageRow(
    Guid Id,
    Guid? PluginStepId,
    string Name,
    string? Description,
    string ImageTypeLabel,
    string? EntityAlias,
    IReadOnlyList<string> Attributes,
    bool IsManaged,
    bool IsCustomizable,
    long VersionNumber,
    string? SolutionDisplayName);
