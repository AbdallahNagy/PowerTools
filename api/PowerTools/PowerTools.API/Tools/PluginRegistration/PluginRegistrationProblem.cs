using System.Net;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationProblem
{
    public static PluginRegistrationProblemResult FromException(
        Exception exception,
        string environment,
        string? component = null)
    {
        ArgumentNullException.ThrowIfNull(exception);
        ArgumentException.ThrowIfNullOrWhiteSpace(environment);

        return exception switch
        {
            ArgumentException => Create(
                StatusCodes.Status400BadRequest,
                "validation",
                "invalid-request",
                "The requested registration change is not valid.",
                environment,
                component,
                null,
                "Correct the highlighted values and create a new preview."),
            PluginRegistrationPreflightException => Create(
                StatusCodes.Status409Conflict,
                "concurrency",
                "stale-plan",
                "The registration changed after the preview was created.",
                environment,
                component,
                null,
                "Refresh the registration and create a new preview."),
            UnauthorizedAccessException => Create(
                StatusCodes.Status403Forbidden,
                "permission",
                "access-denied",
                "The connected user does not have permission for this registration operation.",
                environment,
                component,
                null,
                "Use a connection with the required Dataverse privileges."),
            HttpRequestException { StatusCode: HttpStatusCode.Unauthorized } => Create(
                StatusCodes.Status401Unauthorized,
                "authentication",
                "authentication-failed",
                "The Dataverse connection could not be authenticated.",
                environment,
                component,
                null,
                "Reconnect and try the preview again."),
            HttpRequestException { StatusCode: HttpStatusCode.Forbidden } => Create(
                StatusCodes.Status403Forbidden,
                "permission",
                "access-denied",
                "The connected user does not have permission for this registration operation.",
                environment,
                component,
                null,
                "Use a connection with the required Dataverse privileges."),
            HttpRequestException => Create(
                StatusCodes.Status503ServiceUnavailable,
                "communication",
                "dataverse-unreachable",
                "Dataverse could not be reached for this registration operation.",
                environment,
                component,
                null,
                "Check the connection and refresh before trying again."),
            FaultException<OrganizationServiceFault> fault => Create(
                StatusCodes.Status502BadGateway,
                "dataverse",
                "dataverse-fault",
                "Dataverse rejected the registration operation.",
                environment,
                component,
                GetCorrelationId(fault.Detail),
                "Refresh the registration and review the current state."),
            _ => Create(
                StatusCodes.Status502BadGateway,
                "dataverse",
                "registration-failed",
                "The registration operation could not be completed safely.",
                environment,
                component,
                null,
                "Refresh the registration and inspect the current state before trying again.")
        };
    }

    private static PluginRegistrationProblemResult Create(
        int statusCode,
        string category,
        string code,
        string message,
        string environment,
        string? component,
        string? correlationId,
        string suggestedAction) =>
        new(statusCode, new PluginRegistrationProblemDto(
            category,
            code,
            message,
            environment,
            component,
            correlationId,
            suggestedAction));

    private static string? GetCorrelationId(OrganizationServiceFault fault)
    {
        var activity = fault.GetType().GetProperty("ActivityId")?.GetValue(fault);
        return activity switch
        {
            Guid { } id when id != Guid.Empty => id.ToString("D"),
            string { Length: > 0 } id => id,
            _ => null
        };
    }
}

public sealed record PluginRegistrationProblemResult(
    int StatusCode,
    PluginRegistrationProblemDto Problem);
