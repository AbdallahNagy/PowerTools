using System.Globalization;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.RibbonWorkbench;

public sealed record RibbonProblem(int Status, string Code, string Message);

public sealed record RibbonResult<T>(T? Value, RibbonProblem? Problem)
{
    public static RibbonResult<T> Ok(T value) => new(value, null);

    public static RibbonResult<T> Fail(RibbonProblem problem) => new(default, problem);
}

public static class RibbonWorkbenchFaults
{
    public const string InvalidRequestCode = "invalid_request";
    public const string NotFoundCode = "not_found";
    public const string DataverseErrorCode = "dataverse_error";
    public const string ServiceProtectionCode = "service_protection";
    public const string PrivilegeCode = "privilege_denied";
    public const string BusyCode = "org_busy";
    public const string PackageCode = "package_error";
    public const string ValidationCode = "validation_failed";

    public const int PrivilegeDenied = unchecked((int)0x80040220);
    public const int ObjectDoesNotExist = unchecked((int)0x80040217);
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    public const string PrivilegeMessage =
        "You do not have permission for this. Editing command bars needs Export Customizations, Import Customizations, " +
        "and Publish Customizations, which System Customizer and System Administrator have.";

    public const string BusyMessage =
        "Dataverse is running another import, export, or publish in this environment. Try again in a few minutes.";

    public static RibbonProblem Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, InvalidRequestCode, message);

    public static RibbonProblem NotFound(string message) =>
        new(StatusCodes.Status404NotFound, NotFoundCode, message);

    public static RibbonProblem From(Exception exception)
    {
        if (exception is RibbonPackageException package)
            return new RibbonProblem(StatusCodes.Status422UnprocessableEntity, PackageCode, package.Message);

        var message = DataverseErrorFormatter.Format(exception);
        if (IsPrivilegeDenied(exception))
            return new RibbonProblem(StatusCodes.Status403Forbidden, PrivilegeCode, $"{PrivilegeMessage} {message}");

        if (IsCustomizationLock(exception))
            return new RibbonProblem(StatusCodes.Status409Conflict, BusyCode, $"{BusyMessage} {message}");

        if (Unwrap(exception) is { } fault && IsServiceProtectionCode(fault.Detail.ErrorCode))
        {
            if (ReadRetryAfter(exception) is { } retry)
                message = $"{message} Retry after {retry.TotalSeconds.ToString("0", CultureInfo.InvariantCulture)} seconds.";
            return new RibbonProblem(StatusCodes.Status429TooManyRequests, ServiceProtectionCode, message);
        }

        return new RibbonProblem(StatusCodes.Status400BadRequest, DataverseErrorCode, message);
    }

    /// <summary>The text shown in a publish job for a failure.</summary>
    public static string Describe(Exception exception) => From(exception).Message;

    public static FaultException<OrganizationServiceFault>? Unwrap(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault) return fault;
        }

        return null;
    }

    public static bool IsPrivilegeDenied(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault is null) return false;
        if (fault.Detail.ErrorCode == PrivilegeDenied) return true;
        var text = fault.Detail.Message ?? fault.Message;
        return text.Contains("missing prv", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsDoesNotExist(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault is null) return false;
        if (fault.Detail.ErrorCode == ObjectDoesNotExist) return true;
        var text = fault.Detail.Message ?? fault.Message;
        return text.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Dataverse runs one import, export, or publish at a time per organization. The error code is not documented,
    /// so the fault is recognized by its wording.
    /// </summary>
    public static bool IsCustomizationLock(Exception exception)
    {
        var text = Unwrap(exception)?.Detail.Message ?? exception.Message;
        return text.Contains("because there is another", StringComparison.OrdinalIgnoreCase)
            || text.Contains("because there is a previous", StringComparison.OrdinalIgnoreCase)
            || text.Contains("running at this moment", StringComparison.OrdinalIgnoreCase)
            || text.Contains("customization lock", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>The message is not available on this server, such as ExportSolutionAsync on premises.</summary>
    public static bool IsUnsupportedRequest(Exception exception)
    {
        var text = Unwrap(exception)?.Detail.Message ?? exception.Message;
        return text.Contains("Unrecognized request", StringComparison.OrdinalIgnoreCase)
            || text.Contains("is not supported", StringComparison.OrdinalIgnoreCase)
            || text.Contains("Request not supported", StringComparison.OrdinalIgnoreCase)
            || text.Contains("not a valid message", StringComparison.OrdinalIgnoreCase);
    }

    public static TimeSpan? ReadRetryAfter(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault?.Detail.ErrorDetails is not { } details || !details.Contains("Retry-After")) return null;
        return details["Retry-After"] switch
        {
            TimeSpan span => span,
            int seconds => TimeSpan.FromSeconds(seconds),
            long seconds => TimeSpan.FromSeconds(seconds),
            double seconds => TimeSpan.FromSeconds(seconds),
            string text when double.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) =>
                TimeSpan.FromSeconds(number),
            _ => null,
        };
    }

    public static bool IsServiceProtection(Exception exception) =>
        Unwrap(exception) is { } fault && IsServiceProtectionCode(fault.Detail.ErrorCode);

    private static bool IsServiceProtectionCode(int errorCode) =>
        errorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;
}
