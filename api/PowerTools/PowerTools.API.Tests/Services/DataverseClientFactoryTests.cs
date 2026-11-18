using System.Net.Sockets;
using PowerTools.API.Services;
using Xunit;

namespace PowerTools.API.Tests.Services;

public sealed class DataverseClientFactoryTests
{
    private const string ServiceUrl = "https://crm.contoso.com/org/XRMServices/2011/Organization.svc";

    [Theory]
    [InlineData("https://crm.contoso.com/org")]
    [InlineData("crm.contoso.com/org")]
    [InlineData(ServiceUrl)]
    public void On_premises_url_is_normalized_to_the_organization_service(string input)
    {
        Assert.Equal(ServiceUrl, DataverseClientFactory.NormalizeOnPremisesServiceUrl(input));
    }

    [Fact]
    public void Http_on_premises_url_is_rejected()
    {
        var error = Assert.ThrowsAny<Exception>(
            () => DataverseClientFactory.NormalizeOnPremisesServiceUrl("http://crm.contoso.com/org"));

        Assert.Contains("HTTP on-premises URLs are not supported.", error.Message);
    }

    [Theory]
    [InlineData("ad", "CONTOSO", "jsmith", @"CONTOSO\jsmith")]
    [InlineData("ifd", "CONTOSO", "jsmith", @"CONTOSO\jsmith")]
    [InlineData("ifd", "CONTOSO", @"FABRIKAM\jsmith", @"FABRIKAM\jsmith")]
    public void On_premises_username_gets_the_domain_unless_it_has_one(
        string authType, string domain, string username, string expected)
    {
        Assert.Equal(expected, DataverseClientFactory.NormalizeOnPremisesUsername(authType, domain, username));
    }
}

public sealed class DataverseErrorFormatterTests
{
    [Fact]
    public void Socket_timeout_is_explained()
    {
        var message = DataverseErrorFormatter.Format(
            new Exception("Failed to connect.", new SocketException((int)SocketError.TimedOut)));

        Assert.Contains("The Dataverse server did not respond on the network.", message);
    }

    [Fact]
    public void Nested_messages_are_kept()
    {
        var message = DataverseErrorFormatter.Format(
            new InvalidOperationException(
                "Failed to connect to Dataverse.",
                new InvalidOperationException("The provided URI scheme 'http' is invalid; expected 'https'.")));

        Assert.Contains("Failed to connect to Dataverse.", message);
        Assert.Contains("The provided URI scheme 'http' is invalid; expected 'https'.", message);
    }
}
