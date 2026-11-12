using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentFormXmlTests
{
    /// <summary>
    /// A form shaped like a real main form: two tabs, three sections, existing rows, a header, an empty rows element,
    /// single-quoted attributes, odd whitespace, comments and self-closing tags written both ways.
    /// </summary>
    internal const string Form = """
        <form shownavigationbar="true" showImage="false">
          <tabs>
            <tab verticallayout="true" id="{11111111-1111-1111-1111-111111111111}" IsUserDefined="0" name='general' expanded="true">
              <labels>
                <label description="General" languagecode="1033" />
              </labels>
              <columns>
                <column width="100%">
                  <sections>
                    <section showlabel="false" showbar="false" IsUserDefined="0" id="{22222222-2222-2222-2222-222222222222}" name="summary" columns="11">
                      <labels><label description="Summary" languagecode="1033"/></labels>
                      <rows>
                        <row>
                          <cell id="{33333333-3333-3333-3333-333333333333}" showlabel="true">
                            <labels><label description="Account Name" languagecode="1033"/></labels>
                            <control id="name" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="name" disabled="false"/>
                          </cell>
                        </row>
                      </rows>
                    </section>
                    <section name="address" id="{44444444-4444-4444-4444-444444444444}" columns="11">
                      <labels><label description="Address" languagecode="1033"/></labels>
                      <rows />
                    </section>
                  </sections>
                </column>
              </columns>
            </tab>
            <!-- the second tab -->
            <tab name="details_tab" id="{55555555-5555-5555-5555-555555555555}">
              <labels><label description="Details" languagecode="1033"/></labels>
              <columns>
                <column width="100%">
                  <sections>
                    <section name="notes" id="{66666666-6666-6666-6666-666666666666}">
                      <labels><label description="Notes" languagecode="1033"/></labels>
                      <rows>
                        <row>
                          <cell id="{77777777-7777-7777-7777-777777777777}">
                            <labels><label description="Phone" languagecode="1033"/></labels>
                            <control id="telephone1" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="telephone1"/>
                          </cell>
                        </row>
                        <row>
                          <cell id="{88888888-8888-8888-8888-888888888888}"><control id="websiteurl" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="websiteurl"/></cell>
                        </row>
                      </rows>
                    </section>
                  </sections>
                </column>
              </columns>
            </tab>
          </tabs>
          <header id="{99999999-9999-9999-9999-999999999999}" columns="111">
            <rows><row><cell id="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"><control id="header_ownerid" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="ownerid"/></cell></row></rows>
          </header>
        </form>
        """;

    private static readonly Guid Cell = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static string Add(string column = "new_rating", string? tab = null, string? section = null, string xml = Form)
    {
        var result = AgentFormXml.AddColumn(xml, column, "Rating", 1033, AgentFormXml.ClassId("text"), tab, section, Cell);
        Assert.Null(result.Problem);
        return result.Value!;
    }

    private static string Row(string column = "new_rating", string display = "Rating", string classId = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}") =>
        $"<row><cell id=\"{{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}}\"><labels><label description=\"{display}\" languagecode=\"1033\"/></labels><control id=\"{column}\" classid=\"{classId}\" datafieldname=\"{column}\"/></cell></row>";

    [Fact]
    public void Adding_to_a_named_section_changes_nothing_but_the_inserted_row()
    {
        var edited = Add(tab: "details_tab", section: "notes");

        // Removing the inserted row gives back the original, byte for byte.
        Assert.Equal(Form, edited.Replace(Row(), ""));
        Assert.Equal(Form.Length + Row().Length, edited.Length);
        // And it landed at the end of that section's rows, after the existing rows.
        var notes = edited.IndexOf("name=\"notes\"", StringComparison.Ordinal);
        Assert.True(edited.IndexOf(Row(), StringComparison.Ordinal) > edited.IndexOf("websiteurl", StringComparison.Ordinal));
        Assert.True(edited.IndexOf(Row(), StringComparison.Ordinal) > notes);
    }

    [Fact]
    public void Adding_without_a_section_uses_the_first_section_of_the_first_tab()
    {
        var edited = Add();

        Assert.Equal(Form, edited.Replace(Row(), ""));
        var position = edited.IndexOf(Row(), StringComparison.Ordinal);
        Assert.True(position > edited.IndexOf("name=\"summary\"", StringComparison.Ordinal));
        Assert.True(position < edited.IndexOf("name=\"address\"", StringComparison.Ordinal));
        Assert.True(position > edited.IndexOf("datafieldname=\"name\"", StringComparison.Ordinal));
    }

    [Fact]
    public void An_empty_self_closing_rows_element_is_expanded_and_the_rest_is_untouched()
    {
        var edited = Add(section: "address");

        Assert.Contains("<rows>" + Row() + "</rows>", edited);
        Assert.Equal(Form, edited.Replace("<rows>" + Row() + "</rows>", "<rows />"));
    }

    [Fact]
    public void Tabs_and_sections_match_by_label_ignoring_case()
    {
        var byLabel = Add(tab: "DETAILS", section: "notes");
        Assert.Equal(Form, byLabel.Replace(Row(), ""));
        var sectionByLabel = Add(section: "Address");
        Assert.Contains("<rows>" + Row() + "</rows>", sectionByLabel);
    }

    [Fact]
    public void The_row_carries_the_label_control_class_and_a_braced_cell_id()
    {
        var edited = AgentFormXml.AddColumn(Form, "new_amount", "Amount & <Co>", 1031, AgentFormXml.ClassId("money"), null, null, Cell).Value!;

        Assert.Contains("<cell id=\"{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}\">", edited);
        Assert.Contains("<label description=\"Amount &amp; &lt;Co&gt;\" languagecode=\"1031\"/>", edited);
        Assert.Contains("classid=\"{533B9E00-756B-4312-95A0-DC888637AC78}\" datafieldname=\"new_amount\"", edited);
        // Still well-formed.
        Assert.NotEmpty(AgentFormXml.ListTabs(edited));
    }

    [Fact]
    public void An_unknown_section_is_an_invalid_request()
    {
        var result = AgentFormXml.AddColumn(Form, "new_rating", "Rating", 1033, "{x}", null, "nope", Cell);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("nope", result.Problem.Message);
    }

    [Fact]
    public void An_unknown_tab_is_an_invalid_request()
    {
        var result = AgentFormXml.AddColumn(Form, "new_rating", "Rating", 1033, "{x}", "nope", null, Cell);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    [Fact]
    public void A_section_in_another_tab_is_not_found_when_the_tab_is_given()
    {
        var result = AgentFormXml.AddColumn(Form, "new_rating", "Rating", 1033, "{x}", "general", "notes", Cell);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    [Theory]
    [InlineData("name")]
    [InlineData("TELEPHONE1")]
    [InlineData("ownerid")]
    [InlineData("header_ownerid")]
    public void A_column_already_on_the_form_is_an_invalid_request(string column)
    {
        var result = AgentFormXml.AddColumn(Form, column, "X", 1033, "{x}", null, null, Cell);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("already on this form", result.Problem.Message);
    }

    [Fact]
    public void Tabs_and_sections_are_listed_with_names_and_labels()
    {
        var tabs = AgentFormXml.ListTabs(Form);

        Assert.Equal(["general", "details_tab"], tabs.Select(t => t.Name));
        Assert.Equal(["General", "Details"], tabs.Select(t => t.Label));
        Assert.Equal([("summary", "Summary"), ("address", "Address")], tabs[0].Sections.Select(s => (s.Name, s.Label)));
        Assert.Equal([("notes", "Notes")], tabs[1].Sections.Select(s => (s.Name, s.Label)));
    }

    [Fact]
    public void Windows_line_endings_are_preserved()
    {
        var crlf = Form.Replace("\n", "\r\n");

        var edited = Add(tab: "details_tab", section: "notes", xml: crlf);

        Assert.Equal(crlf, edited.Replace(Row(), ""));
    }

    // ── Removing ──────────────────────────────────────────────────────────────

    private const string PhoneRow = """

                        <row>
                          <cell id="{77777777-7777-7777-7777-777777777777}">
                            <labels><label description="Phone" languagecode="1033"/></labels>
                            <control id="telephone1" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="telephone1"/>
                          </cell>
                        </row>
        """;

    [Fact]
    public void Removing_an_added_column_gives_back_the_original_form()
    {
        var added = Add(tab: "details_tab", section: "notes");

        var removed = AgentFormXml.RemoveColumn(added, "new_rating");

        Assert.Null(removed.Problem);
        Assert.Equal(Form, removed.Value!.FormXml);
        Assert.Equal(["Details / Notes"], removed.Value.Places);
    }

    [Fact]
    public void Removing_the_only_cell_of_a_row_removes_the_row_and_its_indentation_only()
    {
        var lf = Form.ReplaceLineEndings("\n");

        var removed = AgentFormXml.RemoveColumn(lf, "TELEPHONE1").Value!;

        Assert.Equal(lf.Replace(PhoneRow.ReplaceLineEndings("\n"), ""), removed.FormXml);
        Assert.Contains("datafieldname=\"websiteurl\"", removed.FormXml);
        Assert.Equal(2, AgentFormXml.ListTabs(removed.FormXml).Count);
    }

    [Fact]
    public void Removing_one_cell_of_a_shared_row_keeps_the_row_and_the_other_cell()
    {
        var shared = Form.Replace(
            "<cell id=\"{88888888-8888-8888-8888-888888888888}\">",
            "<cell id=\"{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}\"><control id=\"fax\" datafieldname=\"fax\"/></cell><cell id=\"{88888888-8888-8888-8888-888888888888}\">");

        var removed = AgentFormXml.RemoveColumn(shared, "fax").Value!;

        Assert.Equal(Form, removed.FormXml);
    }

    [Fact]
    public void A_column_in_the_body_and_the_header_is_removed_from_both()
    {
        var both = Form.Replace("<control id=\"name\"", "<control id=\"ownerid\"").Replace("datafieldname=\"name\"", "datafieldname=\"ownerid\"");

        var removed = AgentFormXml.RemoveColumn(both, "ownerid").Value!;

        Assert.DoesNotContain("ownerid", removed.FormXml);
        Assert.Equal(["General / Summary", "header"], removed.Places);
        Assert.Contains("<rows></rows>", removed.FormXml);
        Assert.NotEmpty(AgentFormXml.ListTabs(removed.FormXml));
    }

    [Fact]
    public void The_control_description_of_a_removed_control_goes_with_it()
    {
        var described = Form
            .Replace("<control id=\"websiteurl\"", "<control uniqueid=\"{FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF}\" id=\"websiteurl\"")
            .Replace("</form>", "  <controlDescriptions><controlDescription forControl=\"{FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF}\"><customControl/></controlDescription><controlDescription forControl=\"{other}\"/></controlDescriptions>\n</form>");

        var removed = AgentFormXml.RemoveColumn(described, "websiteurl").Value!;

        Assert.DoesNotContain("FFFFFFFF", removed.FormXml);
        Assert.Contains("<controlDescriptions><controlDescription forControl=\"{other}\"/></controlDescriptions>", removed.FormXml);
    }

    [Fact]
    public void A_column_not_on_the_form_is_an_invalid_request()
    {
        var result = AgentFormXml.RemoveColumn(Form, "new_missing");

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("not on this form", result.Problem.Message);
    }

    [Fact]
    public void Removing_keeps_windows_line_endings()
    {
        var crlf = Form.ReplaceLineEndings("\r\n");

        var removed = AgentFormXml.RemoveColumn(crlf, "telephone1").Value!;

        Assert.Equal(crlf.Replace(PhoneRow.ReplaceLineEndings("\r\n"), ""), removed.FormXml);
    }

    [Theory]
    [InlineData("text", "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}")]
    [InlineData("memo", "{E0DECE4B-6FC8-4a8f-A065-082708572369}")]
    [InlineData("integer", "{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}")]
    [InlineData("decimal", "{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E}")]
    [InlineData("money", "{533B9E00-756B-4312-95A0-DC888637AC78}")]
    [InlineData("boolean", "{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}")]
    [InlineData("datetime", "{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}")]
    [InlineData("choice", "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}")]
    [InlineData("lookup", "{270BD3DB-D9AF-4782-9025-509E298DEC0A}")]
    [InlineData("anything-else", "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}")]
    public void Control_class_ids_follow_the_column_kind(string kind, string expected) =>
        Assert.Equal(expected, AgentFormXml.ClassId(kind));
}
