using PowerTools.API.Tools.Fetch;

var dataverseCookie = "<cookie page=\"1\"><accountid last=\"{ABC}\" first=\"{DEF}\" /></cookie>";
var fetchXml = "<fetch><entity name=\"account\"><attribute name=\"name\" /></entity></fetch>";

var pagedFetch = FetchXmlPaging.Apply(fetchXml, page: 2, count: 50, pagingCookie: dataverseCookie);

AssertContains("page=\"2\"", pagedFetch);
AssertContains("count=\"50\"", pagedFetch);
AssertContains("paging-cookie=\"&lt;cookie page=&quot;1&quot;&gt;", pagedFetch);
AssertDoesNotContain("&amp;lt;cookie", pagedFetch);
AssertDoesNotContain("&amp;quot;1&amp;quot;", pagedFetch);

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
