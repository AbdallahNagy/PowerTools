using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.ServiceModel.Description;
using System.ServiceModel.Federation;
using System.Text;
using Data8.PowerPlatform.Dataverse.Client;
using Data8.PowerPlatform.Dataverse.Client.Wsdl;
using Xunit;

namespace Dyno.Api.Tests.ThirdParty;

// Covers changes made to the vendored Data8 client under ThirdParty/. The members are private,
// so they are reached by reflection.
public sealed class Data8OnPremiseClientTests
{
    [Fact]
    public void Organization_service_url_uses_the_casing_from_the_wsdl()
    {
        var resolve = typeof(OnPremiseClient).GetMethod(
            "ResolveOrganizationServiceUrl",
            BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(resolve);

        var url = resolve.Invoke(
            null,
            [
                "https://gea-v91.linkdev.com/XRMServices/2011/Organization.svc",
                new List<Definitions>
                {
                    new()
                    {
                        Services =
                        [
                            new Service
                            {
                                Ports =
                                [
                                    new Port
                                    {
                                        Address = new SoapAddress
                                        {
                                            Location = "https://gea-v91.linkdev.com/xrmservices/2011/Organization.svc"
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]) as string;

        Assert.Equal("https://gea-v91.linkdev.com/xrmservices/2011/Organization.svc", url);
    }

    [Fact]
    public async Task Federated_metadata_prefers_the_https_mixed_endpoint()
    {
        const string issuerWsdl = """
            <wsdl:definitions
                xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy"
                xmlns:sp="http://docs.oasis-open.org/ws-sx/ws-securitypolicy/200702"
                xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
                xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
                xmlns:tns="urn:test">
              <wsp:Policy wsu:Id="HttpUsernamePolicy">
                <sp:SignedEncryptedSupportingTokens>
                  <wsp:Policy><sp:UsernameToken /></wsp:Policy>
                </sp:SignedEncryptedSupportingTokens>
                <sp:Trust13 />
              </wsp:Policy>
              <wsp:Policy wsu:Id="HttpsUsernamePolicy">
                <sp:SignedEncryptedSupportingTokens>
                  <wsp:Policy><sp:UsernameToken /></wsp:Policy>
                </sp:SignedEncryptedSupportingTokens>
                <sp:Trust13 />
              </wsp:Policy>
              <wsdl:binding name="HttpUsernameBinding">
                <wsp:PolicyReference URI="#HttpUsernamePolicy" />
              </wsdl:binding>
              <wsdl:binding name="HttpsUsernameBinding">
                <wsp:PolicyReference URI="#HttpsUsernamePolicy" />
              </wsdl:binding>
              <wsdl:service name="SecurityTokenService">
                <wsdl:port name="HttpUsernamePort" binding="tns:HttpUsernameBinding">
                  <soap12:address location="http://sts.contoso.test/adfs/services/trust/13/username" />
                </wsdl:port>
                <wsdl:port name="HttpsUsernamePort" binding="tns:HttpsUsernameBinding">
                  <soap12:address location="https://sts.contoso.test/adfs/services/trust/13/usernamemixed" />
                </wsdl:port>
              </wsdl:service>
            </wsdl:definitions>
            """;

        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var metadataUrl = $"http://127.0.0.1:{port}/mex";
        var serverTask = ServeSingleHttpResponse(listener, issuerWsdl);

        var policies = new List<Policy>
        {
            new()
            {
                PolicyItems =
                [
                    new EndorsingSupportingTokens
                    {
                        Policy = new Policy
                        {
                            PolicyItems =
                            [
                                new IssuedToken
                                {
                                    Issuer = new Issuer
                                    {
                                        Metadata = new AddressMetadata
                                        {
                                            Metadata = new SoapMetadata
                                            {
                                                MetadataSection = new MetadataSection
                                                {
                                                    MetadataReference = new MetadataReference { Address = metadataUrl }
                                                }
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };

        var credentials = new ClientCredentials();
        credentials.UserName.UserName = @"CONTOSO\jsmith";
        credentials.UserName.Password = "password";

        var client = RuntimeHelpers.GetUninitializedObject(typeof(OnPremiseClient));
        var connectFederated = typeof(OnPremiseClient).GetMethod(
            "ConnectFederated",
            BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(connectFederated);

        try
        {
            var service = connectFederated.Invoke(
                client,
                ["https://crm.contoso.test/XRMServices/2011/Organization.svc", credentials, policies]);
            Assert.NotNull(service);

            var endpoint = service.GetType().GetProperty("Endpoint")?.GetValue(service) as ServiceEndpoint;
            Assert.NotNull(endpoint);
            var binding = Assert.IsType<WSFederationHttpBinding>(endpoint.Binding);
            Assert.Equal(
                "https://sts.contoso.test/adfs/services/trust/13/usernamemixed",
                binding.WSTrustTokenParameters.IssuerAddress.Uri.AbsoluteUri.TrimEnd('/'));
        }
        finally
        {
            await serverTask;
        }
    }

    private static async Task ServeSingleHttpResponse(TcpListener listener, string content)
    {
        try
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var stream = client.GetStream();
            var requestBuffer = new byte[4096];
            var request = "";
            while (!request.Contains("\r\n\r\n", StringComparison.Ordinal))
            {
                var read = await stream.ReadAsync(requestBuffer);
                if (read == 0)
                    break;

                request += Encoding.ASCII.GetString(requestBuffer, 0, read);
            }

            var body = Encoding.UTF8.GetBytes(content);
            var headers = Encoding.ASCII.GetBytes(
                $"HTTP/1.1 200 OK\r\nContent-Type: text/xml; charset=utf-8\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(headers);
            await stream.WriteAsync(body);
        }
        finally
        {
            listener.Stop();
        }
    }
}
