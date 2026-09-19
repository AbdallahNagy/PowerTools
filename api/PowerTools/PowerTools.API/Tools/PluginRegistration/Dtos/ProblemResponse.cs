using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record ProblemResponse(
    string Code,
    string Message,
    IReadOnlyList<RegistrationProblem> Problems);
