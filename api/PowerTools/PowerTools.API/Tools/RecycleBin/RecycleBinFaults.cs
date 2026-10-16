using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.RecycleBin;

public sealed record RecycleBinProblem(int Status, string Code, string Message);

/// <summary>A per-record restore failure: a stable code for the client and the server message.</summary>
public sealed record RestoreFault(string Code, string Message);

/// <summary>
/// Dataverse fault numbers the Recycle Bin tool recognizes. Faults are matched on
/// <see cref="OrganizationServiceFault.ErrorCode"/> first; the recycle-bin fault names are a fallback.
/// </summary>
public static class RecycleBinFaults
{
    public const int PrivilegeDenied = unchecked((int)0x80040220);
    public const int ObjectDoesNotExist = unchecked((int)0x80040217);
    public const int DuplicateRecord = unchecked((int)0x80040237);
    public const int DuplicateRecordEntityKey = unchecked((int)0x80060892);
    public const int InvalidPluginExecution = unchecked((int)0x80040265);
    public const int QueryBuilderNoEntity = unchecked((int)0x80041102);
    public const int EntityNotFound = unchecked((int)0x80094005);

    // Native recycle bin (Restore message). The developer doc lists DuplicateExceptionRestoreRecycleBin
    // as 0x80044a02 but with the number of 0x80049939; both are accepted.
    public const int RefCannotBeRestoredRecycleBinNotFound = unchecked((int)0x80049959);
    public const int DuplicateExceptionRestoreRecycleBin = unchecked((int)0x80049939);
    public const int DuplicateExceptionRestoreRecycleBinAlt = unchecked((int)0x80044a02);
    public const int DuplicateExceptionEntityKeyRestoreRecycleBin = unchecked((int)0x80049929);
    public const int PicklistValueOutOfRangeRecycleBin = unchecked((int)0x80049949);

    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);

    // Codes returned to the client (desktop maps them to plain messages).
    public const string RefMissingCode = "RelatedRecordMissing";
    public const string DuplicateCode = "DuplicateRecord";
    public const string DuplicateKeyCode = "DuplicateKey";
    public const string ChoiceRemovedCode = "ChoiceValueRemoved";
    public const string NotInBinCode = "NotInRecycleBin";
    public const string PrivilegeCode = "PrivilegeDenied";
    public const string PluginCode = "PluginError";
    public const string ServiceProtectionCode = "ServiceProtection";
    public const string DataverseCode = "DataverseFault";
    public const string InRecycleBinCode = "InRecycleBin";
    public const string NoValuesCode = "NoAuditedValues";
    public const string NotRestorableTableCode = "TableNotRestorable";

    public static OrganizationServiceFault? Fault(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is FaultException<OrganizationServiceFault> fault)
                return fault.Detail;
        }

        return null;
    }

    public static bool IsServiceProtection(Exception exception) =>
        Fault(exception)?.ErrorCode is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded;

    /// <summary>The Retry-After a service protection fault carries, if any.</summary>
    public static TimeSpan? RetryAfter(Exception exception)
    {
        var details = Fault(exception)?.ErrorDetails;
        if (details is null || !details.Contains("Retry-After"))
            return null;
        return details["Retry-After"] switch
        {
            TimeSpan span => span,
            string text when TimeSpan.TryParse(text, out var parsed) => parsed,
            string text when double.TryParse(text, out var seconds) => TimeSpan.FromSeconds(seconds),
            _ => null,
        };
    }

    public static bool IsPrivilegeDenied(Exception exception) => Fault(exception)?.ErrorCode == PrivilegeDenied;

    public static bool IsMissingTable(Exception exception) =>
        Fault(exception)?.ErrorCode is QueryBuilderNoEntity or EntityNotFound;

    /// <summary>Maps a failed Restore (bin) or Create (audit) of one record.</summary>
    public static RestoreFault ForRestore(Exception exception, string source)
    {
        var message = DataverseErrorFormatter.Format(exception);
        var fault = Fault(exception);
        if (fault is null)
            return new RestoreFault(DataverseCode, message);

        var name = FaultName(fault);
        var code = fault.ErrorCode;
        if (code == RefCannotBeRestoredRecycleBinNotFound || name == "RefCannotBeRestoredRecycleBinNotFound")
            return new RestoreFault(RefMissingCode, message);
        if (code is DuplicateExceptionRestoreRecycleBin or DuplicateExceptionRestoreRecycleBinAlt or DuplicateRecord
            || name == "DuplicateExceptionRestoreRecycleBin")
            return new RestoreFault(DuplicateCode, message);
        if (code is DuplicateExceptionEntityKeyRestoreRecycleBin or DuplicateRecordEntityKey
            || name == "DuplicateExceptionEntityKeyRestoreRecycleBin")
            return new RestoreFault(DuplicateKeyCode, message);
        if (code == PicklistValueOutOfRangeRecycleBin || name == "PicklistValueOutOfRangeRecycleBin")
            return new RestoreFault(ChoiceRemovedCode, message);
        if (code == ObjectDoesNotExist)
            return new RestoreFault(source == RecycleBinSources.Bin ? NotInBinCode : RefMissingCode, message);
        if (code == PrivilegeDenied)
            return new RestoreFault(PrivilegeCode, message);
        if (code == InvalidPluginExecution)
            return new RestoreFault(PluginCode, string.IsNullOrWhiteSpace(fault.Message) ? message : fault.Message);
        if (code is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded)
            return new RestoreFault(ServiceProtectionCode, message);
        return new RestoreFault(DataverseCode, message);
    }

    /// <summary>Maps a failed read (status, tables, list, details) to an HTTP problem.</summary>
    public static RecycleBinProblem From(Exception exception)
    {
        var message = DataverseErrorFormatter.Format(exception);
        var fault = Fault(exception);
        if (fault is null)
            return new RecycleBinProblem(StatusCodes.Status422UnprocessableEntity, DataverseCode, message);

        return fault.ErrorCode switch
        {
            PrivilegeDenied => new(StatusCodes.Status403Forbidden, PrivilegeCode, message),
            NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded =>
                new(StatusCodes.Status429TooManyRequests, ServiceProtectionCode, message),
            _ => new(StatusCodes.Status422UnprocessableEntity, DataverseCode, message),
        };
    }

    public static RecycleBinProblem BadRequest(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    private static string? FaultName(OrganizationServiceFault fault) =>
        fault.ErrorDetails is { } details && details.Contains("ErrorName")
            ? details["ErrorName"]?.ToString()
            : null;
}
