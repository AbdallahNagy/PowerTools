using Data8.PowerPlatform.Dataverse.Client;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.PowerPlatform.Dataverse.Client.Model;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Services;

/// <summary>
/// Creates per-request Dataverse clients. Online connections use the user's OAuth
/// token from Electron; on-premises connections use the SOAP organization service.
/// </summary>
public class DataverseClientFactory
{
    public IOrganizationServiceAsync2 Create(DataverseConnectionContext context) =>
        context switch
        {
            OnlineConnectionContext online => CreateOnline(online.AccessToken, online.EnvironmentUrl),
            OnPremisesConnectionContext onPremises => CreateOnPremises(onPremises),
            _ => throw new InvalidOperationException("Unsupported Dataverse connection context.")
        };

    /// <summary>
    /// Creates a ServiceClient authenticated with the user's delegated token.
    /// </summary>
    /// <param name="accessToken">Bearer token acquired by MSAL in Electron for the D365 environment.</param>
    /// <param name="environmentUrl">The Dynamics 365 environment URL, e.g. https://yourorg.crm.dynamics.com</param>
    public IOrganizationServiceAsync2 Create(string accessToken, string environmentUrl) =>
        CreateOnline(accessToken, environmentUrl);

    public ServiceClient CreateOnline(string accessToken, string environmentUrl)
    {
        var serviceUri = NormalizeServiceUri(environmentUrl);

        return new ServiceClient(new ConnectionOptions
        {
            AuthenticationType = Microsoft.PowerPlatform.Dataverse.Client.AuthenticationType.ExternalTokenManagement,
            AccessTokenProviderFunctionAsync = _ => Task.FromResult(accessToken),
            ServiceUri = serviceUri,
            RequireNewInstance = true,
            SkipDiscovery = true,
        });
    }

    public IOrganizationServiceAsync2 CreateOnPremises(OnPremisesConnectionContext connection)
    {
        var serviceUrl = NormalizeOnPremisesServiceUrl(connection.EnvironmentUrl);
        var username = NormalizeOnPremisesUsername(
            connection.AuthMode,
            connection.Domain,
            connection.Username);
        return new OnPremiseClient(serviceUrl, username, connection.Password);
    }

    private static Uri NormalizeServiceUri(string environmentUrl) =>
        new(environmentUrl.EndsWith('/') ? environmentUrl : $"{environmentUrl}/");

    public static string NormalizeOnPremisesServiceUrl(string environmentUrl)
    {
        var trimmed = environmentUrl.Trim().TrimEnd('/');
        if (!trimmed.Contains("://", StringComparison.Ordinal))
        {
            trimmed = $"https://{trimmed}";
        }

        var serviceSuffix = "/XRMServices/2011/Organization.svc";
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException("On-premises connections require a valid server or organization URL.");
        }

        if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "HTTP on-premises URLs are not supported. Enter the server or organization URL without a scheme, or use an HTTPS URL.");
        }

        if (trimmed.EndsWith(serviceSuffix, StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        return $"{trimmed}{serviceSuffix}";
    }

    public static string NormalizeOnPremisesUsername(string _, string domain, string username)
    {
        var trimmedUsername = username.Trim();
        if (string.IsNullOrWhiteSpace(domain)
            || trimmedUsername.Contains('\\', StringComparison.Ordinal)
            || trimmedUsername.Contains('@', StringComparison.Ordinal))
        {
            return trimmedUsername;
        }

        return $@"{domain.Trim()}\{trimmedUsername}";
    }
}
