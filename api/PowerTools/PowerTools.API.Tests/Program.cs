using System.Net.Sockets;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.ServiceModel.Description;
using System.ServiceModel.Federation;
using System.Text;
using Data8.PowerPlatform.Dataverse.Client;
using Data8.PowerPlatform.Dataverse.Client.Wsdl;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;
using PowerTools.API.Tools.DataMigration;
using PowerTools.API.Tools.Fetch;
using PowerTools.API.Tools.Fetch.Dtos;
using PowerTools.API.Tools.Metadata;

var dataverseCookie = "<cookie page=\"1\"><accountid last=\"{ABC}\" first=\"{DEF}\" /></cookie>";
var fetchXml = "<fetch><entity name=\"account\"><attribute name=\"name\" /></entity></fetch>";

var pagedFetch = FetchXmlPaging.Apply(fetchXml, page: 2, count: 50, pagingCookie: dataverseCookie);

AssertContains("page=\"2\"", pagedFetch);
AssertContains("count=\"50\"", pagedFetch);
AssertContains("paging-cookie=\"&lt;cookie page=&quot;1&quot;&gt;", pagedFetch);
AssertDoesNotContain("&amp;lt;cookie", pagedFetch);
AssertDoesNotContain("&amp;quot;1&amp;quot;", pagedFetch);

var countedFetch = FetchXmlPaging.Apply(fetchXml, page: 1, count: 50, pagingCookie: null, returnTotalRecordCount: true);
AssertContains("returntotalrecordcount=\"true\"", countedFetch);

var builderPrepared = FetchXmlPreparation.Prepare(
    new ExecuteFetchRequest(fetchXml, Page: 2, PageSize: 50, PagingCookie: dataverseCookie, ReturnTotalRecordCount: true));
AssertNull(builderPrepared.Error);
AssertContains("page=\"2\"", builderPrepared.FetchXml);
AssertContains("count=\"50\"", builderPrepared.FetchXml);
AssertContains("returntotalrecordcount=\"true\"", builderPrepared.FetchXml);
AssertEquals(FetchValueModes.Builder, builderPrepared.ValueMode);

var verbatimFetch = "<fetch count=\"3\" page=\"9\"><entity name=\"account\"><!-- keep --><attribute name=\"name\" /></entity></fetch>";
var verbatimPrepared = FetchXmlPreparation.Prepare(
    new ExecuteFetchRequest(verbatimFetch, Page: 2, PageSize: 50, PagingCookie: dataverseCookie, PreserveFetchXml: true, ValueMode: "RAW"));
AssertNull(verbatimPrepared.Error);
AssertEquals(verbatimFetch, verbatimPrepared.FetchXml);
AssertEquals(FetchValueModes.Raw, verbatimPrepared.ValueMode);

var xxeFetch = "<!DOCTYPE fetch [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><fetch><entity name=\"account\">&xxe;</entity></fetch>";
var xxePrepared = FetchXmlPreparation.Prepare(new ExecuteFetchRequest(xxeFetch, PreserveFetchXml: true));
AssertContains("Invalid FetchXML", xxePrepared.Error ?? "");

var missingEntity = FetchXmlPreparation.Prepare(new ExecuteFetchRequest("<fetch></fetch>", PreserveFetchXml: true));
AssertEquals("<fetch> must contain an <entity> element", missingEntity.Error ?? "");

var wrongRoot = FetchXmlPreparation.Prepare(new ExecuteFetchRequest("<account></account>", PreserveFetchXml: true));
AssertEquals("Root element must be <fetch>", wrongRoot.Error ?? "");

var badMode = FetchXmlPreparation.Prepare(
    new ExecuteFetchRequest(fetchXml, PreserveFetchXml: true, ValueMode: "labels"));
AssertEquals("valueMode must be builder, formatted, or raw.", badMode.Error ?? "");

var accountId = Guid.Parse("11111111-1111-1111-1111-111111111111");
var ownerId = Guid.Parse("22222222-2222-2222-2222-222222222222");
var account = new Entity("account", accountId);
account["name"] = "Contoso";
account["statecode"] = new OptionSetValue(0);
account.FormattedValues["statecode"] = "Active";
account["revenue"] = new Money(10.5m);
account.FormattedValues["revenue"] = "$10.50";
account["ownerid"] = new EntityReference("systemuser", ownerId) { Name = "Ada" };
account.FormattedValues["ownerid"] = "Ada Lovelace";
account["new_choices"] = new OptionSetValueCollection { new OptionSetValue(1), new OptionSetValue(4) };
account.FormattedValues["new_choices"] = "One, Four";
account["parent.name"] = new AliasedValue("account", "name", "Parent Co");
account["donotemail"] = false;
account.FormattedValues["donotemail"] = "No";

var rawProjection = FetchResultProjector.Project([account], FetchValueModes.Raw);
AssertSequence(
    rawProjection.Columns,
    "donotemail",
    "name",
    "new_choices",
    "ownerid",
    "parent.name",
    "revenue",
    "statecode");
