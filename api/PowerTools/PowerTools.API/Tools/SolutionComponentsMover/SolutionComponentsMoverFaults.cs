using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public sealed record SolutionComponentsProblem(int Status, string Code, string Message);

public sealed class SolutionComponentsResult<T>
{
    private SolutionComponentsResult(T? value, SolutionComponentsProblem? problem)
    {
        Value = value;
        Problem = problem;
    }

    public T? Value { get; }
    public SolutionComponentsProblem? Problem { get; }

    public static SolutionComponentsResult<T> Ok(T value) => new(value, null);

    public static SolutionComponentsResult<T> Fail(SolutionComponentsProblem problem) => new(default, problem);
}

public static class SolutionComponentsMoverFaults
{
    public const int ServiceProtection = unchecked((int)0x80072322);
    public const string BlockUnmanagedText = "This environment doesn't allow unmanaged customizations";

    public static SolutionComponentsProblem Local(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    public static SolutionComponentsProblem From(Exception exception) =>
        new(
            StatusCodes.Status400BadRequest,
            "DataverseFault",
            DataverseErrorFormatter.Format(exception));

    public static FaultException<OrganizationServiceFault>? Unwrap(Exception exception) =>
        exception as FaultException<OrganizationServiceFault>
        ?? exception.InnerException as FaultException<OrganizationServiceFault>;
}
