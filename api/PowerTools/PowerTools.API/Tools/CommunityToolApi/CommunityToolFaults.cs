using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;
using PowerTools.API.Tools.AttributeExplorer;

namespace PowerTools.API.Tools.CommunityToolApi;

public sealed record CommunityToolProblem(int Status, string Code, string Message, int? DataverseCode = null)
{
    public CommunityToolErrorDto ToError() => new(Code, Message, DataverseCode);
}

public sealed record CommunityToolResult<T>(T? Value, CommunityToolProblem? Problem)
{
    public static CommunityToolResult<T> Ok(T value) => new(value, null);

    public static CommunityToolResult<T> Fail(CommunityToolProblem problem) => new(default, problem);
}

/// <summary>Bad input found while reading a request; becomes a 400.</summary>
public sealed class CommunityToolValueException(string message) : Exception(message);

public static class CommunityToolFaults
{
    public const string InvalidRequestCode = "InvalidRequest";
    public const string DataverseFaultCode = "DataverseFault";
    public const string ThrottledCode = "Throttled";
    public const string CancelledCode = "Cancelled";

    /// <summary>0x80040217: the requested object does not exist.</summary>
    public const int ObjectDoesNotExist = AttributeExplorerFaults.ObjectDoesNotExist;

    /// <summary>0x80041102: the table name is not in the metadata cache, which is how an unknown table fails on a data call.</summary>
    public const int EntityNotInMetadataCache = -2147217150;

    /// <summary>Service protection: number of requests, execution time, concurrent requests.</summary>
    public const int NumberOfRequestsLimitExceeded = -2147015902;
    public const int TimeLimitExceeded = -2147015903;
    public const int ConcurrencyLimitExceeded = -2147015898;

    public static CommunityToolProblem InvalidRequest(string message) =>
        new(StatusCodes.Status400BadRequest, InvalidRequestCode, message);

    /// <summary>
    /// Maps a Dataverse exception. A missing object is 404; with <paramref name="metadata"/>
    /// the "Could not find" wording of metadata faults also counts as missing.
    /// </summary>
    public static CommunityToolProblem From(Exception exception, bool metadata = false)
    {
        var fault = FindFault(exception);
        var message = DataverseErrorFormatter.Format(exception);
        if (fault is null)
            return new CommunityToolProblem(StatusCodes.Status502BadGateway, DataverseFaultCode, message);

        var code = fault.Detail.ErrorCode;
        if (IsServiceProtection(code))
        {
            if (fault.Detail.ErrorDetails is { } details
                && details.TryGetValue("Retry-After", out var retry)
                && !string.IsNullOrWhiteSpace(retry?.ToString()))
            {
                message = $"{message} Retry after {retry}.";
            }

            return new CommunityToolProblem(StatusCodes.Status429TooManyRequests, ThrottledCode, message, code);
        }

        var missing = code is ObjectDoesNotExist or EntityNotInMetadataCache || (metadata && AttributeExplorerFaults.IsTableNotFound(exception));
        return new CommunityToolProblem(
            missing ? StatusCodes.Status404NotFound : StatusCodes.Status502BadGateway,
            DataverseFaultCode,
            message,
            code);
    }

    /// <summary>The error for one failed operation inside an ExecuteMultiple response.</summary>
    public static CommunityToolErrorDto FromItemFault(OrganizationServiceFault fault)
    {
        var message = string.IsNullOrWhiteSpace(fault.Message) ? "Dataverse error" : fault.Message;
        if (fault.ErrorCode != 0)
            message = $"{message} (0x{fault.ErrorCode:X8})";
        return new CommunityToolErrorDto(
            IsServiceProtection(fault.ErrorCode) ? ThrottledCode : DataverseFaultCode,
            message,
            fault.ErrorCode == 0 ? null : fault.ErrorCode);
    }

    public static CommunityToolErrorDto NotRun() =>
        new(CancelledCode, "Not run because an earlier operation failed.");

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
