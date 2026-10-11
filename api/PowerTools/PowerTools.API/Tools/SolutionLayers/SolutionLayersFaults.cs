using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.SolutionLayers;

public sealed record SolutionLayersProblem(int Status, string Code, string Message);

public static class SolutionLayersFaults
{
    public const int PrivilegeDenied = unchecked((int)0x80040220);
    public const int QueryBuilderNoEntity = unchecked((int)0x80041102);
    public const int EntityNotFound = unchecked((int)0x80094005);
    public const int NumberOfRequestsLimitExceeded = unchecked((int)0x80072322);
    public const int TimeLimitExceeded = unchecked((int)0x80072321);
    public const int ConcurrencyLimitExceeded = unchecked((int)0x80072326);
    public const int RemoveNotSupported = unchecked((int)0x8004F059);
    public const int RemoveNotSupportedOnAttributeType = unchecked((int)0x8004F053);
    public const int RemoveFailedForEntity = unchecked((int)0x8004F075);
    public const int NotActiveLayer = unchecked((int)0x8004F076);
    public const int CustomizationLocked = unchecked((int)0x8004F077);

    public const string NoActiveLayerCode = "NoActiveLayer";
    public const string OnlyActiveLayerCode = "OnlyActiveLayer";
    public const string LayersNotSupportedCode = "layers_not_supported";

    public static SolutionLayersProblem BadRequest(string code, string message) =>
        new(StatusCodes.Status400BadRequest, code, message);

    public static SolutionLayersProblem UnknownComponentType(int componentType) =>
        new(
            StatusCodes.Status422UnprocessableEntity,
            "UnknownComponentType",
            $"Component type {componentType} has no solution layer name on this environment.");

    public static SolutionLayersProblem NoActiveLayer() =>
        new(StatusCodes.Status409Conflict, NoActiveLayerCode, "This component has no Active layer.");

    public static SolutionLayersProblem OnlyActiveLayer() =>
        new(
            StatusCodes.Status409Conflict,
            OnlyActiveLayerCode,
            "This component exists only in the Active layer, so there is nothing to fall back to.");

    public static SolutionLayersProblem TimedOut() =>
        new(
            StatusCodes.Status504GatewayTimeout,
            "Timeout",
            "The request timed out and the Active layer is still present. Reload the layers before trying again.");

    public static SolutionLayersProblem From(Exception exception)
    {
        var fault = exception as FaultException<OrganizationServiceFault>
            ?? exception.InnerException as FaultException<OrganizationServiceFault>;
        var message = DataverseErrorFormatter.Format(exception);
        if (fault is null)
            return new SolutionLayersProblem(StatusCodes.Status422UnprocessableEntity, "DataverseFault", message);

        var code = fault.Detail.ErrorCode;
        if (code is NumberOfRequestsLimitExceeded or TimeLimitExceeded or ConcurrencyLimitExceeded)
        {
            var retry = fault.Detail.ErrorDetails is { } details && details.Contains("Retry-After")
                ? details["Retry-After"]?.ToString()
                : null;
            if (!string.IsNullOrWhiteSpace(retry))
                message = $"{message} Retry after {retry}.";
            return new SolutionLayersProblem(StatusCodes.Status429TooManyRequests, "ServiceProtection", message);
        }

        return code switch
        {
            PrivilegeDenied => new(StatusCodes.Status403Forbidden, "PrivilegeDenied", message),
            QueryBuilderNoEntity or EntityNotFound => new(
                StatusCodes.Status501NotImplemented,
                LayersNotSupportedCode,
                $"Solution layers are not available on this environment. {message}"),
            RemoveNotSupported => new(StatusCodes.Status422UnprocessableEntity, "RemoveNotSupported", message),
            RemoveNotSupportedOnAttributeType => new(
                StatusCodes.Status422UnprocessableEntity,
                "RemoveNotSupportedOnAttributeType",
                message),
            RemoveFailedForEntity => new(StatusCodes.Status422UnprocessableEntity, "RemoveFailedForEntity", message),
            NotActiveLayer => new(StatusCodes.Status409Conflict, "NotActiveLayer", message),
            CustomizationLocked => new(StatusCodes.Status409Conflict, "CustomizationLocked", message),
            _ => new(StatusCodes.Status422UnprocessableEntity, "DataverseFault", message),
        };
    }

    public static bool IsTimeout(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is TimeoutException)
                return true;
        }

        return false;
    }
}
