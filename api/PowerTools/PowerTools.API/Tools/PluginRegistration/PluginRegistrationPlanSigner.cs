using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public sealed class PluginRegistrationPlanSigner
{
    public const string Purpose = "PowerTools.PluginRegistration.Plan.v1";
    public static readonly TimeSpan DefaultLifetime = TimeSpan.FromMinutes(5);

    private readonly byte[] key;
    private readonly TimeProvider timeProvider;
    private readonly TimeSpan lifetime;

    public PluginRegistrationPlanSigner(
        string sidecarSecret,
        TimeProvider timeProvider,
        TimeSpan? lifetime = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sidecarSecret);
        ArgumentNullException.ThrowIfNull(timeProvider);

        this.timeProvider = timeProvider;
        this.lifetime = lifetime ?? DefaultLifetime;
        if (this.lifetime <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(lifetime));

        key = DeriveKey(sidecarSecret);
    }

    public MutationPlanBinding CreateBinding(
        string environment,
        string operation,
        Guid? targetId,
        string requestDigest,
        IReadOnlyDictionary<Guid, long> serverVersions,
        string? assemblySha256,
        IReadOnlyDictionary<string, bool> capabilities)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(environment);
        ArgumentException.ThrowIfNullOrWhiteSpace(operation);
        ArgumentException.ThrowIfNullOrWhiteSpace(requestDigest);
        ArgumentNullException.ThrowIfNull(serverVersions);
        ArgumentNullException.ThrowIfNull(capabilities);

        var issuedAt = timeProvider.GetUtcNow();
        return new MutationPlanBinding(
            environment,
            operation,
            targetId,
            requestDigest,
            new Dictionary<Guid, long>(serverVersions),
            assemblySha256,
            new Dictionary<string, bool>(capabilities, StringComparer.Ordinal),
            issuedAt,
            issuedAt.Add(lifetime));
    }

    public string Sign(MutationPlanBinding binding)
    {
        ArgumentNullException.ThrowIfNull(binding);
        var payload = Serialize(binding);
        var signature = ComputeSignature(payload);
        try
        {
            return $"{Base64UrlEncode(payload)}.{Base64UrlEncode(signature)}";
        }
        finally
        {
            CryptographicOperations.ZeroMemory(signature);
        }
    }

    public PlanValidationResult Validate(
        string token,
        MutationPlanBinding? expected = null)
    {
        if (!TryReadSignedBinding(token, out var binding))
            return new PlanValidationResult(false, PlanValidationFailure.InvalidToken, null);

        var now = timeProvider.GetUtcNow();
        if (binding.IssuedAt > now)
            return new PlanValidationResult(false, PlanValidationFailure.IssuedInFuture, null);
        if (binding.ExpiresAt <= now)
            return new PlanValidationResult(false, PlanValidationFailure.Expired, null);
        if (binding.ExpiresAt <= binding.IssuedAt)
            return new PlanValidationResult(false, PlanValidationFailure.InvalidToken, null);
        if (expected is not null && !BindingsMatch(binding, expected))
            return new PlanValidationResult(false, PlanValidationFailure.BindingMismatch, null);

        return new PlanValidationResult(true, PlanValidationFailure.None, binding);
    }

    private bool TryReadSignedBinding(string token, out MutationPlanBinding binding)
    {
        binding = null!;
        if (string.IsNullOrWhiteSpace(token))
            return false;

        var parts = token.Split('.', StringSplitOptions.None);
        if (parts.Length != 2
            || !TryBase64UrlDecode(parts[0], out var payload)
            || !TryBase64UrlDecode(parts[1], out var suppliedSignature))
            return false;

        var expectedSignature = ComputeSignature(payload);
        try
        {
            if (!CryptographicOperations.FixedTimeEquals(suppliedSignature, expectedSignature))
                return false;

            return TryDeserialize(payload, out binding);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(payload);
            CryptographicOperations.ZeroMemory(suppliedSignature);
            CryptographicOperations.ZeroMemory(expectedSignature);
        }
    }

    private byte[] ComputeSignature(byte[] payload)
    {
        using var hmac = new HMACSHA256(key);
        return hmac.ComputeHash(payload);
    }

    private static byte[] DeriveKey(string sidecarSecret)
    {
        byte[] secret;
        try
        {
            secret = Convert.FromHexString(sidecarSecret);
        }
        catch (FormatException)
        {
            secret = Encoding.UTF8.GetBytes(sidecarSecret);
        }

        try
        {
            using var hmac = new HMACSHA256(secret);
            return hmac.ComputeHash(Encoding.UTF8.GetBytes(Purpose));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(secret);
        }
    }

    private static byte[] Serialize(MutationPlanBinding binding)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("environment", binding.Environment);
            writer.WriteString("operation", binding.Operation);
            if (binding.TargetId.HasValue)
                writer.WriteString("targetId", binding.TargetId.Value);
            else
                writer.WriteNull("targetId");
            writer.WriteString("requestDigest", binding.RequestDigest);
            writer.WritePropertyName("serverVersions");
            writer.WriteStartObject();
            foreach (var version in binding.ServerVersions.OrderBy(pair => pair.Key))
                writer.WriteNumber(version.Key.ToString("D"), version.Value);
            writer.WriteEndObject();
            writer.WriteString("assemblySha256", binding.AssemblySha256);
            writer.WritePropertyName("capabilities");
            writer.WriteStartObject();
            foreach (var capability in binding.Capabilities.OrderBy(pair => pair.Key, StringComparer.Ordinal))
                writer.WriteBoolean(capability.Key, capability.Value);
            writer.WriteEndObject();
            writer.WriteString("issuedAt", binding.IssuedAt.UtcDateTime);
            writer.WriteString("expiresAt", binding.ExpiresAt.UtcDateTime);
            writer.WriteEndObject();
        }

        return stream.ToArray();
    }

    private static bool TryDeserialize(byte[] payload, out MutationPlanBinding binding)
    {
        binding = null!;
        try
        {
            var serialized = JsonSerializer.Deserialize<SerializedBinding>(payload,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (serialized is null
                || string.IsNullOrWhiteSpace(serialized.Environment)
                || string.IsNullOrWhiteSpace(serialized.Operation)
                || string.IsNullOrWhiteSpace(serialized.RequestDigest)
                || serialized.ServerVersions is null
                || serialized.Capabilities is null)
                return false;

            var versions = serialized.ServerVersions.ToDictionary(
                pair => Guid.Parse(pair.Key),
                pair => pair.Value);
            binding = new MutationPlanBinding(
                serialized.Environment,
                serialized.Operation,
                serialized.TargetId,
                serialized.RequestDigest,
                versions,
                serialized.AssemblySha256,
                new Dictionary<string, bool>(serialized.Capabilities, StringComparer.Ordinal),
                serialized.IssuedAt,
                serialized.ExpiresAt);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool BindingsMatch(
        MutationPlanBinding actual,
        MutationPlanBinding expected) =>
        string.Equals(actual.Environment, expected.Environment, StringComparison.Ordinal)
        && string.Equals(actual.Operation, expected.Operation, StringComparison.Ordinal)
        && actual.TargetId == expected.TargetId
        && string.Equals(actual.RequestDigest, expected.RequestDigest, StringComparison.Ordinal)
        && string.Equals(actual.AssemblySha256, expected.AssemblySha256, StringComparison.Ordinal)
        && actual.IssuedAt == expected.IssuedAt
        && actual.ExpiresAt == expected.ExpiresAt
        && DictionaryMatches(actual.ServerVersions, expected.ServerVersions)
        && DictionaryMatches(actual.Capabilities, expected.Capabilities);

    private static bool DictionaryMatches<TKey, TValue>(
        IReadOnlyDictionary<TKey, TValue> actual,
        IReadOnlyDictionary<TKey, TValue> expected)
        where TKey : notnull
    {
        if (actual.Count != expected.Count)
            return false;

        var comparer = EqualityComparer<TValue>.Default;
        return actual.All(pair => expected.TryGetValue(pair.Key, out var value)
            && comparer.Equals(pair.Value, value));
    }

    private static string Base64UrlEncode(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private static bool TryBase64UrlDecode(string value, out byte[] bytes)
    {
        bytes = [];
        if (value.Length == 0 || value.Any(character => !(
            character is >= 'A' and <= 'Z'
            or >= 'a' and <= 'z'
            or >= '0' and <= '9'
            or '-' or '_')))
            return false;

        var base64 = value.Replace('-', '+').Replace('_', '/');
        base64 = (base64.Length % 4) switch
        {
            0 => base64,
            2 => base64 + "==",
            3 => base64 + "=",
            _ => ""
        };
        if (base64.Length == 0)
            return false;

        try
        {
            bytes = Convert.FromBase64String(base64);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private sealed record SerializedBinding(
        string Environment,
        string Operation,
        Guid? TargetId,
        string RequestDigest,
        Dictionary<string, long> ServerVersions,
        string? AssemblySha256,
        Dictionary<string, bool> Capabilities,
        DateTimeOffset IssuedAt,
        DateTimeOffset ExpiresAt);
}

public sealed record PlanValidationResult(
    bool IsValid,
    PlanValidationFailure Failure,
    MutationPlanBinding? Binding);

public enum PlanValidationFailure
{
    None,
    InvalidToken,
    Expired,
    IssuedInFuture,
    BindingMismatch
}
