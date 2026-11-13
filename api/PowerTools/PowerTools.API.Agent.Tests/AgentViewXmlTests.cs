using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentViewXmlTests
{
    internal const string Layout =
        "<grid name=\"resultset\" jump=\"name\" select=\"1\" icon=\"1\" preview=\"1\">\n" +
        "  <row name=\"result\" id=\"accountid\">\n" +
        "    <cell name=\"name\" width=\"300\" />\n" +
        "    <cell name='telephone1' width=\"100\"/>\n" +
        "  </row>\n" +
        "</grid>";

    internal const string Fetch =
        "<fetch version=\"1.0\" mapping=\"logical\">\n" +
        "  <entity name=\"account\">\n" +
        "    <attribute name=\"name\" />\n" +
        "    <attribute name=\"telephone1\"/>\n" +
        "    <order attribute=\"name\" descending=\"false\" />\n" +
        "    <filter type=\"and\"><condition attribute=\"statecode\" operator=\"eq\" value=\"0\" /></filter>\n" +
        "  </entity>\n" +
        "</fetch>";

    [Fact]
    public void Adding_a_column_appends_a_cell_to_the_first_row_and_an_attribute_to_the_entity()
    {
        var result = AgentViewXml.AddColumn(Layout, Fetch, "new_rating", 150);

        Assert.Null(result.Problem);
        var (layout, fetch) = result.Value;
        var cell = "<cell name=\"new_rating\" width=\"150\"/>";
        var attribute = "<attribute name=\"new_rating\"/>";
        Assert.Equal(Layout, layout.Replace(cell, ""));
        Assert.Equal(Fetch, fetch.Replace(attribute, ""));
        Assert.True(layout.IndexOf(cell, StringComparison.Ordinal) > layout.IndexOf("telephone1", StringComparison.Ordinal));
        Assert.True(layout.IndexOf(cell, StringComparison.Ordinal) < layout.IndexOf("</row>", StringComparison.Ordinal));
        // The attribute goes after the last existing attribute, before order and filter.
        Assert.True(fetch.IndexOf(attribute, StringComparison.Ordinal) > fetch.IndexOf("telephone1", StringComparison.Ordinal));
        Assert.True(fetch.IndexOf(attribute, StringComparison.Ordinal) < fetch.IndexOf("<order", StringComparison.Ordinal));
    }

    [Fact]
    public void The_width_is_used()
    {
        var (layout, _) = AgentViewXml.AddColumn(Layout, Fetch, "new_rating", 220).Value;
        Assert.Contains("<cell name=\"new_rating\" width=\"220\"/>", layout);
    }

    [Fact]
    public void A_column_already_in_the_layout_is_an_invalid_request()
    {
        var result = AgentViewXml.AddColumn(Layout, Fetch, "TELEPHONE1", 150);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("already in this view", result.Problem.Message);
    }

    [Fact]
    public void An_attribute_the_query_already_fetches_is_not_added_twice()
    {
        var fetch = Fetch.Replace("<order", "<attribute name=\"new_rating\" />\n    <order");

        var (layout, newFetch) = AgentViewXml.AddColumn(Layout, fetch, "new_rating", 150).Value;

        Assert.Equal(fetch, newFetch);
        Assert.Contains("new_rating", layout);
    }

    [Fact]
    public void A_query_with_no_attributes_gets_the_attribute_right_after_the_entity_tag()
    {
        var fetch = "<fetch><entity name=\"account\"><order attribute=\"name\" /></entity></fetch>";

        var (_, newFetch) = AgentViewXml.AddColumn(Layout, fetch, "new_rating", 150).Value;

        Assert.Equal("<fetch><entity name=\"account\"><attribute name=\"new_rating\"/><order attribute=\"name\" /></entity></fetch>", newFetch);
    }

    [Fact]
    public void An_empty_row_and_an_empty_entity_are_expanded()
    {
        var layout = "<grid><row name=\"result\" id=\"accountid\" /></grid>";
        var fetch = "<fetch><entity name=\"account\" /></fetch>";

        var (newLayout, newFetch) = AgentViewXml.AddColumn(layout, fetch, "new_rating", 150).Value;

        Assert.Equal("<grid><row name=\"result\" id=\"accountid\"><cell name=\"new_rating\" width=\"150\"/></row></grid>", newLayout);
        Assert.Equal("<fetch><entity name=\"account\"><attribute name=\"new_rating\"/></entity></fetch>", newFetch);
    }

    [Fact]
    public void A_layout_without_a_row_is_an_invalid_request()
    {
        var result = AgentViewXml.AddColumn("<grid/>", Fetch, "new_rating", 150);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    // ── Removing ──────────────────────────────────────────────────────────────

    [Fact]
    public void Removing_a_column_takes_its_cell_and_attribute_with_their_lines_and_nothing_else()
    {
        var result = AgentViewXml.RemoveColumn(Layout, Fetch, "TELEPHONE1");

        Assert.Null(result.Problem);
        Assert.Equal(Layout.Replace("\n    <cell name='telephone1' width=\"100\"/>", ""), result.Value!.LayoutXml);
        Assert.Equal(Fetch.Replace("\n    <attribute name=\"telephone1\"/>", ""), result.Value.FetchXml);
        Assert.True(result.Value.RemovedFromQuery);
    }

    [Fact]
    public void Removing_an_added_column_gives_back_the_original_view()
    {
        var (layout, fetch) = AgentViewXml.AddColumn(Layout, Fetch, "new_rating", 150).Value;

        var removed = AgentViewXml.RemoveColumn(layout, fetch, "new_rating").Value!;

        Assert.Equal(Layout, removed.LayoutXml);
        Assert.Equal(Fetch, removed.FetchXml);
    }

    [Fact]
    public void The_jump_column_leaves_the_grid_but_stays_in_the_query()
    {
        var removed = AgentViewXml.RemoveColumn(Layout, Fetch, "name").Value!;

        Assert.DoesNotContain("<cell name=\"name\"", removed.LayoutXml);
        Assert.Equal(Fetch, removed.FetchXml);
        Assert.False(removed.RemovedFromQuery);
    }

    [Fact]
    public void The_primary_id_column_stays_in_the_query()
    {
        var layout = Layout.Replace("<cell name=\"name\" width=\"300\" />", "<cell name=\"accountid\" width=\"100\" /><cell name=\"name\" width=\"300\" />");
        var fetch = Fetch.Replace("<attribute name=\"name\" />", "<attribute name=\"accountid\" /><attribute name=\"name\" />");

        var removed = AgentViewXml.RemoveColumn(layout, fetch, "accountid").Value!;

        Assert.Equal(Layout, removed.LayoutXml);
        Assert.Equal(fetch, removed.FetchXml);
    }

    [Fact]
    public void A_column_only_in_the_grid_leaves_the_query_as_it_was()
    {
        var fetch = Fetch.Replace("\n    <attribute name=\"telephone1\"/>", "");

        var removed = AgentViewXml.RemoveColumn(Layout, fetch, "telephone1").Value!;

        Assert.Equal(fetch, removed.FetchXml);
        Assert.False(removed.RemovedFromQuery);
    }

    [Fact]
    public void A_column_not_in_the_view_is_an_invalid_request()
    {
        var result = AgentViewXml.RemoveColumn(Layout, Fetch, "new_missing");

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("not in this view", result.Problem.Message);
    }

    [Fact]
    public void The_last_column_of_a_view_is_not_removed()
    {
        var layout = "<grid jump=\"name\"><row name=\"result\" id=\"accountid\"><cell name=\"telephone1\" width=\"100\"/></row></grid>";

        var result = AgentViewXml.RemoveColumn(layout, Fetch, "telephone1");

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("only column", result.Problem.Message);
    }
}
