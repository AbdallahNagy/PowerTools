using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.WorkflowActivities;

public sealed class WorkflowActivityMutationTests
{
    [Fact]
    public async Task Preflight_blocks_managed_workflow_activity_without_constructing_a_write()
    {
        var id = Guid.NewGuid();
        var gateway = new WorkflowActivityGateway(new PluginTypeRow(id, Guid.NewGuid(), "Contoso.Activity", "Old name", null,
            null, null, true, true, true, 5, null));
        var service = new WorkflowActivityMutationService(new PluginRegistrationPreflightService(
            new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)));
        var draft = new WorkflowActivityDraftDto(id, "New name", "Friendly", "Group", "Description", new Dictionary<Guid, long> { [id] = 5 });

        var result = await service.CreatePreflightAsync(gateway, "https://org", draft, CancellationToken.None);

        Assert.Contains(result.Plan.Blockers, item => item.Code == "workflow_activity_managed");
        Assert.Equal(0, gateway.WriteCount);
    }

    [Fact]
    public async Task Execute_rejects_a_plan_when_a_dependent_workflow_changes_after_preflight()
    {
        var activityId = Guid.NewGuid();
        var dependencyId = Guid.NewGuid();
        var gateway = new WorkflowActivityGateway(new PluginTypeRow(activityId, Guid.NewGuid(), "Contoso.Activity", "Old", null,
            null, null, true, false, true, 5, null), dependencyId);
        var service = new WorkflowActivityMutationService(new PluginRegistrationPreflightService(
            new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)));
        var draft = new WorkflowActivityDraftDto(activityId, "New", null, null, null,
            new Dictionary<Guid, long> { [activityId] = 5, [dependencyId] = 7 });

        var preflight = await service.CreatePreflightAsync(gateway, "https://org", draft, CancellationToken.None);
        gateway.DependencyVersion = 8;

        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() =>
            service.ExecuteAsync(gateway, "https://org", draft, preflight.Plan.Token, CancellationToken.None));

        Assert.Equal(0, gateway.WriteCount);
    }

    [Fact]
    public async Task Execute_updates_only_the_four_supported_registration_fields_and_verifies_readback()
    {
        var id = Guid.NewGuid();
        var gateway = new WorkflowActivityGateway(new PluginTypeRow(id, Guid.NewGuid(), "Contoso.Activity", "Old", "Old friendly",
            "Old description", "Old group", true, false, true, 5, "Core"));
        var service = new WorkflowActivityMutationService(new PluginRegistrationPreflightService(
            new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)));
        var draft = new WorkflowActivityDraftDto(id, "New", "Friendly", "Group", "Description",
            new Dictionary<Guid, long> { [id] = 5 });
        var preflight = await service.CreatePreflightAsync(gateway, "https://org", draft, CancellationToken.None);

        var result = await service.ExecuteAsync(gateway, "https://org", draft, preflight.Plan.Token, CancellationToken.None);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal("succeededAndVerified", result.Outcome);
        Assert.Equal(1, gateway.WriteCount);
        Assert.Equal(("New", "Friendly", "Group", "Description"), gateway.LastWrite);
    }

    private sealed class WorkflowActivityGateway : IPluginRegistrationGateway
    {
        private PluginTypeRow _type;
        private readonly Guid? _dependencyId;
        public WorkflowActivityGateway(PluginTypeRow type, Guid? dependencyId = null)
        {
            _type = type;
            _dependencyId = dependencyId;
        }
        public int WriteCount { get; private set; }
        public (string Name, string? FriendlyName, string? GroupName, string? Description) LastWrite { get; private set; }
        public long DependencyVersion { get; set; } = 7;
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new PluginRegistrationRows([], [_type], [], [], _dependencyId is { } id
                ? [new PluginHandlerDependencyRow(_type.Id, "Dependent action", "Workflow action", false, false, id,
                    "Core", false, true, DependencyVersion, "Activated")]
                : []));
        public Task<Guid> MutateWorkflowActivityAsync(WorkflowActivityMutationCommand command, CancellationToken cancellationToken)
        {
            WriteCount++;
            LastWrite = (command.Name, command.FriendlyName, command.WorkflowActivityGroupName, command.Description);
            _type = _type with { Name = command.Name, FriendlyName = command.FriendlyName,
                WorkflowActivityGroupName = command.WorkflowActivityGroupName, Description = command.Description,
                VersionNumber = _type.VersionNumber + 1 };
            return Task.FromResult(command.WorkflowActivityId);
        }
    }
}
