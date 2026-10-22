using Xunit;
using System.Xml.Linq;
using PowerTools.API.Services;
using PowerTools.API.Tools.RibbonWorkbench;

namespace PowerTools.API.RibbonWorkbench.Tests;

public class RibbonPublisherTests
{
    private static readonly DataverseConnectionContext Connection =
        new OnlineConnectionContext("token", "https://dev.example.test");

    private static string LoadedHash(string key = "account")
    {
        var package = RibbonSolutionPackage.Read(RibbonFixtures.Solution());
        var element = RibbonKeys.IsApplication(key)
            ? package.ApplicationDiff!
            : package.Entities.Single(entity => entity.LogicalName == key).Diff!;
        return RibbonXml.Hash(RibbonXml.ToNode(element));
    }

    private static RibbonNodeDto EditedDiff() => RibbonXml.ToNode(XElement.Parse(
        "<RibbonDiffXml><CustomActions><HideCustomAction HideActionId=\"new.account.HideNew\" Location=\"Mscrm.HomepageGrid.account.NewRecord\" /></CustomActions>" +
        "<Templates><RibbonTemplates Id=\"Mscrm.RTE.Templates\" /></Templates><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>"));

    private static RibbonPublishJob Job(string? hash = null) =>
        new(
            new PreparedPublish(
                "new_RibbonEdits",
                new Dictionary<string, RibbonNodeDto> { ["account"] = EditedDiff() },
                new Dictionary<string, string> { ["account"] = hash ?? LoadedHash() }),
            Connection);

    private static (FakeRibbonClient Client, FakeDelay Delay) Setup()
    {
        var client = new FakeRibbonClient();
        return (client, new FakeDelay());
    }

    [Fact]
    public async Task Publish_reexports_splices_imports_waits_and_publishes_only_the_changed_table()
    {
        var (client, delay) = Setup();
        client.ImportOperations.Enqueue(new AsyncOperationState(1, 20, null, null));
        client.ImportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Succeeded, null, null));
        client.ImportJobs.Enqueue(null);
        client.ImportJobs.Enqueue(new ImportJobState(100, "<importexportxml><entities><entity LocalizedName=\"Account\"><result result=\"warning\" errortext=\"Check form\" /></entity></entities></importexportxml>", DateTime.UtcNow));
        var job = Job();

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(PublishJobStatuses.Succeeded, dto.Status);
        Assert.Equal(100, dto.Progress);
        Assert.Equal(["Account: Check form"], dto.Warnings);
        var (file, importJobId) = Assert.Single(client.Imports);
        Assert.NotEqual(Guid.Empty, importJobId);
        var imported = RibbonSolutionPackage.Read(file);
        Assert.Equal("new.account.HideNew",
            (string?)imported.Entities.Single(entity => entity.LogicalName == "account").Diff!.Descendants("HideCustomAction").Single().Attribute("HideActionId"));
        Assert.Equal("<importexportxml><entities><entity>account</entity></entities></importexportxml>", Assert.Single(client.Published));
        Assert.All(delay.Waits, wait => Assert.True(wait >= TimeSpan.FromSeconds(2)));
    }

    [Fact]
    public async Task Publish_stops_with_a_conflict_when_the_diff_changed_since_it_was_loaded()
    {
        var (client, delay) = Setup();
        var job = Job(hash: "stale");

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(PublishJobStatuses.Conflict, dto.Status);
        Assert.Contains("account", dto.Message);
        Assert.Empty(client.Imports);
        Assert.Empty(client.Published);
    }

    [Fact]
    public async Task A_failed_import_reports_the_system_job_message_and_the_component_failures()
    {
        var (client, delay) = Setup();
        client.ImportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Failed, "raw", "Import failed."));
        client.ImportJobs.Enqueue(new ImportJobState(40, "<importexportxml><entities><entity LocalizedName=\"Account\"><result result=\"failure\" errorcode=\"0x1\" errortext=\"Bad ribbon\" /></entity></entities></importexportxml>", null));
        var job = Job();

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(PublishJobStatuses.Failed, dto.Status);
        Assert.Equal("The solution could not be imported.", dto.Message);
        Assert.Equal(["Import failed.", "Account: Bad ribbon (0x1)"], dto.Errors);
        Assert.Empty(client.Published);
    }

    [Fact]
    public async Task A_failed_publish_after_a_good_import_is_its_own_state()
    {
        var (client, delay) = Setup();
        client.ImportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Succeeded, null, null));
        client.PublishError = FakeRibbonClient.Fault("Publish blew up");
        var job = Job();

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(PublishJobStatuses.PublishFailed, dto.Status);
        Assert.Contains("imported but not published", dto.Message);
        Assert.Contains(dto.Errors, error => error.Contains("Publish blew up"));
        Assert.Equal(["account"], dto.Targets.Entities);
    }

    [Fact]
    public async Task A_busy_organization_is_reported_as_busy()
    {
        var (client, delay) = Setup();
        client.PublishError = FakeRibbonClient.Fault("Cannot start the requested operation [Publish] because there is another [Import] running at this moment.");
        client.ImportOperations.Enqueue(new AsyncOperationState(3, AsyncOperationState.Succeeded, null, null));
        var job = Job();

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        Assert.Contains(job.ToDto().Errors, error => error.StartsWith(RibbonWorkbenchFaults.BusyMessage, StringComparison.Ordinal));
    }

    [Fact]
    public async Task An_import_that_runs_too_long_is_reported_as_still_running_not_failed()
    {
        var (client, delay) = Setup();
        client.ImportOperations.Enqueue(new AsyncOperationState(2, 20, null, null));
        var job = Job();

        await new RibbonPublisher(client, delay).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(PublishJobStatuses.TimedOut, dto.Status);
        Assert.Contains("still running", dto.Message);
        Assert.Empty(client.Published);
        // One wait for the export job, then import polls until the 15-minute limit.
        Assert.Equal(
            RibbonWorkbenchService.ExportPollInterval + RibbonPublisher.ImportTimeout,
            TimeSpan.FromTicks(delay.Waits.Sum(wait => wait.Ticks)));
    }

    [Fact]
    public void Job_store_returns_queued_jobs_once()
    {
        var store = new InMemoryRibbonPublishJobStore();
        var id = store.Save(Job().Prepared, Connection);

        Assert.Equal(id, store.DequeueNext()!.Id);
        Assert.Null(store.DequeueNext());
        Assert.Equal(PublishJobStatuses.Queued, store.Get(id)!.ToDto().Status);
    }
}
