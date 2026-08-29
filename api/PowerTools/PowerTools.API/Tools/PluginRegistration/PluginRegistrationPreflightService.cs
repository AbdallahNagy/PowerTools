using System.Buffers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginRegistrationPreflightService(PluginRegistrationPlanSigner signer)
{
    public string CalculateRequestDigest(object normalizedRequest)
    {
        ArgumentNullException.ThrowIfNull(normalizedRequest);
        var element = JsonSerializer.SerializeToElement(normalizedRequest);
        var canonical = Canonicalize(element);
        try
        {
            return Convert.ToHexString(SHA256.HashData(canonical)).ToLowerInvariant();
        }
        finally
        {
            CryptographicOperations.ZeroMemory(canonical);
        }
    }

    public MutationPlanDto CreatePlan(
        MutationPreflightRequest request,
        IReadOnlyList<MutationChangeDto> changes,
        MutationImpactDto impact,
        IReadOnlyList<MutationWarningDto>? warnings = null,
        IReadOnlyList<MutationBlockerDto>? blockers = null,
        ConfirmationRequirementDto? confirmation = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(changes);
        ArgumentNullException.ThrowIfNull(impact);

        var binding = BuildBinding(request);
        return new MutationPlanDto(
            signer.Sign(binding),
            binding.Environment,
            binding.Operation,
            binding.TargetId,
            binding.ExpiresAt,
            changes,
            impact,
            warnings ?? [],
            blockers ?? [],
            confirmation ?? new ConfirmationRequirementDto(
                "standard",
                "Review the planned change before confirming."));
    }

    public async Task<MutationPlanBinding> ValidateExecutionAsync(
        string token,
        MutationPreflightRequest request,
        Func<CancellationToken, Task<MutationPreflightRequest>> rereadCurrentState,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(token);
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(rereadCurrentState);

        var signed = signer.Validate(token);
        if (!signed.IsValid || signed.Binding is null)
            throw new PluginRegistrationPreflightException(signed.Failure);

        var submittedBinding = BuildBinding(request, signed.Binding.IssuedAt, signed.Binding.ExpiresAt);
        if (!string.Equals(signed.Binding.RequestDigest, submittedBinding.RequestDigest, StringComparison.Ordinal)
            || !string.Equals(signed.Binding.Environment, submittedBinding.Environment, StringComparison.Ordinal)
            || !string.Equals(signed.Binding.Operation, submittedBinding.Operation, StringComparison.Ordinal)
            || signed.Binding.TargetId != submittedBinding.TargetId)
            throw new PluginRegistrationPreflightException(PlanValidationFailure.BindingMismatch);

        var current = await rereadCurrentState(cancellationToken);
        var currentBinding = BuildBinding(current, signed.Binding.IssuedAt, signed.Binding.ExpiresAt);
        var validated = signer.Validate(token, currentBinding);
        if (!validated.IsValid || validated.Binding is null)
            throw new PluginRegistrationPreflightException(validated.Failure);

        return validated.Binding;
    }

    private MutationPlanBinding BuildBinding(
        MutationPreflightRequest request,
        DateTimeOffset? issuedAt = null,
        DateTimeOffset? expiresAt = null)
    {
        var binding = signer.CreateBinding(
            request.Environment,
            request.Operation,
            request.TargetId,
            CalculateRequestDigest(request.NormalizedRequest),
            request.ServerVersions,
            request.AssemblySha256,
            request.Capabilities);
        return issuedAt.HasValue && expiresAt.HasValue
            ? binding with { IssuedAt = issuedAt.Value, ExpiresAt = expiresAt.Value }
            : binding;
    }

    private static byte[] Canonicalize(JsonElement value)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
            WriteCanonical(value, writer);
        return buffer.WrittenSpan.ToArray();
    }

    private static void WriteCanonical(JsonElement value, Utf8JsonWriter writer)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in value.EnumerateObject()
                    .OrderBy(property => property.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    WriteCanonical(property.Value, writer);
                }
                writer.WriteEndObject();
                return;

            case JsonValueKind.Array:
                var values = value.EnumerateArray()
                    .Select(Canonicalize)
                    .OrderBy(bytes => Convert.ToBase64String(bytes), StringComparer.Ordinal)
                    .ToArray();
                try
                {
                    writer.WriteStartArray();
                    foreach (var item in values)
                        writer.WriteRawValue(item, skipInputValidation: true);
                    writer.WriteEndArray();
                }
                finally
                {
                    foreach (var item in values)
                        CryptographicOperations.ZeroMemory(item);
                }
                return;

            default:
                value.WriteTo(writer);
                return;
        }
    }
}

public sealed class PluginRegistrationPreflightException(PlanValidationFailure failure)
    : Exception("The mutation plan is no longer valid.")
{
    public PlanValidationFailure Failure { get; } = failure;
}
