using Xunit;
using System.Xml.Linq;
using PowerTools.API.Tools.RibbonWorkbench;

namespace PowerTools.API.RibbonWorkbench.Tests;

public class RibbonPackageTests
{
    [Fact]
    public void Read_lists_tables_by_logical_name_with_their_diffs()
    {
        var package = RibbonSolutionPackage.Read(RibbonFixtures.Solution());

        Assert.Equal(["account", "queue", "contact"], package.Entities.Select(entity => entity.LogicalName));
        var account = package.Entities[0];
        Assert.False(account.RibbonNotSupported);
        Assert.NotNull(account.Diff);
        Assert.Equal("new.account.Hello.CustomAction",
            (string?)account.Diff!.Element("CustomActions")!.Element("CustomAction")!.Attribute("Id"));
    }

    [Fact]
    public void Read_marks_tables_without_ribbon_support_and_leaves_a_missing_diff_null()
    {
        var package = RibbonSolutionPackage.Read(RibbonFixtures.Solution());

        Assert.True(package.Entities.Single(entity => entity.LogicalName == "queue").RibbonNotSupported);
        // Contact was added without metadata: no RibbonDiffXml, which must not default to an empty diff.
        Assert.Null(package.Entities.Single(entity => entity.LogicalName == "contact").Diff);
    }

    [Fact]
    public void Read_reports_root_components_and_the_application_ribbon()
    {
        var package = RibbonSolutionPackage.Read(RibbonFixtures.Solution(manifest: RibbonFixtures.Manifest(1, 50, 91, 92)));

        Assert.Equal([1, 50, 91, 92], package.RootComponentTypes);
        Assert.True(package.IncludesApplicationRibbon);
        Assert.NotNull(package.ApplicationDiff);
    }

    [Fact]
    public void Read_fails_when_customizations_xml_is_missing()
    {
        var error = Assert.Throws<RibbonPackageException>(() =>
            RibbonSolutionPackage.Read(RibbonFixtures.Solution(includeCustomizations: false)));

        Assert.Contains("customizations.xml", error.Message);
    }

    [Fact]
    public void Read_fails_for_a_file_that_is_not_a_zip()
    {
        Assert.Throws<RibbonPackageException>(() => RibbonSolutionPackage.Read([1, 2, 3, 4]));
    }

    [Fact]
    public void Splice_replaces_only_the_named_diffs_and_matches_tables_without_regard_to_case()
    {
        var original = RibbonFixtures.Solution();
        var diff = XElement.Parse("<RibbonDiffXml><CustomActions><HideCustomAction HideActionId=\"new.Hide\" Location=\"Mscrm.HomepageGrid.account.NewRecord\" /></CustomActions></RibbonDiffXml>");

        var spliced = RibbonSolutionPackage.Splice(original, new Dictionary<string, XElement> { ["ACCOUNT"] = diff });

        Assert.Equal(RibbonFixtures.EntryNames(original).OrderBy(name => name), RibbonFixtures.EntryNames(spliced).OrderBy(name => name));
        Assert.Equal(RibbonFixtures.ReadEntry(original, "solution.xml"), RibbonFixtures.ReadEntry(spliced, "solution.xml"));
        var package = RibbonSolutionPackage.Read(spliced);
        var account = package.Entities.Single(entity => entity.LogicalName == "account").Diff!;
        Assert.Equal("new.Hide", (string?)account.Descendants("HideCustomAction").Single().Attribute("HideActionId"));
        Assert.Empty(account.Descendants("CustomAction"));
        Assert.True(package.Entities.Single(entity => entity.LogicalName == "queue").RibbonNotSupported);
        Assert.NotNull(package.ApplicationDiff);
    }

    [Fact]
    public void Splice_writes_the_application_ribbon_to_the_root_diff()
    {
        var diff = XElement.Parse("<RibbonDiffXml><LocLabels><LocLabel Id=\"new.App.Label\"><Titles><Title languagecode=\"1033\" description=\"App\" /></Titles></LocLabel></LocLabels></RibbonDiffXml>");

        var spliced = RibbonSolutionPackage.Splice(
            RibbonFixtures.Solution(),
            new Dictionary<string, XElement> { [RibbonKeys.ApplicationRibbon] = diff });

        var package = RibbonSolutionPackage.Read(spliced);
        Assert.Equal("new.App.Label", (string?)package.ApplicationDiff!.Descendants("LocLabel").Single().Attribute("Id"));
        Assert.NotEmpty(package.Entities.Single(entity => entity.LogicalName == "account").Diff!.Descendants("CustomAction"));
    }

    [Fact]
    public void Splice_fails_for_a_table_that_is_no_longer_in_the_solution()
    {
        var error = Assert.Throws<RibbonPackageException>(() => RibbonSolutionPackage.Splice(
            RibbonFixtures.Solution(),
            new Dictionary<string, XElement> { ["lead"] = new XElement("RibbonDiffXml") }));

        Assert.Contains("lead", error.Message);
    }

