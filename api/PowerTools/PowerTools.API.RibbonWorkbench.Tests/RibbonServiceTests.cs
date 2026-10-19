using Xunit;
using System.Xml.Linq;
using PowerTools.API.Tools.RibbonWorkbench;

namespace PowerTools.API.RibbonWorkbench.Tests;

public class RibbonServiceTests
{
    private static RibbonWorkbenchService Service(FakeRibbonClient client, bool online = true) =>
        new(client, new FakeDelay(), online);

    [Fact]
    public async Task Solutions_leave_out_Default_and_Active_and_carry_the_publisher_prefix()
    {
        var result = await Service(new FakeRibbonClient()).GetSolutionsAsync(CancellationToken.None);

        var solution = Assert.Single(result.Value!.Solutions);
        Assert.Equal("new_RibbonEdits", solution.UniqueName);
        Assert.Equal("new", solution.PublisherPrefix);
    }

    [Fact]
    public async Task Load_returns_tables_sorted_with_diffs_hashes_and_read_only_reasons()
    {
        var client = new FakeRibbonClient();
        client.Exports.Enqueue(RibbonFixtures.Solution(manifest: RibbonFixtures.Manifest(1, 1, 1, 50, 61, 61, 91)));
        client.Tables[0] = new RibbonTableInfo("account", "Account", true);
        client.Tables.Add(new RibbonTableInfo("lead", "Lead", false));

        var result = await Service(client).LoadAsync(new LoadBody { SolutionUniqueName = "NEW_RIBBONEDITS" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var load = result.Value!;
        Assert.Equal("new_RibbonEdits", load.Solution.UniqueName);
        Assert.Equal(["account", "contact", "queue"], load.Entities.Select(entity => entity.LogicalName));
        var account = load.Entities[0];
        Assert.Null(account.ReadOnlyReason);
        Assert.Equal("RibbonDiffXml", account.Diff!.Name);
        Assert.Equal(RibbonXml.Hash(account.Diff), account.DiffHash);
        Assert.Contains("without its metadata", load.Entities[1].ReadOnlyReason);
        Assert.Null(load.Entities[1].Diff);
        Assert.True(load.Entities[2].RibbonNotSupported);
        Assert.True(load.ApplicationRibbon.Included);
        Assert.Null(load.ApplicationRibbon.ReadOnlyReason);
        Assert.Equal(
            [new ComponentCountDto(61, "Web resource", 2), new ComponentCountDto(91, "Plug-in assembly", 1)],
            load.OtherComponents);
        Assert.True(load.CanPublish);
        Assert.Contains(load.RuleTypes, rule => rule.Name == "OrRule");
    }

    [Fact]
    public async Task Load_marks_a_table_that_is_not_customizable_as_read_only()
    {
        var client = new FakeRibbonClient();
        client.Tables[0] = new RibbonTableInfo("account", "Account", false);

        var load = (await Service(client).LoadAsync(new LoadBody { SolutionUniqueName = "new_RibbonEdits" }, CancellationToken.None)).Value!;

        Assert.Contains("not customizable", load.Entities.Single(entity => entity.LogicalName == "account").ReadOnlyReason);
    }

    [Fact]
    public async Task Load_blocks_application_ribbon_edits_without_the_Application_Ribbons_component()
    {
        var client = new FakeRibbonClient();
        client.Exports.Enqueue(RibbonFixtures.Solution(manifest: RibbonFixtures.Manifest(1, 1, 1)));

        var load = (await Service(client).LoadAsync(new LoadBody { SolutionUniqueName = "new_RibbonEdits" }, CancellationToken.None)).Value!;

        Assert.False(load.ApplicationRibbon.Included);
        Assert.Contains("Application Ribbons", load.ApplicationRibbon.ReadOnlyReason);
    }

    [Fact]
    public async Task Load_opens_read_only_when_import_or_publish_privileges_are_missing()
    {
        var client = new FakeRibbonClient();
        client.MissingPrivileges.AddRange(["prvImportCustomizations", "prvPublishCustomizations"]);

        var load = (await Service(client).LoadAsync(new LoadBody { SolutionUniqueName = "new_RibbonEdits" }, CancellationToken.None)).Value!;

        Assert.False(load.CanPublish);
        Assert.Contains("Import Customizations and Publish Customizations", load.ReadOnlyReason);
    }

    [Fact]
    public async Task Load_does_not_block_when_the_privilege_check_is_not_available()
    {
        var client = new FakeRibbonClient { PrivilegeError = FakeRibbonClient.Fault("Unrecognized request") };

        var load = (await Service(client).LoadAsync(new LoadBody { SolutionUniqueName = "new_RibbonEdits" }, CancellationToken.None)).Value!;

        Assert.True(load.CanPublish);
    }

    [Fact]
    public async Task Load_reports_an_unknown_solution()
    {
        var result = await Service(new FakeRibbonClient()).LoadAsync(new LoadBody { SolutionUniqueName = "Default" }, CancellationToken.None);

        Assert.Equal(404, result.Problem!.Status);
    }

    [Fact]
    public async Task Online_export_uses_ExportSolutionAsync_and_waits_for_the_system_job()
    {
        var client = new FakeRibbonClient();
        client.ExportOperations.Enqueue(new AsyncOperationState(1, 0, null, null));
        client.ExportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Succeeded, null, null));

        await Service(client).ExportAsync("new_RibbonEdits", CancellationToken.None);

        Assert.Equal(["startExport:new_RibbonEdits", "exportStatus", "exportStatus", "downloadExport"], client.Calls);
    }

