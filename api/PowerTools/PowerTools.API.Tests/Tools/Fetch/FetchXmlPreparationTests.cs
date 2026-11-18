using PowerTools.API.Tools.Fetch;
using PowerTools.API.Tools.Fetch.Dtos;
using Xunit;

namespace PowerTools.API.Tests.Tools.Fetch;

public sealed class FetchXmlPreparationTests
{
    private const string DataverseCookie = "<cookie page=\"1\"><accountid last=\"{ABC}\" first=\"{DEF}\" /></cookie>";
    private const string FetchXml = "<fetch><entity name=\"account\"><attribute name=\"name\" /></entity></fetch>";

    [Fact]
    public void Paging_sets_page_and_count_and_escapes_the_cookie_once()
    {
        var paged = FetchXmlPaging.Apply(FetchXml, page: 2, count: 50, pagingCookie: DataverseCookie);

        Assert.Contains("page=\"2\"", paged);
        Assert.Contains("count=\"50\"", paged);
        Assert.Contains("paging-cookie=\"&lt;cookie page=&quot;1&quot;&gt;", paged);
        Assert.DoesNotContain("&amp;lt;cookie", paged);
        Assert.DoesNotContain("&amp;quot;1&amp;quot;", paged);
    }

    [Fact]
    public void Paging_can_ask_for_the_total_record_count()
    {
        var counted = FetchXmlPaging.Apply(FetchXml, page: 1, count: 50, pagingCookie: null, returnTotalRecordCount: true);

        Assert.Contains("returntotalrecordcount=\"true\"", counted);
    }

    [Fact]
    public void Builder_requests_get_paging_applied()
    {
        var prepared = FetchXmlPreparation.Prepare(
            new ExecuteFetchRequest(FetchXml, Page: 2, PageSize: 50, PagingCookie: DataverseCookie, ReturnTotalRecordCount: true));

        Assert.Null(prepared.Error);
        Assert.Contains("page=\"2\"", prepared.FetchXml);
        Assert.Contains("count=\"50\"", prepared.FetchXml);
        Assert.Contains("returntotalrecordcount=\"true\"", prepared.FetchXml);
        Assert.Equal(FetchValueModes.Builder, prepared.ValueMode);
    }

    [Fact]
    public void Preserved_fetch_xml_is_sent_verbatim_and_value_mode_is_case_insensitive()
    {
        const string verbatim = "<fetch count=\"3\" page=\"9\"><entity name=\"account\"><!-- keep --><attribute name=\"name\" /></entity></fetch>";

        var prepared = FetchXmlPreparation.Prepare(
            new ExecuteFetchRequest(verbatim, Page: 2, PageSize: 50, PagingCookie: DataverseCookie, PreserveFetchXml: true, ValueMode: "RAW"));

        Assert.Null(prepared.Error);
        Assert.Equal(verbatim, prepared.FetchXml);
        Assert.Equal(FetchValueModes.Raw, prepared.ValueMode);
    }

    [Fact]
    public void External_entities_are_rejected()
    {
        const string xxe = "<!DOCTYPE fetch [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><fetch><entity name=\"account\">&xxe;</entity></fetch>";

        var prepared = FetchXmlPreparation.Prepare(new ExecuteFetchRequest(xxe, PreserveFetchXml: true));

        Assert.Contains("Invalid FetchXML", prepared.Error ?? "");
    }

    [Theory]
    [InlineData("<fetch></fetch>", "<fetch> must contain an <entity> element")]
    [InlineData("<account></account>", "Root element must be <fetch>")]
    public void Malformed_fetch_xml_is_rejected(string fetchXml, string expectedError)
    {
        var prepared = FetchXmlPreparation.Prepare(new ExecuteFetchRequest(fetchXml, PreserveFetchXml: true));

        Assert.Equal(expectedError, prepared.Error);
    }

    [Fact]
    public void Unknown_value_mode_is_rejected()
    {
        var prepared = FetchXmlPreparation.Prepare(new ExecuteFetchRequest(FetchXml, PreserveFetchXml: true, ValueMode: "labels"));

        Assert.Equal("valueMode must be builder, formatted, or raw.", prepared.Error);
    }
}