var rawRecord = rawProjection.Records[0];
AssertFalse(rawRecord.ContainsKey("id"));
AssertEquals("Contoso", (string)rawRecord["name"]!);
AssertEquals(false, (bool)rawRecord["donotemail"]!);
AssertEquals(ownerId.ToString(), (string)rawRecord["ownerid"]!);
AssertEquals("1,4", (string)rawRecord["new_choices"]!);
AssertEquals("Parent Co", (string)rawRecord["parent.name"]!);
AssertEquals(10.5m, (decimal)rawRecord["revenue"]!);
AssertEquals(0, (int)rawRecord["statecode"]!);
AssertEquals("lookup", rawProjection.ColumnTypes["ownerid"]);

var formattedProjection = FetchResultProjector.Project([account], FetchValueModes.Formatted);
var formattedRecord = formattedProjection.Records[0];
AssertFalse(formattedRecord.ContainsKey("id"));
AssertEquals("No", (string)formattedRecord["donotemail"]!);
AssertEquals("Ada Lovelace", (string)formattedRecord["ownerid"]!);
AssertEquals("One, Four", (string)formattedRecord["new_choices"]!);
AssertEquals("$10.50", (string)formattedRecord["revenue"]!);
AssertEquals("Active", (string)formattedRecord["statecode"]!);
AssertEquals("Parent Co", (string)formattedRecord["parent.name"]!);

var builderProjection = FetchResultProjector.Project([account], FetchValueModes.Builder);
var builderRecord = builderProjection.Records[0];
AssertEquals(accountId.ToString(), (string)builderRecord["id"]!);
AssertEquals("Active", (string)builderRecord["statecode"]!);
AssertEquals("No", (string)builderRecord["donotemail"]!);
AssertEquals("22222222-2222-2222-2222-222222222222", ReadAnonymous(builderRecord["ownerid"]!, "id"));
AssertEquals("Ada", ReadAnonymous(builderRecord["ownerid"]!, "name"));
AssertEquals("systemuser", ReadAnonymous(builderRecord["ownerid"]!, "logicalName"));

var emptyProjection = FetchResultProjector.Project(Array.Empty<Entity>(), FetchValueModes.Formatted);
AssertEquals(0, emptyProjection.Records.Count);
AssertEquals(0, emptyProjection.Columns.Count);

var defaultViewColumns = DefaultViewColumns.ParseLayoutXml(
    "<grid><row name=\"account\" id=\"accountid\">" +
    "<cell name=\"name\" width=\"300\" />" +
    "<cell name=\"telephone1\" width=\"100\" />" +
    "</row></grid>");

AssertSetContains("name", defaultViewColumns);
AssertSetContains("telephone1", defaultViewColumns);

var onPremiseServiceUrl = DataverseClientFactory.NormalizeOnPremisesServiceUrl("https://crm.contoso.com/org");
AssertEquals("https://crm.contoso.com/org/XRMServices/2011/Organization.svc", onPremiseServiceUrl);

var onPremiseServiceUrlWithoutScheme = DataverseClientFactory.NormalizeOnPremisesServiceUrl("crm.contoso.com/org");
AssertEquals("https://crm.contoso.com/org/XRMServices/2011/Organization.svc", onPremiseServiceUrlWithoutScheme);

var alreadyServiceUrl = DataverseClientFactory.NormalizeOnPremisesServiceUrl(
    "https://crm.contoso.com/org/XRMServices/2011/Organization.svc");
AssertEquals("https://crm.contoso.com/org/XRMServices/2011/Organization.svc", alreadyServiceUrl);

var adUsername = DataverseClientFactory.NormalizeOnPremisesUsername("ad", "CONTOSO", "jsmith");
AssertEquals(@"CONTOSO\jsmith", adUsername);

var ifdUsername = DataverseClientFactory.NormalizeOnPremisesUsername("ifd", "CONTOSO", "jsmith");
AssertEquals(@"CONTOSO\jsmith", ifdUsername);

var qualifiedIfdUsername = DataverseClientFactory.NormalizeOnPremisesUsername(
    "ifd",
    "CONTOSO",
    @"FABRIKAM\jsmith");
AssertEquals(@"FABRIKAM\jsmith", qualifiedIfdUsername);

AssertThrows(
    "HTTP on-premises URLs are not supported.",
    () => DataverseClientFactory.NormalizeOnPremisesServiceUrl("http://crm.contoso.com/org"));

var resolveOrganizationServiceUrl = typeof(OnPremiseClient).GetMethod(
    "ResolveOrganizationServiceUrl",
    BindingFlags.Static | BindingFlags.NonPublic)
    ?? throw new InvalidOperationException("Unable to find Data8 organization-service URL resolver.");
