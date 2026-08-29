using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Preflight;

public sealed class PluginRegistrationPlanSignerTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 30, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Signed_binding_round_trips_when_every_bound_value_matches()
    {
        var time = new ManualTimeProvider(Now);
        var signer = new PluginRegistrationPlanSigner("sidecar-secret", time);
        var binding = CreateBinding(signer);

        var result = signer.Validate(signer.Sign(binding), binding);

        Assert.True(result.IsValid);
        Assert.NotNull(result.Binding);
        Assert.Equal(binding.Environment, result.Binding.Environment);
        Assert.Equal(binding.Operation, result.Binding.Operation);
        Assert.Equal(binding.TargetId, result.Binding.TargetId);
        Assert.Equal(binding.RequestDigest, result.Binding.RequestDigest);
        Assert.Equal(binding.AssemblySha256, result.Binding.AssemblySha256);
        Assert.Equal(binding.IssuedAt, result.Binding.IssuedAt);
        Assert.Equal(binding.ExpiresAt, result.Binding.ExpiresAt);
        Assert.Equal(binding.ServerVersions.OrderBy(pair => pair.Key),
            result.Binding.ServerVersions.OrderBy(pair => pair.Key));
        Assert.Equal(binding.Capabilities.OrderBy(pair => pair.Key),
            result.Binding.Capabilities.OrderBy(pair => pair.Key));
    }

    [Fact]
    public void One_bit_token_tampering_is_rejected()
    {
        var time = new ManualTimeProvider(Now);
        var signer = new PluginRegistrationPlanSigner("sidecar-secret", time);
        var binding = CreateBinding(signer);
        var token = signer.Sign(binding);
        var replacement = token[^1] == 'A' ? 'B' : 'A';

        var result = signer.Validate(token[..^1] + replacement, binding);

        Assert.False(result.IsValid);
        Assert.Equal(PlanValidationFailure.InvalidToken, result.Failure);
    }

    [Theory]
    [InlineData("environment")]
    [InlineData("target")]
    [InlineData("request")]
    [InlineData("versions")]
    [InlineData("hash")]
    public void Changed_bound_value_is_rejected(string changedValue)
    {
        var time = new ManualTimeProvider(Now);
        var signer = new PluginRegistrationPlanSigner("sidecar-secret", time);
        var binding = CreateBinding(signer);
        var changed = changedValue switch
        {
            "environment" => binding with { Environment = "https://other.crm.dynamics.com" },
            "target" => binding with { TargetId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee") },
            "request" => binding with { RequestDigest = "different-request-digest" },
            "versions" => binding with
            {
                ServerVersions = new Dictionary<Guid, long>
                {
                    [Guid.Parse("11111111-1111-1111-1111-111111111111")] = 8,
                    [Guid.Parse("22222222-2222-2222-2222-222222222222")] = 12
                }
            },
            "hash" => binding with { AssemblySha256 = "different-dll-hash" },
            _ => throw new ArgumentOutOfRangeException(nameof(changedValue))
        };

        var result = signer.Validate(signer.Sign(binding), changed);

        Assert.False(result.IsValid);
        Assert.Equal(PlanValidationFailure.BindingMismatch, result.Failure);
    }

    [Fact]
    public void Expired_token_is_rejected()
    {
        var time = new ManualTimeProvider(Now);
        var signer = new PluginRegistrationPlanSigner("sidecar-secret", time);
        var binding = CreateBinding(signer);
        var token = signer.Sign(binding);
        time.Advance(TimeSpan.FromMinutes(5));

        var result = signer.Validate(token, binding);

        Assert.False(result.IsValid);
        Assert.Equal(PlanValidationFailure.Expired, result.Failure);
    }

    [Fact]
    public void Future_issued_token_is_rejected()
    {
        var time = new ManualTimeProvider(Now);
        var signer = new PluginRegistrationPlanSigner("sidecar-secret", time);
        var binding = CreateBinding(signer) with
        {
            IssuedAt = Now.AddSeconds(1),
            ExpiresAt = Now.AddMinutes(5).AddSeconds(1)
        };

        var result = signer.Validate(signer.Sign(binding), binding);

        Assert.False(result.IsValid);
        Assert.Equal(PlanValidationFailure.IssuedInFuture, result.Failure);
    }

    private static MutationPlanBinding CreateBinding(PluginRegistrationPlanSigner signer) =>
        signer.CreateBinding(
            "https://contoso.crm.dynamics.com",
            "steps.update",
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            "normalized-request-digest",
            new Dictionary<Guid, long>
            {
                [Guid.Parse("22222222-2222-2222-2222-222222222222")] = 12,
                [Guid.Parse("11111111-1111-1111-1111-111111111111")] = 7
            },
            "assembly-sha256",
            new Dictionary<string, bool>
            {
                ["transactionalCascadeUnregister"] = false,
                ["onPremisesAssemblyStorage"] = true
            });
}
