using System.Xml.Linq;
using PowerTools.API.Tools.DataMigration;
using Xunit;

namespace PowerTools.API.Tests.Tools.DataMigration;

public sealed class DataMigrationFetchXmlTests
{
    // A filter on a related table arrives as a link-entity, alone or inside full FetchXML.
    private const string LinkFilter =
        "<link-entity name=\"contact\" from=\"contactid\" to=\"primarycontactid\" link-type=\"inner\" alias=\"ab\">" +
        "<filter type=\"and\"><condition attribute=\"lastname\" operator=\"eq\" value=\"Smith\" /></filter></link-entity>";

    [Fact]
    public void Full_fetch_xml_filter_is_reduced_to_its_filter()
    {
        var filter = DataMigrationFetchXml.ParseFilter(
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

        Assert.Equal(
            "<filter type=\"and\"><condition attribute=\"name\" operator=\"like\" value=\"%Tesdt%\" /></filter>",
            filter!.CombinedFilter()!.ToString(SaveOptions.DisableFormatting));
    }

    [Fact]
    public void Link_entity_filter_is_kept_alone()
    {
        Assert.Equal(
            "<fetch><entity name=\"account\"><attribute name=\"name\" />" + LinkFilter + "</entity></fetch>",
            DataMigrationFetchXml.Build("account", ["name"], LinkFilter));
    }

    [Fact]
    public void Link_entity_filter_is_kept_from_full_fetch_xml_without_its_attributes_or_order()
    {
        Assert.Equal(
            "<fetch><entity name=\"account\"><attribute name=\"name\" />" + LinkFilter + "</entity></fetch>",
            DataMigrationFetchXml.Build(
                "account",
                ["name"],
                """
                <fetch version="1.0" mapping="logical" distinct="false">
                  <entity name="account">
                    <attribute name="accountid" />
                    <order attribute="name" descending="false" />
                    <link-entity name="contact" from="contactid" to="primarycontactid" link-type="inner" alias="ab">
                      <attribute name="fullname" />
                      <filter type="and">
                        <condition attribute="lastname" operator="eq" value="Smith" />
                      </filter>
                    </link-entity>
                  </entity>
                </fetch>
                """));
    }

    [Fact]
    public void Count_with_link_entity_counts_distinct_ids()
    {
        Assert.Equal(
            "<fetch aggregate=\"true\"><entity name=\"account\"><attribute name=\"accountid\" alias=\"recordcount\" aggregate=\"countcolumn\" distinct=\"true\" />" + LinkFilter + "</entity></fetch>",
            DataMigrationFetchXml.BuildCount("account", "accountid", LinkFilter));
    }

    [Fact]
    public void Count_with_plain_filter_uses_count()
    {
        Assert.Equal(
            "<fetch aggregate=\"true\"><entity name=\"account\"><attribute name=\"accountid\" alias=\"recordcount\" aggregate=\"count\" /><filter><condition attribute=\"statecode\" operator=\"eq\" value=\"0\" /></filter></entity></fetch>",
            DataMigrationFetchXml.BuildCount(
                "account",
                "accountid",
                "<filter><condition attribute=\"statecode\" operator=\"eq\" value=\"0\" /></filter>"));
    }

    [Fact]
    public void Id_lookup_lists_every_id()
    {
        Assert.Equal(
            "<fetch><entity name=\"account\"><attribute name=\"accountid\" /><filter><condition attribute=\"accountid\" operator=\"in\"><value>83b129f1-7790-4ca5-a0db-bf02fd67c127</value><value>0f8fad5b-d9cb-469f-a165-70867728950e</value></condition></filter></entity></fetch>",
            DataMigrationFetchXml.BuildIdLookup(
                "account",
                "accountid",
                [Guid.Parse("83b129f1-7790-4ca5-a0db-bf02fd67c127"), Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e")]));
    }

    [Fact]
    public void Id_lookup_keeps_a_link_entity_filter()
    {
        Assert.Equal(
            "<fetch><entity name=\"account\"><attribute name=\"accountid\" /><filter><condition attribute=\"accountid\" operator=\"in\"><value>83b129f1-7790-4ca5-a0db-bf02fd67c127</value></condition></filter>" + LinkFilter + "</entity></fetch>",
            DataMigrationFetchXml.BuildIdLookup("account", "accountid", [Guid.Parse("83b129f1-7790-4ca5-a0db-bf02fd67c127")], LinkFilter));
    }

    // Delete compares target records with the filtered source, so the source lookup carries the filter.
    [Fact]
    public void Id_lookup_combines_the_source_filter()
    {
        Assert.Equal(
            "<fetch><entity name=\"account\"><attribute name=\"accountid\" /><filter type=\"and\"><condition attribute=\"accountid\" operator=\"in\"><value>83b129f1-7790-4ca5-a0db-bf02fd67c127</value></condition><filter><condition attribute=\"address1_city\" operator=\"eq\" value=\"Cairo\" /></filter></filter></entity></fetch>",
            DataMigrationFetchXml.BuildIdLookup(
                "account",
                "accountid",
                [Guid.Parse("83b129f1-7790-4ca5-a0db-bf02fd67c127")],
                "<filter><condition attribute=\"address1_city\" operator=\"eq\" value=\"Cairo\" /></filter>"));
    }
}
