using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.PowerPlatform.Dataverse.Client.Model;
using System.Data.Common;

namespace PowerTools.API.Services;

/// <summary>
/// Creates a per-request Dataverse ServiceClient using the user's OAuth access token
/// (acquired by the Electron frontend via MSAL). No client secret is stored on the server.
/// </summary>
public class DataverseClientFactory
{
    public ServiceClient Create(DataverseConnectionContext context) =>
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
    public ServiceClient Create(string accessToken, string environmentUrl) =>
        CreateOnline(accessToken, environmentUrl);

    public ServiceClient CreateOnline(string accessToken, string environmentUrl)
    {
        var serviceUri = NormalizeServiceUri(environmentUrl);

        return new ServiceClient(new ConnectionOptions
        {
            AuthenticationType = AuthenticationType.ExternalTokenManagement,
            AccessTokenProviderFunctionAsync = _ => Task.FromResult(accessToken),
            ServiceUri = serviceUri,
            RequireNewInstance = true,
            SkipDiscovery = true,
        });
    }

    public ServiceClient CreateOnPremises(OnPremisesConnectionContext connection)
    {
        var authType = connection.AuthMode.Equals("ifd", StringComparison.OrdinalIgnoreCase)
            ? "IFD"
            : "AD";

        var builder = new DbConnectionStringBuilder
        {
            ["AuthType"] = authType,
            ["Url"] = NormalizeServiceUri(connection.EnvironmentUrl).ToString(),
            ["Username"] = connection.Username,
            ["Password"] = connection.Password,
            ["RequireNewInstance"] = true,
        };

        if (!string.IsNullOrWhiteSpace(connection.Domain))
        {
            builder["Domain"] = connection.Domain;
        }

        return new ServiceClient(builder.ConnectionString);
    }

    private static Uri NormalizeServiceUri(string environmentUrl) =>
        new(environmentUrl.EndsWith('/') ? environmentUrl : $"{environmentUrl}/");
}


