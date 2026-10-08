using System.Globalization;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.Translator;

public sealed record TranslatorProblem(int Status, string Code, string Message);

public sealed record TranslatorResult<T>(T? Value, TranslatorProblem? Problem)
{
    public static TranslatorResult<T> Ok(T value) => new(value, null);

    public static TranslatorResult<T> Fail(TranslatorProblem problem) => new(default, problem);
}

public static class TranslatorFaults
{
    public const string InvalidRequestCode = "invalid_request";
    public const string DataverseErrorCode = "dataverse_error";
    public const string ServiceProtectionCode = "service_protection";
    public const string PrivilegeCode = "privilege_denied";

    /// <summary>0x80040217: the requested object does not exist.</summary>
    public const int ObjectDoesNotExist = unchecked((int)0x80040217);
    /// <summary>0x80040220: the caller is missing a privilege.</summary>
    public const int PrivilegeDenied = unchecked((int)0x80040220);
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    public const string PrivilegeMessage =
        "You do not have permission to change this label. Changing labels needs Write on the component's metadata " +
        "and Publish Customizations, which System Customizer and System Administrator have.";

    public static TranslatorProblem Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, InvalidRequestCode, message);

    public static TranslatorProblem From(Exception exception)
    {
        var fault = Unwrap(exception);
        var message = DataverseErrorFormatter.Format(exception);

        if (IsPrivilegeDenied(exception))
        {
            return new TranslatorProblem(
                StatusCodes.Status403Forbidden,
                PrivilegeCode,
                $"{PrivilegeMessage} {message}");
        }

        if (ReadRetryAfter(exception) is { } retry)
            message = $"{message} Retry after {retry.TotalSeconds.ToString("0", CultureInfo.InvariantCulture)} seconds.";

        if (fault is not null && IsServiceProtectionCode(fault.Detail.ErrorCode))
        {
            return new TranslatorProblem(
                StatusCodes.Status429TooManyRequests,
                ServiceProtectionCode,
                message);
        }

        return new TranslatorProblem(StatusCodes.Status400BadRequest, DataverseErrorCode, message);
    }

    /// <summary>The message shown for one failed label write.</summary>
    public static string RowMessage(Exception exception) =>
        IsPrivilegeDenied(exception)
            ? $"{PrivilegeMessage} {DataverseErrorFormatter.Format(exception)}"
            : DataverseErrorFormatter.Format(exception);

    public static FaultException<OrganizationServiceFault>? Unwrap(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault)
                return fault;
        }

        return null;
    }

    public static bool IsDoesNotExist(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault is null) return false;
        if (fault.Detail.ErrorCode == ObjectDoesNotExist) return true;
        var text = fault.Detail.Message ?? fault.Message;
        return text.Contains("Could not find", StringComparison.OrdinalIgnoreCase)
            || text.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsPrivilegeDenied(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault is null) return false;
        if (fault.Detail.ErrorCode == PrivilegeDenied) return true;
        var text = fault.Detail.Message ?? fault.Message;
        return text.Contains("missing prv", StringComparison.OrdinalIgnoreCase)
            || text.Contains("privilege", StringComparison.OrdinalIgnoreCase)
               && text.Contains("prv", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Dataverse runs one customization operation at a time per organization. The exact error code
    /// is not documented, so the fault is recognized by its wording.
    /// </summary>
    public static bool IsCustomizationLock(Exception exception)
    {
        var fault = Unwrap(exception);
        var text = fault?.Detail.Message ?? exception.Message;
        return text.Contains("because there is another", StringComparison.OrdinalIgnoreCase)
            || text.Contains("because there is a previous", StringComparison.OrdinalIgnoreCase)
            || text.Contains("running at this moment", StringComparison.OrdinalIgnoreCase)
            || text.Contains("customization lock", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsTimeout(Exception exception, CancellationToken cancellationToken)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is TimeoutException) return true;
            if (current is TaskCanceledException && !cancellationToken.IsCancellationRequested) return true;
            if (current is FaultException<OrganizationServiceFault>) continue;
            if (current.Message.Contains("timed out", StringComparison.OrdinalIgnoreCase)) return true;
        }

        return false;
    }

    public static bool IsServiceProtection(Exception exception) =>
        Unwrap(exception) is { } fault && IsServiceProtectionCode(fault.Detail.ErrorCode);

    public static TimeSpan? ReadRetryAfter(Exception exception)
    {
        var fault = Unwrap(exception);
        if (fault?.Detail.ErrorDetails is not { } details || !details.Contains("Retry-After"))
            return null;
        return details["Retry-After"] switch
        {
            TimeSpan span => span,
            int seconds => TimeSpan.FromSeconds(seconds),
            long seconds => TimeSpan.FromSeconds(seconds),
            double seconds => TimeSpan.FromSeconds(seconds),
            string text when double.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) =>
                TimeSpan.FromSeconds(number),
            string text when TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var span) => span,
            _ => null,
        };
    }

    public static FaultException<OrganizationServiceFault> ToException(OrganizationServiceFault fault) =>
        new(fault, new FaultReason(fault.Message ?? "Dataverse request failed."));

    private static bool IsServiceProtectionCode(int errorCode) =>
        errorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;
}
