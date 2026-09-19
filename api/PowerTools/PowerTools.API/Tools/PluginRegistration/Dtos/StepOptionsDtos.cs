namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record StepOptionsDto(
    IReadOnlyList<MessageOptionDto> Messages,
    IReadOnlyList<FilterOptionDto> Filters,
    IReadOnlyList<UserOptionDto> Users);

public sealed record MessageOptionDto(Guid Id, string Name);

public sealed record FilterOptionDto(
    Guid Id,
    Guid MessageId,
    string? PrimaryEntity,
    string? SecondaryEntity,
    int Availability);

public sealed record UserOptionDto(Guid Id, string FullName);
