using PowerTools.API.Tools.CommunityToolApi;
using PowerTools.API.Tools.PolymorphicLookup;

namespace PowerTools.API.Tools.Agent;

/// <summary>An agent route's failure, answered as { code, message, dataverseCode? } like /api/community-tools.</summary>
public sealed record AgentProblem(int Status, string Code, string Message, int? DataverseCode = null)
{
    public CommunityToolErrorDto ToError() => new(Code, Message, DataverseCode);
}

public sealed record AgentResult<T>(T? Value, AgentProblem? Problem)
{
    public static AgentResult<T> Ok(T value) => new(value, null);

    public static AgentResult<T> Fail(AgentProblem problem) => new(default, problem);
}

/// <summary>Bad input found part-way through a service call; becomes the result's problem.</summary>
public sealed class AgentProblemException(AgentProblem problem) : Exception(problem.Message)
{
    public AgentProblem Problem { get; } = problem;
}

public static class AgentFaults
{
    public const string InvalidRequestCode = "InvalidRequest";
    public const string NotFoundCode = "NotFound";
    public const string PublisherRequiredCode = "PublisherRequired";

    public static AgentProblem InvalidRequest(string message) =>
        new(StatusCodes.Status400BadRequest, InvalidRequestCode, message);

    public static AgentProblem NotFound(string message) =>
        new(StatusCodes.Status404NotFound, NotFoundCode, message);

    public static AgentProblem PublisherRequired(string message) =>
        new(StatusCodes.Status400BadRequest, PublisherRequiredCode, message);

    /// <summary>Maps a Dataverse or local exception to the problem the route answers with.</summary>
    public static AgentProblem From(Exception exception)
    {
        if (exception is AgentProblemException local)
            return local.Problem;
        if (exception is PolymorphicLookupValidationException lookup)
            return FromLookup(lookup.Problem);

        var problem = CommunityToolFaults.From(exception, metadata: true);
        return new AgentProblem(problem.Status, problem.Code, problem.Message, problem.DataverseCode);
    }

    /// <summary>
    /// Maps a problem from an existing tool service. Its local checks (400, 409) are bad arguments;
    /// 429 is throttling; the rest are Dataverse failures.
    /// </summary>
    public static AgentProblem FromExternal(int status, string code, string message) =>
        status == StatusCodes.Status429TooManyRequests
            ? new AgentProblem(status, "Throttled", message)
            : status is StatusCodes.Status400BadRequest or StatusCodes.Status409Conflict && code != "DataverseFault"
                ? new AgentProblem(StatusCodes.Status400BadRequest, InvalidRequestCode, message)
                : new AgentProblem(status, "DataverseFault", message);

    public static AgentProblem FromLookup(PolymorphicLookupProblem problem) =>
        problem.Status == StatusCodes.Status400BadRequest
            ? InvalidRequest(problem.Message)
            : new AgentProblem(problem.Status, "DataverseFault", problem.Message);
}
