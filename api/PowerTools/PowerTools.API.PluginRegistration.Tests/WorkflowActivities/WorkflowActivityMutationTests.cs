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

    private sealed class WorkflowActivityGateway(PluginTypeRow type) : IPluginRegistrationGateway
    {
        public int WriteCount { get; private set; }
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new PluginRegistrationRows([], [type], [], []));
        public Task<Guid> MutateWorkflowActivityAsync(WorkflowActivityMutationCommand command, CancellationToken cancellationToken)
        {
            WriteCount++;
            return Task.FromResult(command.WorkflowActivityId);
        }
    }
}
