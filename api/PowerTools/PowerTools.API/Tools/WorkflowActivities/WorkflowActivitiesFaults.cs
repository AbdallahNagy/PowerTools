using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.WorkflowActivities;

public sealed record WorkflowActivitiesProblem(int Status, string Code, string Message);

public static class WorkflowActivitiesFaults
{
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    public static WorkflowActivitiesProblem NotFound() =>
        new(
            StatusCodes.Status404NotFound,
            "ActivityNotFound",
            "This custom workflow activity was not found.");

    public static WorkflowActivitiesProblem From(Exception exception)
    {
        var fault = exception as FaultException<OrganizationServiceFault>
            ?? exception.InnerException as FaultException<OrganizationServiceFault>;
        var message = DataverseErrorFormatter.Format(exception);
        if (fault?.Detail.ErrorDetails is { } details && details.Contains("Retry-After"))
        {
            var retry = details["Retry-After"]?.ToString();
            if (!string.IsNullOrWhiteSpace(retry))
                message = $"{message} Retry after {retry}.";
        }

        if (fault is not null && IsServiceProtection(fault.Detail.ErrorCode))
        {
            return new WorkflowActivitiesProblem(
                StatusCodes.Status429TooManyRequests,
                "ServiceProtection",
                message);
        }

        return new WorkflowActivitiesProblem(
            StatusCodes.Status400BadRequest,
            "DataverseFault",
            message);
    }

    private static bool IsServiceProtection(int errorCode) =>
        errorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;
}
