using Dyno.Api.Tools.PluginRegistration.Dtos;
using Dyno.Api.Tools.PluginRegistration.Validation;

namespace Dyno.Api.Tools.PluginRegistration;

public sealed class RegistrationException : Exception
{
    public RegistrationException(int statusCode, ProblemResponse problem)
        : base(problem.Message)
    {
        StatusCode = statusCode;
        Problem = problem;
    }

    public int StatusCode { get; }
    public ProblemResponse Problem { get; }

    public static RegistrationException Validation(IReadOnlyList<RegistrationProblem> problems) =>
        new(StatusCodes.Status400BadRequest, new ProblemResponse(
            "validation_failed",
            "The registration request is invalid.",
            problems));

    public static RegistrationException Conflict(
        string code,
        string message,
        IReadOnlyList<RegistrationProblem>? problems = null) =>
        new(StatusCodes.Status409Conflict, new ProblemResponse(
            code,
            message,
            problems ?? []));

    public static RegistrationException NotFound(string code, string message) =>
        new(StatusCodes.Status404NotFound, new ProblemResponse(code, message, []));
}
