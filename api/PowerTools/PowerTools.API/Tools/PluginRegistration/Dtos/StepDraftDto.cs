namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record StepDraftDto(
    string Name,
    Guid PluginTypeId,
    Guid MessageId,
    Guid? FilterId,
    int Stage,
    int Mode,
    int Rank,
    int SupportedDeployment,
    bool AsyncAutoDelete,
    IReadOnlyList<string> FilteringAttributes,
    Guid? ImpersonatingUserId,
    string? Description,
    string? Configuration,
    string SecureConfigurationAction,
    string? SecureConfiguration);