    [Fact]
    public async Task Online_export_falls_back_to_ExportSolution_when_the_async_message_is_not_available()
    {
        var client = new FakeRibbonClient { StartExportError = FakeRibbonClient.Fault("Unrecognized request: ExportSolutionAsync") };

        await Service(client).ExportAsync("new_RibbonEdits", CancellationToken.None);

        Assert.Equal(["startExport:new_RibbonEdits", "export:new_RibbonEdits"], client.Calls);
    }

    [Fact]
    public async Task On_premises_export_uses_ExportSolution()
    {
        var client = new FakeRibbonClient();

        await Service(client, online: false).ExportAsync("new_RibbonEdits", CancellationToken.None);

        Assert.Equal(["export:new_RibbonEdits"], client.Calls);
    }

    [Fact]
    public async Task A_failed_export_job_reports_its_reason()
    {
        var client = new FakeRibbonClient();
        client.ExportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Failed, "raw", "Too big"));

        var error = await Assert.ThrowsAsync<RibbonPackageException>(() => Service(client).ExportAsync("new_RibbonEdits", CancellationToken.None));

        Assert.Contains("Too big", error.Message);
    }

    [Fact]
    public async Task Base_ribbon_reads_the_table_or_the_application_ribbon()
    {
        var client = new FakeRibbonClient();
        client.EntityRibbons["account"] = RibbonFixtures.Ribbon(RibbonFixtures.EntityRibbonXml);

        var account = await Service(client).GetBaseRibbonAsync("Account", CancellationToken.None);
        var application = await Service(client).GetBaseRibbonAsync(null, CancellationToken.None);
        var missing = await Service(client).GetBaseRibbonAsync("queue", CancellationToken.None);

        Assert.Equal("account", account.Value!.Entity);
        Assert.Equal(3, account.Value.Tabs.Count);
        Assert.Null(application.Value!.Entity);
        Assert.Equal("Mscrm.BasicHomeTab", application.Value.Tabs.Single().Attr("Id"));
        Assert.NotNull(missing.Problem);
        Assert.Equal(["entityRibbon:account", "applicationRibbon", "entityRibbon:queue"], client.Calls);
    }

    [Fact]
    public async Task Validate_checks_each_diff_against_its_published_ribbon()
    {
        var client = new FakeRibbonClient();
        client.EntityRibbons["account"] = RibbonFixtures.Ribbon(RibbonFixtures.EntityRibbonXml);
        var diff = RibbonXml.ToNode(XElement.Parse(
            "<RibbonDiffXml><CommandDefinitions><CommandDefinition Id=\"new.account.Cmd\"><DisplayRules><DisplayRule Id=\"new_IsOwner\" /></DisplayRules><Actions /></CommandDefinition></CommandDefinitions></RibbonDiffXml>"));

        var result = await Service(client).ValidateAsync(
            new DiffsBody { SolutionUniqueName = "new_RibbonEdits", Diffs = new() { ["account"] = diff } },
            CancellationToken.None);

        var problem = Assert.Single(result.Value!.Problems);
        Assert.Equal(new ProblemDto("error", "account", "new.account.Cmd", "Display rule new_IsOwner is not defined."), problem);
    }

    [Fact]
    public void PublishXml_names_only_the_changed_tables_and_the_application_ribbon()
    {
        var xml = RibbonRequests.PublishXml(RibbonPublisher.Targets(["contact", RibbonKeys.ApplicationRibbon, "Account"]));

        Assert.Equal(
            "<importexportxml><entities><entity>account</entity><entity>contact</entity></entities><ribbons><ribbon></ribbon></ribbons></importexportxml>",
            xml);
    }

    [Fact]
    public void Import_turns_processes_back_on_and_overwrites_unmanaged_customizations()
    {
        var id = Guid.NewGuid();
        var request = RibbonRequests.Import([1], id);

        Assert.True(request.PublishWorkflows);
        Assert.True(request.OverwriteUnmanagedCustomizations);
        Assert.False(request.ConvertToManaged);
        Assert.False(request.HoldingSolution);
        Assert.Equal(id, request.ImportJobId);
    }
}