var canonicalOrganizationServiceUrl = resolveOrganizationServiceUrl.Invoke(
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
AssertEquals(
    "https://gea-v91.linkdev.com/xrmservices/2011/Organization.svc",
    canonicalOrganizationServiceUrl!);

var timeoutMessage = DataverseErrorFormatter.Format(
    new Exception("Failed to connect.", new SocketException((int)SocketError.TimedOut)));
AssertContains("The Dataverse server did not respond on the network.", timeoutMessage);

var nestedConnectionMessage = DataverseErrorFormatter.Format(
    new InvalidOperationException(
        "Failed to connect to Dataverse.",
        new InvalidOperationException("The provided URI scheme 'http' is invalid; expected 'https'.")));
AssertContains("Failed to connect to Dataverse.", nestedConnectionMessage);
AssertContains("The provided URI scheme 'http' is invalid; expected 'https'.", nestedConnectionMessage);

var normalizedFullFetchFilter = DataMigrationFetchXml.NormalizeFilterFragment(
    """
    <fetch>
      <entity name="account">
        <attribute name="accountid" />
        <attribute name="name" />
        <filter type="and">
          <condition attribute="name" operator="like" value="%Tesdt%" />
        </filter>
      </entity>
    </fetch>
    """,
    "account");
AssertEquals(
    "<filter type=\"and\"><condition attribute=\"name\" operator=\"like\" value=\"%Tesdt%\" /></filter>",
    normalizedFullFetchFilter!);

await AssertFederatedMetadataPrefersHttpsMixedEndpoint();

static async Task AssertFederatedMetadataPrefersHttpsMixedEndpoint()
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

    var listener = new TcpListener(System.Net.IPAddress.Loopback, 0);
    listener.Start();
    var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
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
        BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("Unable to find Data8 ConnectFederated.");

    try
    {
        var service = connectFederated.Invoke(
            client,
            ["https://crm.contoso.test/XRMServices/2011/Organization.svc", credentials, policies]);
        if (service is null)
        {
            throw new InvalidOperationException("Expected Data8 to create the federated service using HTTPS metadata.");
        }

        var endpoint = service.GetType().GetProperty("Endpoint")?.GetValue(service) as ServiceEndpoint
            ?? throw new InvalidOperationException("Unable to inspect the Data8 service endpoint.");
        var binding = endpoint.Binding as WSFederationHttpBinding
            ?? throw new InvalidOperationException("Expected Data8 to use WSFederationHttpBinding.");
        AssertEquals(
            "https://sts.contoso.test/adfs/services/trust/13/usernamemixed",
            binding.WSTrustTokenParameters.IssuerAddress.Uri.AbsoluteUri.TrimEnd('/'));
    }
    finally
    {
        await serverTask;
    }
}

static async Task ServeSingleHttpResponse(TcpListener listener, string content)
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
            {
                break;
            }

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

static void AssertContains(string expected, string actual)
{
    if (!actual.Contains(expected, StringComparison.Ordinal))
        throw new InvalidOperationException($"Expected to find '{expected}' in '{actual}'.");
}

static void AssertDoesNotContain(string unexpected, string actual)
{
    if (actual.Contains(unexpected, StringComparison.Ordinal))
        throw new InvalidOperationException($"Did not expect to find '{unexpected}' in '{actual}'.");
}

static void AssertSetContains(string expected, IReadOnlySet<string> actual)
{
    if (!actual.Contains(expected))
        throw new InvalidOperationException($"Expected to find '{expected}' in '{string.Join(", ", actual)}'.");
}

static void AssertEquals(string expected, string actual)
{
    if (!string.Equals(expected, actual, StringComparison.Ordinal))
        throw new InvalidOperationException($"Expected '{expected}', got '{actual}'.");
}

static void AssertEquals(int expected, int actual)
{
    if (expected != actual)
        throw new InvalidOperationException($"Expected {expected}, got {actual}.");
}

static void AssertEquals(bool expected, bool actual)
{
    if (expected != actual)
        throw new InvalidOperationException($"Expected {expected}, got {actual}.");
}

static void AssertEquals(decimal expected, decimal actual)
{
    if (expected != actual)
        throw new InvalidOperationException($"Expected {expected}, got {actual}.");
}

static void AssertNull(string? actual)
{
    if (actual is not null)
        throw new InvalidOperationException($"Expected null, got '{actual}'.");
}

static void AssertFalse(bool actual)
{
    if (actual)
        throw new InvalidOperationException("Expected false.");
}

static void AssertSequence(IReadOnlyList<string> actual, params string[] expected)
{
    if (!actual.SequenceEqual(expected))
        throw new InvalidOperationException(
            $"Expected [{string.Join(", ", expected)}], got [{string.Join(", ", actual)}].");
}

static string ReadAnonymous(object value, string propertyName)
{
    var property = value.GetType().GetProperty(propertyName)
        ?? throw new InvalidOperationException($"Missing property '{propertyName}'.");
    return property.GetValue(value)?.ToString()
        ?? throw new InvalidOperationException($"Property '{propertyName}' was null.");
}

static void AssertThrows(string expectedMessagePart, Action action)
{
    try
    {
        action();
    }
    catch (Exception ex) when (ex.Message.Contains(expectedMessagePart, StringComparison.Ordinal))
    {
        return;
    }

    throw new InvalidOperationException($"Expected exception containing '{expectedMessagePart}'.");
}
