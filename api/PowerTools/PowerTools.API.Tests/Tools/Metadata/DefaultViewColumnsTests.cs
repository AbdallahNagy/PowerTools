using PowerTools.API.Tools.Metadata;
using Xunit;

namespace PowerTools.API.Tests.Tools.Metadata;

public sealed class DefaultViewColumnsTests
{
    [Fact]
    public void Layout_xml_cells_become_column_names()
    {
        var columns = DefaultViewColumns.ParseLayoutXml(
            "<grid><row name=\"account\" id=\"accountid\">" +
            "<cell name=\"name\" width=\"300\" />" +
            "<cell name=\"telephone1\" width=\"100\" />" +
            "</row></grid>");

        Assert.Contains("name", columns);
        Assert.Contains("telephone1", columns);
    }

    [Fact]
    public void Root_columns_keep_order_and_skip_linked_and_duplicate_cells()
    {
        var columns = DefaultViewColumns.ParseRootColumns(
            "<grid><row name=\"result\" id=\"accountid\">" +
            "<cell name=\"telephone1\" width=\"100\" />" +
            "<cell name=\"name\" width=\"300\" />" +
            "<cell name=\"a_contact.fullname\" width=\"150\" />" +
            "<cell name=\"Name\" width=\"300\" />" +
            "</row></grid>");

        Assert.Equal(["telephone1", "name"], columns);
    }

    [Fact]
    public void Malformed_layout_xml_has_no_root_columns()
    {
        Assert.Empty(DefaultViewColumns.ParseRootColumns("<grid><row>"));
    }
}
