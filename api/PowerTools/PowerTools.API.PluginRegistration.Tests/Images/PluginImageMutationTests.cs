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

    [Theory]
    [InlineData("update")]
    [InlineData("unregister")]
    public async Task Lost_image_response_is_reconciled_from_normalized_update_or_absence(string operation)
    {
        var gateway = new FakeGateway { ExistingImage = Image(), LoseResponseAfterMutation = true };
        var service = Service();
        var draft = operation == "update"
            ? new ImageDraftDto(StepId, 0, "After", "Target", ["accountnumber"],
                new Dictionary<Guid, long> { [StepId] = 11, [ImageId] = 22 })
            : Draft(ImageId, ["name"]);
        var preview = await service.CreatePreflightAsync(gateway, "Dev", operation, draft, default);

        var result = await service.ExecuteAsync(gateway, "Dev", operation, preview.Plan.Token, draft,
            operation == "unregister" ? "PreImage" : null, default);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
        Assert.True(result.SucceededAndVerified);
    }

    [Fact]
    public async Task Update_readback_requires_the_image_row_version_to_advance()
    {
        var gateway = new FakeGateway { ExistingImage = Image(), KeepImageVersionAfterMutation = true };
        var service = Service();
        var draft = new ImageDraftDto(StepId, 0, "After", "Target", ["accountnumber"],
            new Dictionary<Guid, long> { [StepId] = 11, [ImageId] = 22 });
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "update", draft, default);

        var result = await service.ExecuteAsync(gateway, "Dev", "update",
            preview.Plan.Token, draft, null, default);

        Assert.Equal("outcomeUncertain", result.Outcome);
        Assert.False(result.SucceededAndVerified);
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

    [Fact]
    public async Task Unregister_binds_the_complete_dependency_snapshot_for_add_remove_and_replace_changes()
    {
        var time = new ManualTimeProvider(new DateTimeOffset(2026, 8, 30, 0, 0, 0, TimeSpan.Zero));
        var signer = new PluginRegistrationPlanSigner("test-secret", time);
        var preflight = new PluginRegistrationPreflightService(signer);
        var gateway = new FakeGateway { ExistingImage = Image() };
        var baseline = Dependency("Baseline", 1);
        gateway.Dependencies = [baseline];
        var preview = await new PluginImageMutationService(new PluginImageValidator(), preflight)
            .CreatePreflightAsync(gateway, "Dev", "unregister", Draft(ImageId, ["name"]), default);

        var signed = signer.Validate(preview.Plan.Token).Binding!;
        var request = ImageRequest(preview.Draft, [baseline]);
        Assert.Equal(preflight.CalculateRequestDigest(request.NormalizedRequest), signed.RequestDigest);

        foreach (var changed in new IReadOnlyList<ComponentDependencyDto>[]
        {
            [baseline, Dependency("Added", 2)],
            [],
            [Dependency("Replacement", 3)]
        })
        {
            var failure = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => preflight.ValidateExecutionAsync(
                preview.Plan.Token, request, _ => Task.FromResult(ImageRequest(preview.Draft, changed)), default));
            Assert.Equal(PlanValidationFailure.BindingMismatch, failure.Failure);
        }
    }

    [Fact]
    public async Task Unregister_rejects_a_dependency_added_between_initial_read_and_final_revalidation()
    {
        var gateway = new FakeGateway { ExistingImage = Image(), DependenciesAfterStateRead = 3 };
        var service = Service();
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "unregister", Draft(ImageId, ["name"]), default);
        gateway.Dependencies = [Dependency("Workflow", 4)];

        var failure = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => service.ExecuteAsync(gateway,
            "Dev", "unregister", preview.Plan.Token, Draft(ImageId, ["name"]), "PreImage", default));

        Assert.Equal(PlanValidationFailure.BindingMismatch, failure.Failure);
        Assert.Null(gateway.LastCommand);
    }

    [Fact]
    public async Task Execute_rejects_tampered_request_and_token_without_mutating()
    {
        var gateway = new FakeGateway { ExistingImage = Image() };
        var service = Service();
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "update", Draft(ImageId, ["name"]), default);

        var requestFailure = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => service.ExecuteAsync(gateway,
            "Dev", "update", preview.Plan.Token, Draft(ImageId, ["accountnumber"]), null, default));
        Assert.Equal(PlanValidationFailure.BindingMismatch, requestFailure.Failure);

        var tokenFailure = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => service.ExecuteAsync(gateway,
            "Dev", "update", preview.Plan.Token + "x", Draft(ImageId, ["name"]), null, default));
        Assert.Equal(PlanValidationFailure.InvalidToken, tokenFailure.Failure);
        Assert.Null(gateway.LastCommand);
    }

    [Fact]
    public async Task Execute_rejects_an_expired_plan_without_mutating()
    {
        var time = new ManualTimeProvider(new DateTimeOffset(2026, 8, 30, 0, 0, 0, TimeSpan.Zero));
        var gateway = new FakeGateway { ExistingImage = Image() };
        var service = Service(time);
        var preview = await service.CreatePreflightAsync(gateway, "Dev", "update", Draft(ImageId, ["name"]), default);
        time.Advance(PluginRegistrationPlanSigner.DefaultLifetime);

        var failure = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => service.ExecuteAsync(gateway,
            "Dev", "update", preview.Plan.Token, Draft(ImageId, ["name"]), null, default));

        Assert.Equal(PlanValidationFailure.Expired, failure.Failure);
        Assert.Null(gateway.LastCommand);
    }

    private static PluginImageMutationService Service()
    {
        return Service(new ManualTimeProvider(new DateTimeOffset(2026, 8, 30, 0, 0, 0, TimeSpan.Zero)));
    }
    private static PluginImageMutationService Service(ManualTimeProvider time)
    {
        var signer = new PluginRegistrationPlanSigner("test-secret", time);
        return new(new PluginImageValidator(), new PluginRegistrationPreflightService(signer));
    }
    private static ImageDraftDto Draft(Guid? imageId, IReadOnlyList<string> attributes) => new(StepId, 0, "PreImage", "Target", attributes,
        imageId is null ? new Dictionary<Guid, long> { [StepId] = 11 } : new Dictionary<Guid, long> { [StepId] = 11, [imageId.Value] = 22 });
    private static PluginImageRow Image() => new(ImageId, StepId, "PreImage", null, "Pre Image", "PreImage", ["name"], false, true, 22, null);
    private static ComponentDependencyDto Dependency(string name, long version) => new(Guid.NewGuid(), name, "Workflow", "Solution", false, true, version);
    private static MutationPreflightRequest ImageRequest(ImageDraftDto draft, IReadOnlyList<ComponentDependencyDto> dependencies) =>
        new("Dev", "images.unregister", ImageId, new { Draft = draft, Dependencies = dependencies }, draft.ExpectedVersions, null, new Dictionary<string, bool>());
    private static readonly Guid StepId = Guid.NewGuid();
    private static readonly Guid ImageId = Guid.NewGuid();

    private sealed class FakeGateway : IPluginRegistrationGateway
    {
        public PluginImageRow? ExistingImage { get; set; }
        public bool ParentManaged { get; set; }
        public IReadOnlyList<ComponentDependencyDto> Dependencies { get; set; } = [];
        public int DependenciesAfterStateRead { get; set; }
        public bool LoseResponseAfterMutation { get; init; }
        public bool KeepImageVersionAfterMutation { get; init; }
        private int stateReads;
        private bool mutated;
        public PluginImageMutationCommand? LastCommand { get; private set; }
        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) => Task.FromResult(new PluginRegistrationRows([], [],
            [new PluginStepRow(StepId, Guid.NewGuid(), "Update account", null, "Update", "account", null, "PreOperation", "Synchronous", 20, 0, 1, true, false, true, mutated ? 12 : 11, false, null)],
            ExistingImage is null ? [] : [ExistingImage]));
        public Task<PluginImagePreflightState> RetrieveImagePreflightStateAsync(Guid stepId, Guid? imageId, ImageDraftDto draft, CancellationToken cancellationToken)
        {
            stateReads++;
            var dependencies = stateReads >= DependenciesAfterStateRead ? Dependencies : [];
            return Task.FromResult(new PluginImagePreflightState(imageId, ExistingImage?.Name, "Update", 20, "account", "Target", ["accountid", "name", "accountnumber"], false,
                ExistingImage?.IsManaged ?? false, ExistingImage?.IsCustomizable ?? true, 11, ExistingImage?.VersionNumber, stepId)
                { ParentIsManaged = ParentManaged, ParentIsCustomizable = true, Dependencies = dependencies });
        }
        public Task<Guid> MutateImageAsync(PluginImageMutationCommand command, CancellationToken cancellationToken)
        {
            LastCommand = command;
            mutated = true;
            if (command.Operation == "unregister")
            {
                ExistingImage = null;
                if (LoseResponseAfterMutation) throw new HttpRequestException("response lost");
                return Task.FromResult(command.TargetImageId!.Value);
            }
            ExistingImage = new PluginImageRow(command.TargetImageId ?? ImageId, StepId,
                command.Operation == "update" ? ExistingImage?.Name ?? command.Draft.Alias : command.Draft.Alias, null,
                command.Draft.ImageType == 0 ? "Pre Image" : "Post Image", command.Draft.Alias, command.Draft.Attributes, false, true,
                KeepImageVersionAfterMutation ? ExistingImage?.VersionNumber ?? 0 : 23, null);
            if (LoseResponseAfterMutation) throw new HttpRequestException("response lost");
            return Task.FromResult(ExistingImage.Id);
        }
    }
}