    [Fact]
    public void Splice_does_not_write_a_diff_for_a_table_exported_without_metadata()
    {
        var error = Assert.Throws<RibbonPackageException>(() => RibbonSolutionPackage.Splice(
            RibbonFixtures.Solution(),
            new Dictionary<string, XElement> { ["contact"] = new XElement("RibbonDiffXml") }));

        Assert.Contains("metadata", error.Message);
    }

    [Fact]
    public void Splice_fails_for_the_application_ribbon_when_the_export_has_none()
    {
        var solution = RibbonFixtures.Solution(RibbonFixtures.Customizations(withApplicationDiff: false), RibbonFixtures.Manifest(1));

        Assert.Throws<RibbonPackageException>(() => RibbonSolutionPackage.Splice(
            solution,
            new Dictionary<string, XElement> { [RibbonKeys.ApplicationRibbon] = new XElement("RibbonDiffXml") }));
    }
}

public class RibbonXmlTests
{
    [Fact]
    public void Round_trip_keeps_unknown_elements_attributes_and_comments()
    {
        const string xml =
            "<RibbonDiffXml><CustomActions><!-- keep me --><CustomAction Id=\"a\" Location=\"b\" Future=\"x\">" +
            "<CommandUIDefinition><SomethingNew Id=\"n\"><Deeper Flag=\"true\">text</Deeper></SomethingNew></CommandUIDefinition>" +
            "</CustomAction></CustomActions></RibbonDiffXml>";

        var node = RibbonXml.ToNode(XElement.Parse(xml));
        var back = RibbonXml.ToElement(node);

        Assert.True(XNode.DeepEquals(XElement.Parse(xml), back));
        Assert.Equal("#comment", node.Children[0].Children[0].Name);
    }

    [Fact]
    public void Hash_ignores_whitespace_comments_and_attribute_order()
    {
        var first = RibbonXml.ToNode(XElement.Parse("<A x=\"1\" y=\"2\">\n  <B />\n</A>"));
        var second = RibbonXml.ToNode(XElement.Parse("<A y=\"2\" x=\"1\"><!-- c --><B/></A>"));
        var changed = RibbonXml.ToNode(XElement.Parse("<A y=\"3\" x=\"1\"><B/></A>"));

        Assert.Equal(RibbonXml.Hash(first), RibbonXml.Hash(second));
        Assert.NotEqual(RibbonXml.Hash(first), RibbonXml.Hash(changed));
    }
}

public class RibbonDefinitionTests
{
    [Fact]
    public void Parse_reads_tabs_including_contextual_tabs_commands_rules_and_templates()
    {
        var ribbon = RibbonDefinition.Parse(
            RibbonDefinition.Unzip(RibbonFixtures.Ribbon(RibbonFixtures.EntityRibbonXml)),
            "account");

        Assert.Equal(
            ["Mscrm.HomepageGrid.account.MainTab", "Mscrm.Form.account.MainTab", "Mscrm.SubGrid.account.MainTab"],
            ribbon.Tabs.Select(tab => tab.Attr("Id")));
        Assert.Equal(["Mscrm.NewRecordFromGrid", "Mscrm.HomepageGrid.DeleteSplitButtonCommand"], ribbon.Commands.Select(command => command.Attr("Id")));
        Assert.Equal(["Mscrm.Enabled"], ribbon.EnableRules.Select(rule => rule.Attr("Id")));
        Assert.Equal(["Mscrm.CanDeletePrimary"], ribbon.DisplayRules.Select(rule => rule.Attr("Id")));
        var template = Assert.Single(ribbon.Templates);
        Assert.Equal("Mscrm.Templates.Flexible2", template.Id);
        Assert.Equal(["LargeMedium", "LargeSmall"], template.Layouts);
    }

    [Fact]
    public void Unzip_fails_when_RibbonXml_xml_is_missing()
    {
        var error = Assert.Throws<RibbonPackageException>(() =>
            RibbonDefinition.Unzip(RibbonFixtures.Zip(new Dictionary<string, string> { ["other.xml"] = "<a/>" })));

        Assert.Contains("RibbonXml.xml", error.Message);
    }
}

public class ImportJobDataTests
{
    [Fact]
    public void Parse_returns_failures_and_warnings_with_the_component_name_and_unescaped_text()
    {
        const string data =
            "<importexportxml><entities><entity LocalizedName=\"Account\"><result result=\"failure\" errorcode=\"0x80040203\" " +
            "errortext=\"Invalid &amp;lt;RibbonDiffXml&amp;gt;\" /></entity>" +
            "<entity LocalizedName=\"Contact\"><result result=\"warning\" errorcode=\"0\" errortext=\"Form changed\" /></entity>" +
            "<entity LocalizedName=\"Lead\"><result result=\"success\" errorcode=\"0\" errortext=\"\" /></entity></entities></importexportxml>";

        var results = ImportJobData.Parse(data);

        Assert.Equal(["Account: Invalid <RibbonDiffXml> (0x80040203)"], results.Failures);
        Assert.Equal(["Contact: Form changed"], results.Warnings);
    }

    [Fact]
    public void Parse_ignores_empty_and_malformed_data()
    {
        Assert.Empty(ImportJobData.Parse(null).Failures);
        Assert.Empty(ImportJobData.Parse("<not xml").Failures);
    }
}
