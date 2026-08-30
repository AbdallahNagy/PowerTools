using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.PluginRegistration.Tests.Support;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class PluginImageMutationTests
{
    [Fact]
    public async Task Create_preflight_signs_normalized_state_and_execute_verifies_readback()
    {
        var gateway = new FakeGateway();
        var service = Service();
        var draft = Draft(null, ["Name", "accountnumber"]);
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "create", draft, default);

        var result = await service.ExecuteAsync(gateway, "Dev", "create", preview.Plan.Token, draft, null, default);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal(["accountnumber", "name"], gateway.LastCommand!.Draft.Attributes);
        Assert.Equal(11, gateway.LastCommand.ExpectedStepVersion);
    }

    [Fact]
    public async Task Unregister_requires_exact_name_and_verifies_absence()
    {
        var gateway = new FakeGateway { ExistingImage = Image() };
        var service = Service();
        var draft = Draft(gateway.ExistingImage.Id, ["name"]);
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "unregister", draft, default);
        await Assert.ThrowsAsync<ArgumentException>(() => service.ExecuteAsync(gateway, "Dev", "unregister", preview.Plan.Token, draft, "wrong", default));

        var result = await service.ExecuteAsync(gateway, "Dev", "unregister", preview.Plan.Token, draft, "PreImage", default);
        Assert.True(result.SucceededAndVerified);
        Assert.Null(result.Image);
    }

    [Fact]
    public async Task Update_writes_the_submitted_values_instead_of_the_current_catalog_values()
    {
        var gateway = new FakeGateway { ExistingImage = Image() };
        var service = Service();
        var draft = new ImageDraftDto(StepId, 0, "After", "Target", ["accountnumber"],
            new Dictionary<Guid, long> { [StepId] = 11, [ImageId] = 22 });
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "update", draft, default);
        var result = await service.ExecuteAsync(gateway, "Dev", "update", preview.Plan.Token, draft, null, default);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal(0, gateway.LastCommand!.Draft.ImageType);
        Assert.Equal("After", gateway.LastCommand.Draft.Alias);
        Assert.Equal(["accountnumber"], gateway.LastCommand.Draft.Attributes);
    }

    [Fact]
    public async Task Rejects_target_image_owned_by_a_different_step_before_preflight()
    {
        var gateway = new FakeGateway { ExistingImage = Image() with { PluginStepId = Guid.NewGuid() } };
        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => Service().CreatePreflightAsync(
            gateway, "Dev", "update", Draft(ImageId, ["name"]), default));
        Assert.Null(gateway.LastCommand);
    }

    [Fact]
    public async Task Blocks_managed_parent_and_fresh_delete_dependencies()
    {
        var gateway = new FakeGateway { ExistingImage = Image(), ParentManaged = true };
        var managed = await Service().CreatePreflightAsync(gateway, "Dev", "update", Draft(ImageId, ["name"]), default);
        Assert.Contains(managed.Plan.Blockers, x => x.Code == "managedParent");
        gateway.ParentManaged = false;
        gateway.Dependencies = [new(Guid.NewGuid(), "Solution component", "Workflow", null, false, true, 1)];
        var blocked = await Service().CreatePreflightAsync(gateway, "Dev", "unregister", Draft(ImageId, ["name"]), default);
        Assert.Contains(blocked.Plan.Blockers, x => x.Code == "dependency");
        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => Service().ExecuteAsync(gateway, "Dev",
            "unregister", blocked.Plan.Token, Draft(ImageId, ["name"]), "PreImage", default));
    }

    private static PluginImageMutationService Service()
    {
        var signer = new PluginRegistrationPlanSigner("test-secret", new ManualTimeProvider(new DateTimeOffset(2026, 8, 30, 0, 0, 0, TimeSpan.Zero)));
        return new(new PluginImageValidator(), new PluginRegistrationPreflightService(signer));
    }
    private static ImageDraftDto Draft(Guid? imageId, IReadOnlyList<string> attributes) => new(StepId, 0, "PreImage", "Target", attributes,
        imageId is null ? new Dictionary<Guid, long> { [StepId] = 11 } : new Dictionary<Guid, long> { [StepId] = 11, [imageId.Value] = 22 });
    private static PluginImageRow Image() => new(ImageId, StepId, "PreImage", null, "Pre Image", "PreImage", ["name"], false, true, 22, null);
    private static readonly Guid StepId = Guid.NewGuid();
    private static readonly Guid ImageId = Guid.NewGuid();

    private sealed class FakeGateway : IPluginRegistrationGateway
    {
        public PluginImageRow? ExistingImage { get; set; }
        public bool ParentManaged { get; set; }
        public IReadOnlyList<ComponentDependencyDto> Dependencies { get; set; } = [];
        private bool mutated;
        public PluginImageMutationCommand? LastCommand { get; private set; }
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) => Task.FromResult(new PluginRegistrationRows([], [],
            [new PluginStepRow(StepId, Guid.NewGuid(), "Update account", null, "Update", "account", null, "PreOperation", "Synchronous", 20, 0, 1, true, false, true, mutated ? 12 : 11, false, null)],
            ExistingImage is null ? [] : [ExistingImage]));
        public Task<PluginImagePreflightState> RetrieveImagePreflightStateAsync(Guid stepId, Guid? imageId, ImageDraftDto draft, CancellationToken cancellationToken) =>
            Task.FromResult(new PluginImagePreflightState(imageId, ExistingImage?.Name, "Update", 20, "account", "Target", ["accountid", "name", "accountnumber"], false,
                ExistingImage?.IsManaged ?? false, ExistingImage?.IsCustomizable ?? true, 11, ExistingImage?.VersionNumber, stepId)
                { ParentIsManaged = ParentManaged, ParentIsCustomizable = true, Dependencies = Dependencies });
        public Task<Guid> MutateImageAsync(PluginImageMutationCommand command, CancellationToken cancellationToken)
        {
            LastCommand = command;
            mutated = true;
            if (command.Operation == "unregister") { ExistingImage = null; return Task.FromResult(command.TargetImageId!.Value); }
            ExistingImage = new PluginImageRow(command.TargetImageId ?? ImageId, StepId,
                command.Operation == "update" ? ExistingImage?.Name ?? command.Draft.Alias : command.Draft.Alias, null,
                command.Draft.ImageType == 0 ? "Pre Image" : "Post Image", command.Draft.Alias, command.Draft.Attributes, false, true, 23, null);
            return Task.FromResult(ExistingImage.Id);
        }
    }
}
