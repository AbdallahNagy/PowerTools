using Microsoft.PowerPlatform.Dataverse.Client;

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
        return new ServiceClient(
            instanceUrl: new Uri(environmentUrl),
            tokenProviderFunction: _ => Task.FromResult(accessToken),
            useUniqueInstance: true
        );
    }
}


