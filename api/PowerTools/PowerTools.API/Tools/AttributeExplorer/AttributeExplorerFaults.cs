using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.AttributeExplorer;

public sealed record AttributeExplorerProblem(int Status, string Code, string Message);

public sealed record AttributeExplorerResult<T>(T? Value, AttributeExplorerProblem? Problem)
{
    public static AttributeExplorerResult<T> Ok(T value) => new(value, null);

    public static AttributeExplorerResult<T> Fail(AttributeExplorerProblem problem) => new(default, problem);
}

public static class AttributeExplorerFaults
{
    public const string TableNotFoundCode = "table_not_found";
    public const string DataverseErrorCode = "dataverse_error";
    public const string ServiceProtectionCode = "service_protection";

    /// <summary>0x80040217: the requested object does not exist.</summary>
    public const int ObjectDoesNotExist = unchecked((int)0x80040217);
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    public static AttributeExplorerProblem TableNotFound() =>
        new(
            StatusCodes.Status404NotFound,
            TableNotFoundCode,
            "This table no longer exists. Refresh metadata.");

    public static bool IsTableNotFound(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault)
            {
                if (fault.Detail.ErrorCode == ObjectDoesNotExist)
                    return true;
                if (Mentions(fault.Detail.Message) || Mentions(fault.Message))
                    return true;
            }
        }

        return false;

        static bool Mentions(string? text) =>
            text is not null && text.Contains("Could not find", StringComparison.OrdinalIgnoreCase);
    }

    public static AttributeExplorerProblem From(Exception exception)
    {
        var fault = FindFault(exception);
        var message = DataverseErrorFormatter.Format(exception);
        if (fault?.Detail.ErrorDetails is { } details && details.Contains("Retry-After"))
        {
            var retry = details["Retry-After"]?.ToString();
            if (!string.IsNullOrWhiteSpace(retry))
                message = $"{message} Retry after {retry}.";
        }

        if (fault is not null && IsServiceProtection(fault.Detail.ErrorCode))
        {
            return new AttributeExplorerProblem(
                StatusCodes.Status429TooManyRequests,
                ServiceProtectionCode,
                message);
        }

        return new AttributeExplorerProblem(
            StatusCodes.Status400BadRequest,
            DataverseErrorCode,
            message);
    }

    private static FaultException<OrganizationServiceFault>? FindFault(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault)
                return fault;
        }

        return null;
    }

    private static bool IsServiceProtection(int errorCode) =>
        errorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;
}
