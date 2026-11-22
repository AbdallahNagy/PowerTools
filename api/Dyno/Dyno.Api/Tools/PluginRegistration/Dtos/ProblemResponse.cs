using Dyno.Api.Tools.PluginRegistration.Validation;

namespace Dyno.Api.Tools.PluginRegistration.Dtos;

public sealed record ProblemResponse(
    string Code,
    string Message,
    IReadOnlyList<RegistrationProblem> Problems);
