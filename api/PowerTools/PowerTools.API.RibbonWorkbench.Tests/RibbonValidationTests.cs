using Xunit;
using System.Xml.Linq;
using PowerTools.API.Tools.RibbonWorkbench;

namespace PowerTools.API.RibbonWorkbench.Tests;

public class RibbonValidationTests
{
    private static readonly BaseRibbonDto AccountBase =
        RibbonDefinition.Parse(RibbonDefinition.Unzip(RibbonFixtures.Ribbon(RibbonFixtures.EntityRibbonXml)), "account");

    private static readonly BaseRibbonDto ApplicationBase =
        RibbonDefinition.Parse(RibbonDefinition.Unzip(RibbonFixtures.Ribbon(RibbonFixtures.ApplicationRibbonXml)), null);

    private static IReadOnlyList<ProblemDto> Validate(string diff, string? prefix = "new", IReadOnlySet<string>? webResources = null) =>
        RibbonDiffValidator.Validate(
            new DiffValidationContext
            {
                Key = "account",
                Diff = RibbonXml.ToNode(XElement.Parse(diff)),
                Base = AccountBase,
                ApplicationBase = ApplicationBase,
                PublisherPrefix = prefix,
            },
            webResources ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "new_/scripts/hello.js" });

    [Fact]
    public void A_valid_diff_has_no_problems()
    {
        Assert.Empty(Validate(RibbonFixtures.AccountDiff));
    }

    [Fact]
    public void Rule_references_resolve_against_the_diff_the_table_ribbon_and_the_application_ribbon()
    {
        const string diff =
            "<RibbonDiffXml><CommandDefinitions><CommandDefinition Id=\"Mscrm.HomepageGrid.DeleteSplitButtonCommand\">" +
            "<EnableRules><EnableRule Id=\"Mscrm.Enabled\" /><EnableRule Id=\"Mscrm.IsValidForHierarchyView\" /></EnableRules>" +
            "<DisplayRules><DisplayRule Id=\"Mscrm.CanDeletePrimary\" /><DisplayRule Id=\"Mscrm.HideOnModern\" /></DisplayRules>" +
            "<Actions /></CommandDefinition></CommandDefinitions></RibbonDiffXml>";

        Assert.Empty(Validate(diff));
    }

    [Fact]
    public void A_missing_rule_reference_is_an_error()
    {
        const string diff =
            "<RibbonDiffXml><CommandDefinitions><CommandDefinition Id=\"new.account.Cmd\">" +
            "<EnableRules><EnableRule Id=\"new.account.Missing\" /></EnableRules>" +
            "<DisplayRules><DisplayRule Id=\"new_IsOwner\" /></DisplayRules><Actions /></CommandDefinition></CommandDefinitions></RibbonDiffXml>";

        var problems = Validate(diff);

        Assert.Contains(problems, problem => problem is { Severity: "error", Item: "new.account.Cmd", Problem: "Enable rule new.account.Missing is not defined." });
        Assert.Contains(problems, problem => problem.Problem == "Display rule new_IsOwner is not defined.");
    }

    [Fact]
    public void Duplicate_ids_are_errors()
    {
        const string diff =
            "<RibbonDiffXml><CommandDefinitions>" +
            "<CommandDefinition Id=\"new.Cmd\"><Actions /></CommandDefinition>" +
            "<CommandDefinition Id=\"new.Cmd\"><Actions /></CommandDefinition>" +
            "</CommandDefinitions></RibbonDiffXml>";

        Assert.Contains(Validate(diff), problem => problem is { Severity: "error", Problem: "The id new.Cmd is used by more than one command." });
    }

    [Fact]
    public void A_missing_command_label_or_custom_action_content_is_an_error()
    {
        const string diff =
            "<RibbonDiffXml><CustomActions>" +
            "<CustomAction Id=\"new.A\" Location=\"x._children\"><CommandUIDefinition><Button Id=\"new.B\" Command=\"new.Nope\" LabelText=\"$LocLabels:new.NoLabel\" /></CommandUIDefinition></CustomAction>" +
            "<CustomAction Id=\"new.Empty\" Location=\"x._children\"><CommandUIDefinition /></CustomAction>" +
            "</CustomActions></RibbonDiffXml>";

        var problems = Validate(diff).Select(problem => problem.Problem).ToList();

        Assert.Contains("Command new.Nope is not defined.", problems);
        Assert.Contains("Label new.NoLabel is not defined.", problems);
        Assert.Contains("Custom action new.Empty must define exactly one element.", problems);
    }

    [Fact]
    public void An_id_without_the_publisher_prefix_is_only_a_warning()
    {
        const string diff =
            "<RibbonDiffXml><CommandDefinitions><CommandDefinition Id=\"other.Cmd\"><Actions /></CommandDefinition>" +
            "<CommandDefinition Id=\"Mscrm.NewRecordFromGrid\"><Actions /></CommandDefinition></CommandDefinitions></RibbonDiffXml>";

        var problem = Assert.Single(Validate(diff));
        Assert.Equal(ProblemSeverities.Warning, problem.Severity);
        Assert.Equal("other.Cmd does not start with the publisher prefix new.", problem.Problem);
    }

    [Fact]
    public void Missing_required_rule_attributes_and_wrong_rule_kinds_are_errors()
    {
        const string diff =
            "<RibbonDiffXml><RuleDefinitions><DisplayRules><DisplayRule Id=\"new.D\"><ValueRule Field=\"name\" /><SelectionCountRule Minimum=\"1\" /></DisplayRule></DisplayRules>" +
            "<EnableRules><EnableRule Id=\"new.E\"><OrRule><Or><FormStateRule /></Or></OrRule></EnableRule></EnableRules></RuleDefinitions></RibbonDiffXml>";

        var problems = Validate(diff).Select(problem => problem.Problem).ToList();

        Assert.Contains("ValueRule in new.D needs Value.", problems);
        Assert.Contains("SelectionCountRule cannot be used in a display rule.", problems);
        Assert.Contains("FormStateRule in new.E needs State.", problems);
    }

    [Fact]
    public void A_missing_web_resource_is_a_warning()
    {
        var problems = Validate(RibbonFixtures.AccountDiff, webResources: new HashSet<string>());

        var problem = Assert.Single(problems);
        Assert.Equal(ProblemSeverities.Warning, problem.Severity);
        Assert.Equal("Web resource new_/scripts/hello.js was not found in this environment.", problem.Problem);
    }

    [Fact]
    public void A_read_only_diff_is_an_error_and_nothing_else_is_checked()
    {
        var problems = RibbonDiffValidator.Validate(
            new DiffValidationContext
            {
                Key = "contact",
                Diff = RibbonXml.ToNode(XElement.Parse("<RibbonDiffXml />")),
                ReadOnlyReason = "Not editable.",
            },
            new HashSet<string>());

        Assert.Equal("Not editable.", Assert.Single(problems).Problem);
    }

    [Fact]
    public void WebResources_lists_libraries_of_actions_and_custom_rules()
    {
        const string diff =
            "<RibbonDiffXml><CommandDefinitions><CommandDefinition Id=\"c\"><Actions><JavaScriptFunction FunctionName=\"f\" Library=\"$webresource:a.js\" />" +
            "<JavaScriptFunction FunctionName=\"g\" Library=\"/inline.js\" /></Actions></CommandDefinition></CommandDefinitions>" +
            "<RuleDefinitions><EnableRules><EnableRule Id=\"e\"><CustomRule FunctionName=\"h\" Library=\"$webresource:b.js\" /></EnableRule></EnableRules></RuleDefinitions></RibbonDiffXml>";

        Assert.Equal(["a.js", "b.js"], RibbonDiffValidator.WebResources(RibbonXml.ToNode(XElement.Parse(diff))).Order());
    }
}
