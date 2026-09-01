using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Cascade;

public sealed class PluginRegistrationCascadeServiceTests
{
    [Fact]
    public async Task Assembly_preflight_builds_one_deduplicated_child_before_parent_plan_and_binds_versions()
    {
        var fixture = CascadeFixture.Create();
        var service = fixture.Service;

        var preview = await service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Assembly, fixture.Assembly.Id, fixture.ExpectedVersions), CancellationToken.None);

        Assert.Empty(preview.Plan.Blockers);
        Assert.Equal([fixture.Image.Id, fixture.Step.Id, fixture.Plugin.Id, fixture.Activity.Id, fixture.Assembly.Id],
            preview.DeletePlan.Select(item => item.Id));
        Assert.Equal(1, preview.Impact.EnabledStepCount);
        Assert.Equal(2, preview.Impact.Handlers.Count);
        Assert.Single(preview.Impact.Steps);
        Assert.Single(preview.Impact.Images);
    }

    [Fact]
    public async Task Execute_requires_release_approved_transaction_capability_and_never_uses_sequential_fallback()
    {
        var fixture = CascadeFixture.Create(capabilityApproved: false);
        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Plugin, fixture.Plugin.Id, fixture.PluginExpectedVersions), CancellationToken.None);

        Assert.Contains(preview.Plan.Blockers, blocker => blocker.Code == "transactional_cascade_unsupported");
        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => fixture.Service.ExecuteAsync(
            fixture.Gateway, "Dev", preview.Plan.Token, preview.Draft, null, false, CancellationToken.None));
        Assert.Equal(0, fixture.Gateway.TransactionCount);
    }

    [Fact]
    public async Task External_dependency_is_a_blocker_and_is_never_added_to_delete_plan()
    {
        var fixture = CascadeFixture.Create(externalDependency: true);
        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Plugin, fixture.Plugin.Id, fixture.PluginExpectedVersions), CancellationToken.None);

        Assert.Contains(preview.Plan.Blockers, blocker => blocker.Code == "external_dependency");
        Assert.DoesNotContain(preview.DeletePlan, item => item.Id == fixture.ExternalDependencyId);
    }

    [Fact]
    public async Task Assembly_execute_requires_the_signed_acknowledgement_before_sending_a_transaction()
    {
        var fixture = CascadeFixture.Create();
        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Assembly, fixture.Assembly.Id, fixture.ExpectedVersions), CancellationToken.None);

        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Service.ExecuteAsync(
            fixture.Gateway, "Dev", preview.Plan.Token, preview.Draft, fixture.Assembly.Name, false, CancellationToken.None));

        Assert.Equal(0, fixture.Gateway.TransactionCount);
    }

    [Fact]
    public async Task Preflight_blocks_when_the_connected_environment_does_not_support_the_transaction_request()
    {
        var fixture = CascadeFixture.Create(capabilityApproved: true, environmentSupportsTransaction: false);

        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Plugin, fixture.Plugin.Id, fixture.PluginExpectedVersions), CancellationToken.None);

        Assert.Contains(preview.Plan.Blockers, blocker => blocker.Code == "transactional_cascade_unsupported");
    }

    [Fact]
    public async Task Assembly_preflight_queries_every_planned_component_and_blocks_external_dependents()
    {
        var fixture = CascadeFixture.Create();
        fixture.Gateway.CascadeDependencies = [
            new(fixture.Assembly.Id, "Assembly consumer", "Custom API", true, true, Guid.NewGuid()),
            new(fixture.Step.Id, "Step consumer", "Workflow", false, true, Guid.NewGuid()),
            new(fixture.Image.Id, "Image consumer", "External component", false, true, Guid.NewGuid())
        ];

        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Assembly, fixture.Assembly.Id, fixture.ExpectedVersions), CancellationToken.None);

        Assert.Equal([fixture.Image.Id, fixture.Step.Id, fixture.Plugin.Id, fixture.Activity.Id, fixture.Assembly.Id],
            Assert.Single(fixture.Gateway.CascadeRequests).Select(item => item.Id));
        Assert.Equal(3, preview.Impact.ExternalDependencies.Count);
        Assert.Equal(3, preview.Plan.Blockers.Count(blocker => blocker.Code == "external_dependency"));
        Assert.DoesNotContain(preview.DeletePlan, item => fixture.Gateway.CascadeDependencies.Any(dependency => dependency.ComponentId == item.Id));
    }

    [Fact]
    public async Task Lost_cascade_response_is_reconciled_only_when_target_and_every_owned_descendant_are_absent()
    {
        var fixture = CascadeFixture.Create();
        fixture.Gateway.LoseResponseAfterTransaction = true;
        var preview = await fixture.Service.CreatePreflightAsync(fixture.Gateway, "Dev", new CascadeUnregisterDraftDto(
            CascadeTargetKind.Assembly, fixture.Assembly.Id, fixture.ExpectedVersions), default);

        var result = await fixture.Service.ExecuteAsync(fixture.Gateway, "Dev", preview.Plan.Token,
            preview.Draft, fixture.Assembly.Name, true, default);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
        Assert.True(result.SucceededAndVerified);
        Assert.Equal(1, fixture.Gateway.TransactionCount);
    }

    private sealed class CascadeFixture
    {
        public required PluginRegistrationCascadeService Service { get; init; }
        public required Gateway Gateway { get; init; }
        public required PluginAssemblyRow Assembly { get; init; }
        public required PluginTypeRow Plugin { get; init; }
        public required PluginTypeRow Activity { get; init; }
        public required PluginStepRow Step { get; init; }
        public required PluginImageRow Image { get; init; }
        public required IReadOnlyDictionary<Guid, long> ExpectedVersions { get; init; }
        public required IReadOnlyDictionary<Guid, long> PluginExpectedVersions { get; init; }
        public Guid ExternalDependencyId { get; init; }

        public static CascadeFixture Create(bool capabilityApproved = true, bool externalDependency = false,
            bool environmentSupportsTransaction = true)
        {
            var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso.Plugins", "1.0.0.0", null, null, 0, 2, false, true, 10, "Core");
            var plugin = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugins.Validate", "Validate", null, null, null, false, false, true, 11, "Core");
            var activity = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugins.Calculate", "Calculate", null, null, null, true, false, true, 12, "Core");
            var step = new PluginStepRow(Guid.NewGuid(), plugin.Id, "Validate account", null, "Update", "account", null, "PreOperation", "Synchronous", 20, 0, 1, true, false, true, 13, false, "Core");
            var image = new PluginImageRow(Guid.NewGuid(), step.Id, "PreImage", null, "Pre Image", "pre", ["name"], false, true, 14, "Core");
            var externalId = Guid.NewGuid();
            IReadOnlyList<PluginHandlerDependencyRow> dependencies = externalDependency
                ? [new PluginHandlerDependencyRow(plugin.Id, "Other solution API", "Custom API", true, true, externalId, "Other", false, true, 20)]
                : [];
            var rows = new PluginRegistrationRows([assembly], [plugin, activity], [step], [image], dependencies);
            var gateway = new Gateway(rows, environmentSupportsTransaction);
            var time = new Support.ManualTimeProvider(new DateTimeOffset(2026, 8, 31, 0, 0, 0, TimeSpan.Zero));
            var service = new PluginRegistrationCascadeService(new PluginRegistrationDependencyService(),
                new PluginRegistrationCapabilityService(capabilityApproved),
                new PluginRegistrationPreflightService(new PluginRegistrationPlanSigner("test-secret", time)));
            return new()
            {
                Service = service, Gateway = gateway, Assembly = assembly, Plugin = plugin, Activity = activity, Step = step, Image = image,
                ExternalDependencyId = externalId,
                ExpectedVersions = new Dictionary<Guid, long> { [assembly.Id] = 10, [plugin.Id] = 11, [activity.Id] = 12, [step.Id] = 13, [image.Id] = 14 }
                , PluginExpectedVersions = new Dictionary<Guid, long> { [plugin.Id] = 11, [step.Id] = 13, [image.Id] = 14 }
            };
        }
    }

    private sealed class Gateway(PluginRegistrationRows rows, bool environmentSupportsTransaction) : IPluginRegistrationGateway
    {
        private PluginRegistrationRows current = rows;
        public int TransactionCount { get; private set; }
        public bool LoseResponseAfterTransaction { get; set; }
        public IReadOnlyList<PluginHandlerDependencyRow> CascadeDependencies { get; set; } = [];
        public List<IReadOnlyList<CascadeDeleteRequestDto>> CascadeRequests { get; } = [];
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) => Task.FromResult(current);
        public Task<IReadOnlyList<PluginHandlerDependencyRow>> RetrieveCascadeDependenciesAsync(
            IReadOnlyList<CascadeDeleteRequestDto> deletes, CancellationToken cancellationToken)
        {
            CascadeRequests.Add(deletes);
            return Task.FromResult(CascadeDependencies);
        }
        public Task<bool> SupportsCascadeTransactionAsync(CancellationToken cancellationToken) => Task.FromResult(environmentSupportsTransaction);
        public Task ExecuteCascadeTransactionAsync(IReadOnlyList<CascadeDeleteRequestDto> deletes, CancellationToken cancellationToken)
        {
            TransactionCount++;
            var ids = deletes.Select(delete => delete.Id).ToHashSet();
            current = current with { Assemblies = current.Assemblies.Where(row => !ids.Contains(row.Id)).ToArray(), Types = current.Types.Where(row => !ids.Contains(row.Id)).ToArray(), Steps = current.Steps.Where(row => !ids.Contains(row.Id)).ToArray(), Images = current.Images.Where(row => !ids.Contains(row.Id)).ToArray() };
            if (LoseResponseAfterTransaction) throw new HttpRequestException("response lost");
            return Task.CompletedTask;
        }
    }
}
