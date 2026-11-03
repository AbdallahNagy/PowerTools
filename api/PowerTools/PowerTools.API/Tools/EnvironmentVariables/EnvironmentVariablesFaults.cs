using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.EnvironmentVariables;

public sealed record EnvironmentVariablesProblem(
    int Status,
    string Code,
    string Message,
    IReadOnlyList<DependencyDto>? Dependencies = null);

public sealed record EnvironmentVariablesResult<T>(T? Value, EnvironmentVariablesProblem? Problem)
{
    public static EnvironmentVariablesResult<T> Ok(T value) => new(value, null);

    public static EnvironmentVariablesResult<T> Fail(EnvironmentVariablesProblem problem) => new(default, problem);
}

public static class EnvironmentVariablesFaults
{
    public const int PrivilegeDenied = unchecked((int)0x80040220);
    public const int AccessDenied = unchecked((int)0x80048306);
    public const int QueryBuilderNoEntity = unchecked((int)0x80041102);
    public const int EntityNotFound = unchecked((int)0x80094005);
    public const int ObjectDoesNotExist = unchecked((int)0x80040217);
    public const int DuplicateRecord = unchecked((int)0x80040237);
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    public const string NotAvailableCode = "NotAvailable";

    public static EnvironmentVariablesProblem BadRequest(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    public static EnvironmentVariablesProblem Invalid(string message) =>
        new(StatusCodes.Status422UnprocessableEntity, "InvalidValue", message);

    public static EnvironmentVariablesProblem NotFound(string message) =>
        new(StatusCodes.Status404NotFound, "NotFound", message);

    public static EnvironmentVariablesProblem Conflict(string code, string message) =>
        new(StatusCodes.Status409Conflict, code, message);

    public static EnvironmentVariablesProblem HasDependencies(string what, IReadOnlyList<DependencyDto> dependencies) =>
        new(
            StatusCodes.Status409Conflict,
            "HasDependencies",
            $"{dependencies.Count} component(s) depend on this {what}, such as flows or apps. Remove them first.",
            dependencies);

    public static EnvironmentVariablesProblem From(Exception exception)
    {
        var fault = exception as FaultException<OrganizationServiceFault>
            ?? exception.InnerException as FaultException<OrganizationServiceFault>;
        var message = DataverseErrorFormatter.Format(exception);
        if (fault is null)
            return new(StatusCodes.Status422UnprocessableEntity, "DataverseFault", message);

        var code = fault.Detail.ErrorCode;
        if (code is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded)
        {
            var retry = fault.Detail.ErrorDetails is { } details && details.Contains("Retry-After")
                ? details["Retry-After"]?.ToString()
                : null;
            if (!string.IsNullOrWhiteSpace(retry))
                message = $"{message} Retry after {retry}.";
            return new(StatusCodes.Status429TooManyRequests, "ServiceProtection", message);
        }

        return code switch
        {
            PrivilegeDenied or AccessDenied => new(StatusCodes.Status403Forbidden, "PrivilegeDenied", message),
            QueryBuilderNoEntity or EntityNotFound => new(
                StatusCodes.Status501NotImplemented,
                NotAvailableCode,
                $"Environment variables are not available on this server. {message}"),
            ObjectDoesNotExist => new(StatusCodes.Status404NotFound, "NotFound", message),
            DuplicateRecord => new(StatusCodes.Status409Conflict, "Duplicate", message),
            _ => new(StatusCodes.Status422UnprocessableEntity, "DataverseFault", message),
        };
    }
}
