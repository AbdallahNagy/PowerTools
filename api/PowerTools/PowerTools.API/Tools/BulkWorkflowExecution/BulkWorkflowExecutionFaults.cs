using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public sealed record BulkWorkflowProblem(int Status, string Code, string Message);

public sealed record BulkWorkflowResult<T>(T? Value, BulkWorkflowProblem? Problem)
{
    public static BulkWorkflowResult<T> Ok(T value) => new(value, null);

    public static BulkWorkflowResult<T> Fail(BulkWorkflowProblem problem) => new(default, problem);
}

public static class BulkWorkflowFaults
{
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);
    public const int ExecuteNotOnDemandWorkflow = unchecked((int)0x80045046);
    public const int WorkflowIsNotOnDemand = unchecked((int)0x80045059);

    public static BulkWorkflowProblem Local(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    public static BulkWorkflowProblem InvalidFetchXml(string message) => Local("InvalidFetchXml", message);

    public static BulkWorkflowProblem WorkflowNotAvailable() =>
        Local("WorkflowNotAvailable", "This workflow is not an activated on-demand workflow.");

    public static BulkWorkflowProblem PagingCookieMissing() =>
        Local(
            "PagingCookieMissing",
            "Dataverse did not return a paging cookie for this query, so not every record can be read. Simplify the query, for example remove link-entities, and try again.");

    public static BulkWorkflowProblem From(Exception exception)
    {
        var fault = Unwrap(exception);
        var message = DataverseErrorFormatter.Format(exception);
        if (fault is not null && IsServiceProtection(fault.Detail.ErrorCode))
        {
            return new BulkWorkflowProblem(StatusCodes.Status429TooManyRequests, "ServiceProtection", message);
        }

        return new BulkWorkflowProblem(StatusCodes.Status400BadRequest, "DataverseFault", message);
    }

    public static FaultException<OrganizationServiceFault>? Unwrap(Exception exception) =>
        exception as FaultException<OrganizationServiceFault>
        ?? exception.InnerException as FaultException<OrganizationServiceFault>;

    public static bool IsServiceProtection(int errorCode) =>
        errorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;

    public static bool IsNotOnDemand(int errorCode) =>
        errorCode is ExecuteNotOnDemandWorkflow or WorkflowIsNotOnDemand;

    /// <summary>The batch-size limit carried by an ExecuteMultiple fault, when that is why it failed.</summary>
    public static int? MaxBatchSize(OrganizationServiceFault? fault)
    {
        if (fault?.ErrorDetails is not { } details || !details.Contains("MaxBatchSize")) return null;
        return details["MaxBatchSize"] switch
        {
            int value => value,
            long value => (int)value,
            string text when int.TryParse(text, out var parsed) => parsed,
            _ => null,
        };
    }

    /// <summary>Readable text for a per-record fault.</summary>
    public static string ItemMessage(OrganizationServiceFault fault)
    {
        var code = fault.ErrorCode != 0 ? $" (0x{fault.ErrorCode:X8})" : "";
        if (IsNotOnDemand(fault.ErrorCode))
            return $"The workflow is no longer activated or on-demand.{code}";
        var text = string.IsNullOrWhiteSpace(fault.Message) ? "Dataverse error" : fault.Message.Trim();
        return $"{text}{code}";
    }
}
