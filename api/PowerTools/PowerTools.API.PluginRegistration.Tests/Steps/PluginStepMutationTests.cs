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

    [Fact]
    public async Task State_preflight_uses_fresh_before_values_and_execute_carries_row_versions_to_write_boundary()
    {
        var gateway = new StatefulStepGateway("disable");
        var service = Service();
        var draft = gateway.Draft("disable") with { Stage = 10, Mode = 1, Rank = 99, FilteringAttributes = ["bogus"] };
        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", "disable", draft, CancellationToken.None);

        Assert.True(preflight.Before?.IsEnabled);
        Assert.False(preflight.After.IsEnabled);
        Assert.Equal(40, preflight.After.Stage);
        Assert.Equal(0, preflight.After.Mode);
        await service.ExecuteAsync(gateway, "https://contoso.test", "disable", preflight.Plan.Token,
            draft, null, CancellationToken.None);
        Assert.Equal(7, gateway.LastCommand?.ExpectedStepVersion);
        Assert.Equal(4, gateway.LastCommand?.ExpectedPluginVersion);
        Assert.True(gateway.LastCommand?.Before.IsEnabled);
        Assert.Equal(gateway.SecureConfigId, gateway.LastCommand?.ExpectedSecureConfigId);
        Assert.Equal(11, gateway.LastCommand?.ExpectedSecureConfigVersion);
    }

    [Fact]
    public async Task Dependency_blocks_unregister_but_not_update_and_write_time_concurrency_stops_send()
    {
        var gateway = new StatefulStepGateway("update") { HasDependency = true };
        var service = Service();
        var draft = gateway.Draft("update");
        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", "update", draft, CancellationToken.None);
        Assert.DoesNotContain(preflight.Plan.Blockers, item => item.Code == "dependency");
        gateway.WriteRace = true;

        var result = await service.ExecuteAsync(gateway,
            "https://contoso.test", "update", preflight.Plan.Token, draft, null, CancellationToken.None);
        Assert.Equal("rejectedBeforeCompletion", result.Outcome);
        Assert.Equal(0, gateway.MutationCalls);
    }

    [Fact]
    public async Task Update_can_explicitly_clear_nullable_fields_and_verifies_the_clear()
    {
        var gateway = new StatefulStepGateway("update");
        var service = Service();
        var draft = gateway.Draft("update") with
        {
            ImpersonatingUserId = null,
            UnsecureConfiguration = null,
            ImpersonatingUserAction = "clear",
            UnsecureConfigurationAction = "clear"
        };
        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", "update", draft, CancellationToken.None);

        var result = await service.ExecuteAsync(gateway, "https://contoso.test", "update", preflight.Plan.Token,
            draft, null, CancellationToken.None);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal("clear", gateway.LastCommand?.Draft.ImpersonatingUserAction);
        Assert.Equal("clear", gateway.LastCommand?.Draft.UnsecureConfigurationAction);
    }

    [Fact]
    public async Task Keep_actions_bind_fresh_nullable_values_not_submitted_placeholders()
    {
        var gateway = new StatefulStepGateway("update");
        var service = Service();
        var draft = gateway.Draft("update") with { UnsecureConfiguration = "untrusted-placeholder",
            UnsecureConfigurationAction = "keep" };

        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", "update", draft, CancellationToken.None);

        Assert.Equal("public", preflight.After.UnsecureConfiguration);
        Assert.Equal("public", preflight.Draft.UnsecureConfiguration);
    }

    [Theory]
    [InlineData("update")]
    [InlineData("disable")]
    public async Task Lost_step_response_is_reconciled_from_normalized_fields_and_state(string operation)
    {
        var gateway = new StatefulStepGateway(operation) { LoseResponseAfterMutation = true };
        var service = Service();
        var draft = gateway.Draft(operation);
        var preview = await service.CreatePreflightAsync(gateway, "https://contoso.test", operation, draft, default);

        var result = await service.ExecuteAsync(gateway, "https://contoso.test", operation,
            preview.Plan.Token, draft, null, default);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
        Assert.True(result.SucceededAndVerified);
        Assert.Equal(1, gateway.MutationCalls);
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
        public Guid SecureConfigId { get; } = Guid.NewGuid();
        public string StepName => "Update account";
        public bool HasDependency { get; init; }
        public bool WriteRace { get; set; }
        public bool LoseResponseAfterMutation { get; init; }
        public int MutationCalls { get; private set; }
        public int ReadsAfterMutation { get; private set; }
        public PluginStepMutationCommand? LastCommand { get; private set; }

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
                appliedDraft?.FilteringAttributes ?? ["name"],
                mutated ? appliedDraft?.ImpersonatingUserId : null,
                mutated ? appliedDraft?.UnsecureConfiguration : "public",
                40, 0, 1, enabled)
            {
                AvailableAttributes = ["accountid", "name"],
                IsOrdinaryPlugin = true,
                IsParentCustomizable = true,
                SecureConfigId = SecureConfigId,
                SecureConfigVersion = 11
            });

        public Task<StepEditDetailsDto> RetrieveStepEditDetailsAsync(Guid requestedStepId, CancellationToken cancellationToken) =>
            Task.FromResult(new StepEditDetailsDto(stepId, pluginId, Guid.NewGuid(), Guid.NewGuid(), "account", null,
                40, 0, 1, ["name"], null, "public", true,
                new Dictionary<Guid, long> { [pluginId] = 4, [stepId] = 7 }));

        public Task<Guid> MutateStepAsync(PluginStepMutationCommand command, CancellationToken cancellationToken)
        {
            if (WriteRace) throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);
            LastCommand = command;
            MutationCalls++; mutated = true; appliedDraft = command.Draft with {
                ImpersonatingUserId = command.Draft.ImpersonatingUserAction == "clear" ? null : command.Draft.ImpersonatingUserId,
                UnsecureConfiguration = command.Draft.UnsecureConfigurationAction == "clear" ? null : command.Draft.UnsecureConfiguration };
            exists = command.Operation != "unregister";
            enabled = command.Operation == "enable" || (command.Operation != "disable" && enabled);
            if (LoseResponseAfterMutation) throw new HttpRequestException("response lost");
            return Task.FromResult(stepId);
        }
    }
}
