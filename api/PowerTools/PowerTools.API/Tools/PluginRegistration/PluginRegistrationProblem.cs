using System.Net;
using System.Security;
using System.Security.Authentication;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Services;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationProblem
{
    private const string SafeEnvironmentFallback = "Dataverse environment";

    private static readonly HashSet<string> AllowedComponents = new(
        ["assembly", "plugin", "workflowActivity", "step", "image"],
        StringComparer.OrdinalIgnoreCase);

    public static PluginRegistrationProblemResult FromException(
        Exception exception,
        string environment,
        string? component = null)
    {
        ArgumentNullException.ThrowIfNull(exception);
        ArgumentException.ThrowIfNullOrWhiteSpace(environment);
        var safeEnvironment = SanitizeEnvironment(environment);
        var safeComponent = SanitizeComponent(component);

        return exception switch
        {
            ArgumentException => Create(
                StatusCodes.Status400BadRequest,
                "validation",
                "invalid-request",
                "The requested registration change is not valid.",
                safeEnvironment,
                safeComponent,
                null,
                "Correct the highlighted values and create a new preview."),
            PluginRegistrationPreflightException => Create(
                StatusCodes.Status409Conflict,
                "concurrency",
                "stale-plan",
                "The registration changed after the preview was created.",
                safeEnvironment,
                safeComponent,
                null,
                "Refresh the registration and create a new preview."),
            UnauthorizedAccessException => Create(
                StatusCodes.Status403Forbidden,
                "permission",
                "access-denied",
                "The connected user does not have permission for this registration operation.",
                safeEnvironment,
                safeComponent,
                null,
                "Use a connection with the required Dataverse privileges."),
            HttpRequestException { StatusCode: HttpStatusCode.Unauthorized } => Create(
                StatusCodes.Status401Unauthorized,
                "authentication",
                "authentication-failed",
                "The Dataverse connection could not be authenticated.",
                safeEnvironment,
                safeComponent,
                null,
                "Reconnect and try the preview again."),
            AuthenticationException => Create(
                StatusCodes.Status401Unauthorized,
                "authentication",
                "authentication-failed",
                "The Dataverse connection could not be authenticated.",
                safeEnvironment,
                safeComponent,
                null,
                "Reconnect and try the preview again."),
            SecurityException => Create(
                StatusCodes.Status403Forbidden,
                "permission",
                "access-denied",
                "The connected user does not have permission for this registration operation.",
                safeEnvironment,
                safeComponent,
                null,
                "Use a connection with the required Dataverse privileges."),
            HttpRequestException { StatusCode: HttpStatusCode.Forbidden } => Create(
                StatusCodes.Status403Forbidden,
                "permission",
                "access-denied",
                "The connected user does not have permission for this registration operation.",
                safeEnvironment,
                safeComponent,
                null,
                "Use a connection with the required Dataverse privileges."),
            HttpRequestException => Create(
                StatusCodes.Status503ServiceUnavailable,
                "communication",
                "dataverse-unreachable",
                "Dataverse could not be reached for this registration operation.",
                safeEnvironment,
                safeComponent,
                null,
                "Check the connection and refresh before trying again."),
            FaultException<OrganizationServiceFault> fault => Create(
                StatusCodes.Status502BadGateway,
                "dataverse",
                "dataverse-fault",
                "Dataverse rejected the registration operation.",
                safeEnvironment,
                safeComponent,
                GetCorrelationId(fault.Detail),
                "Refresh the registration and review the current state."),
            _ => Create(
                StatusCodes.Status502BadGateway,
                "dataverse",
                "registration-failed",
                "The registration operation could not be completed safely.",
                safeEnvironment,
                safeComponent,
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

    private static string SanitizeEnvironment(string environment)
    {
        if (!Uri.TryCreate(environment, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            || string.IsNullOrWhiteSpace(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo))
            return SafeEnvironmentFallback;

        var origin = new UriBuilder(uri.Scheme, uri.Host)
        {
            Port = uri.IsDefaultPort ? -1 : uri.Port
        }.Uri.GetLeftPart(UriPartial.Authority);
        return origin.Length <= 255 ? origin : SafeEnvironmentFallback;
    }

    private static string? SanitizeComponent(string? component) =>
        component is not null && AllowedComponents.Contains(component)
            ? AllowedComponents.Single(allowed => string.Equals(
                allowed,
                component,
                StringComparison.OrdinalIgnoreCase))
            : null;

    private static string? GetCorrelationId(OrganizationServiceFault fault)
    {
        var activity = fault.GetType().GetProperty("ActivityId")?.GetValue(fault);
        return activity switch
        {
            Guid { } id when id != Guid.Empty => id.ToString("D"),
            string id when Guid.TryParse(id, out var parsed) => parsed.ToString("D"),
            _ => null
        };
    }
}

public sealed record PluginRegistrationProblemResult(
    int StatusCode,
    PluginRegistrationProblemDto Problem);
