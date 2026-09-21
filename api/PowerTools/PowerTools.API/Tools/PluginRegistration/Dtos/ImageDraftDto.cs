namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record ImageDraftDto(
    Guid StepId,
    string Name,
    string EntityAlias,
    int ImageType,
    IReadOnlyList<string> Attributes);
