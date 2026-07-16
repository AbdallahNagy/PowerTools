using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.PowerPlatform.Dataverse.Client.Model;

namespace PowerTools.API.Services;

/// <summary>
/// Creates a per-request Dataverse ServiceClient using the user's OAuth access token
/// (acquired by the Electron frontend via MSAL). No client secret is stored on the server.
/// </summary>
public class DataverseClientFactory
{
    /// <summary>
    /// Creates a ServiceClient authenticated with the user's delegated token.
    /// </summary>
    /// <param name="accessToken">Bearer token acquired by MSAL in Electron for the D365 environment.</param>
    /// <param name="environmentUrl">The Dynamics 365 environment URL, e.g. https://yourorg.crm.dynamics.com</param>
    public ServiceClient Create(string accessToken, string environmentUrl)
    {
        var serviceUri = new Uri(environmentUrl.EndsWith('/')
            ? environmentUrl
            : $"{environmentUrl}/");

        return new ServiceClient(new ConnectionOptions
        {
            AuthenticationType = AuthenticationType.ExternalTokenManagement,
            AccessTokenProviderFunctionAsync = _ => Task.FromResult(accessToken),
            ServiceUri = serviceUri,
            RequireNewInstance = true,
            SkipDiscovery = true,
        });
    }
}


