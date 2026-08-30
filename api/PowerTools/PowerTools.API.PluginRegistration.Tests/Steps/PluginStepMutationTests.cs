using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class PluginStepMutationTests
{
    [Theory]
    [InlineData("create")]
    [InlineData("update")]
    [InlineData("enable")]
    [InlineData("disable")]
    [InlineData("unregister")]
    public async Task Every_step_mutation_is_bound_revalidated_attempted_once_and_verified(string operation)
    {
        var gateway = new StatefulStepGateway(operation);
        var service = Service();
        var draft = gateway.Draft(operation);
        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", operation, draft, CancellationToken.None);

        var result = await service.ExecuteAsync(gateway, "https://contoso.test", operation,
            preflight.Plan.Token, draft, operation == "unregister" ? gateway.StepName : null, CancellationToken.None);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal(1, gateway.MutationCalls);
        Assert.True(gateway.ReadsAfterMutation > 0);
        Assert.DoesNotContain("replacement-secret", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task Unregister_requires_exact_step_name_and_external_dependencies_block_before_send()
    {
        var gateway = new StatefulStepGateway("unregister") { HasDependency = true };
        var service = Service();
        var draft = gateway.Draft("unregister");
        var blocked = await service.CreatePreflightAsync(gateway, "https://contoso.test", "unregister", draft, CancellationToken.None);
        Assert.Equal(gateway.StepName, blocked.Plan.Confirmation.RequiredText);
        Assert.Contains(blocked.Plan.Blockers, item => item.Code == "dependency");

        var unblockedGateway = new StatefulStepGateway("unregister");
        var unblockedDraft = unblockedGateway.Draft("unregister");
        var unblocked = await service.CreatePreflightAsync(unblockedGateway, "https://contoso.test", "unregister", unblockedDraft, CancellationToken.None);

        await Assert.ThrowsAsync<ArgumentException>(() => service.ExecuteAsync(unblockedGateway, "https://contoso.test", "unregister",
            unblocked.Plan.Token, unblockedDraft, "wrong", CancellationToken.None));
        Assert.Equal(0, gateway.MutationCalls);
        Assert.Equal(0, unblockedGateway.MutationCalls);
    }

    private static PluginStepMutationService Service() => new(new PluginStepValidator(),
        new PluginRegistrationPreflightService(new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)));

    private sealed class StatefulStepGateway(string operation) : IPluginRegistrationGateway
    {
        private readonly Guid pluginId = Guid.NewGuid();
        private readonly Guid stepId = Guid.NewGuid();
        private bool exists = operation != "create";
        private bool enabled = operation != "enable";
        private bool mutated;
        private StepDraftDto? appliedDraft;
        public string StepName => "Update account";
        public bool HasDependency { get; init; }
        public int MutationCalls { get; private set; }
        public int ReadsAfterMutation { get; private set; }

        public StepDraftDto Draft(string requestedOperation) => new(pluginId, Guid.NewGuid(), Guid.NewGuid(), "account", null,
            40, 0, 1, ["name"], null, null, "replacement-secret",
            requestedOperation == "create" ? new Dictionary<Guid, long> { [pluginId] = 4 }
                : new Dictionary<Guid, long> { [pluginId] = 4, [stepId] = 7 });

        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken)
        {
            if (mutated) ReadsAfterMutation++;
            var plugin = new PluginTypeRow(pluginId, Guid.NewGuid(), "Contoso.Plugin", "Plugin", null, null, null,
                false, false, true, 4, null);
            var step = exists ? new PluginStepRow(stepId, pluginId, StepName, null, "Update", "account", null,
                "PostOperation", "Synchronous", 40, 0, 1, enabled, false, true, mutated ? 8 : 7, true, null) : null;
            return Task.FromResult(new PluginRegistrationRows([], [plugin], step is null ? [] : [step], []));
        }

        public Task<PluginStepPreflightState> RetrieveStepPreflightStateAsync(Guid pluginTypeId, Guid? targetStepId,
            StepDraftDto draft, CancellationToken cancellationToken) => Task.FromResult(new PluginStepPreflightState(
                "Update", "account", "accountid", true, true, true, false, false, true, exists,
                exists ? 7 : null, pluginId, targetStepId, StepName,
                HasDependency ? [new ComponentDependencyDto(Guid.NewGuid(), "External", "Workflow", null, false, true, 1)] : [],
                appliedDraft?.SdkMessageId ?? draft.SdkMessageId,
                appliedDraft?.SdkMessageFilterId ?? draft.SdkMessageFilterId,
                appliedDraft?.FilteringAttributes ?? draft.FilteringAttributes,
                appliedDraft?.ImpersonatingUserId ?? draft.ImpersonatingUserId,
                appliedDraft?.UnsecureConfiguration ?? draft.UnsecureConfiguration));

        public Task<Guid> MutateStepAsync(string requestedOperation, Guid? targetStepId, StepDraftDto draft, CancellationToken cancellationToken)
        {
            MutationCalls++; mutated = true; appliedDraft = draft;
            exists = requestedOperation != "unregister";
            enabled = requestedOperation == "enable" || (requestedOperation != "disable" && enabled);
            return Task.FromResult(stepId);
        }
    }
}
