using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Preflight;

public sealed class PluginRegistrationPreflightServiceTests
{
    [Fact]
    public void Ordering_only_differences_in_sets_produce_the_same_request_digest()
    {
        var service = CreateService();
        var first = new StepDraft(
            10,
            ["accountnumber", "name"],
            [new ImageDraft("pre", ["name", "accountnumber"])]);
        var reordered = new StepDraft(
            10,
            ["name", "accountnumber"],
            [new ImageDraft("pre", ["accountnumber", "name"])]);

        Assert.Equal(
            service.CalculateRequestDigest(first),
            service.CalculateRequestDigest(reordered));
    }

    [Fact]
    public void Changed_step_rank_produces_a_different_request_digest()
    {
        var service = CreateService();
        var baseline = new StepDraft(10, ["name"], []);
        var changed = baseline with { Rank = 20 };

        Assert.NotEqual(
            service.CalculateRequestDigest(baseline),
            service.CalculateRequestDigest(changed));
    }

    [Fact]
    public void Changed_image_column_produces_a_different_request_digest()
    {
        var service = CreateService();
        var baseline = new StepDraft(10, ["name"], [new ImageDraft("pre", ["name"])]);
        var changed = new StepDraft(10, ["name"], [new ImageDraft("pre", ["accountnumber"])]);

        Assert.NotEqual(
            service.CalculateRequestDigest(baseline),
            service.CalculateRequestDigest(changed));
    }

    [Fact]
    public void Reordered_mutation_relevant_array_produces_a_different_request_digest()
    {
        var service = CreateService();
        var first = new OrderedDraft(["delete-image", "delete-step"]);
        var reordered = new OrderedDraft(["delete-step", "delete-image"]);

        Assert.NotEqual(
            service.CalculateRequestDigest(first),
            service.CalculateRequestDigest(reordered));
    }

    [Fact]
    public async Task Execution_reloads_state_and_rejects_a_changed_server_version_before_mutation()
    {
        var service = CreateService();
        var request = new MutationPreflightRequest(
            "https://contoso.crm.dynamics.com",
            "steps.update",
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            new StepDraft(10, ["name"], []),
            new Dictionary<Guid, long>
            {
                [Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")] = 7
            },
            null,
            new Dictionary<string, bool>());
        var plan = service.CreatePlan(request, [], new MutationImpactDto([], [], []));
        var reloadCount = 0;

        var error = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() =>
            service.ValidateExecutionAsync(
                plan.Token,
                request,
                _ =>
                {
                    reloadCount++;
                    return Task.FromResult(request with
                    {
                        ServerVersions = new Dictionary<Guid, long>
                        {
                            [Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")] = 8
                        }
                    });
                },
                CancellationToken.None));

        Assert.Equal(1, reloadCount);
        Assert.Equal(PlanValidationFailure.BindingMismatch, error.Failure);
    }

    [Theory]
    [InlineData("capabilities")]
    [InlineData("assemblySha256")]
    [InlineData("normalizedRequest")]
    public async Task Execution_reloads_state_and_rejects_every_additional_changed_binding_value(
        string changedValue)
    {
        var service = CreateService();
        var request = CreateRequest();
        var plan = service.CreatePlan(request, [], new MutationImpactDto([], [], []));
        var reloadCount = 0;

        var error = await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() =>
            service.ValidateExecutionAsync(
                plan.Token,
                request,
                _ =>
                {
                    reloadCount++;
                    return Task.FromResult(changedValue switch
                    {
                        "capabilities" => request with
                        {
                            Capabilities = new Dictionary<string, bool>
                            {
                                ["transactionalCascadeUnregister"] = true
                            }
                        },
                        "assemblySha256" => request with { AssemblySha256 = "changed-assembly-hash" },
                        "normalizedRequest" => request with
                        {
                            NormalizedRequest = new StepDraft(20, ["name"], [])
                        },
                        _ => throw new ArgumentOutOfRangeException(nameof(changedValue))
                    });
                },
                CancellationToken.None));

        Assert.Equal(1, reloadCount);
        Assert.Equal(PlanValidationFailure.BindingMismatch, error.Failure);
    }

    private static PluginRegistrationPreflightService CreateService()
    {
        var time = new ManualTimeProvider(new DateTimeOffset(2026, 8, 30, 10, 0, 0, TimeSpan.Zero));
        return new PluginRegistrationPreflightService(
            new PluginRegistrationPlanSigner("sidecar-secret", time));
    }

    private static MutationPreflightRequest CreateRequest() => new(
        "https://contoso.crm.dynamics.com",
        "steps.update",
        Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        new StepDraft(10, ["name"], []),
        new Dictionary<Guid, long>
        {
            [Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")] = 7
        },
        "assembly-hash",
        new Dictionary<string, bool>
        {
            ["transactionalCascadeUnregister"] = false
        });

    private sealed record StepDraft(
        int Rank,
        IReadOnlyList<string> FilteringAttributes,
        IReadOnlyList<ImageDraft> Images);

    private sealed record ImageDraft(string Alias, IReadOnlyList<string> Attributes);

    private sealed record OrderedDraft(IReadOnlyList<string> OrderedOperations);
}
