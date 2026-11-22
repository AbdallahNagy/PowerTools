namespace Dyno.Api.Tools.PluginRegistration.Dtos;

public sealed record CapabilitiesDto(
    bool IsOnline,
    IReadOnlyList<int> IsolationModes,
    IReadOnlyList<int> SourceTypes);
