using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Kernel;

public sealed class KernelServicesTests
{
    [Fact]
    public async Task Capabilities_probe_reads_version_feature_tables_and_the_export_message()
    {
        var client = KernelFakes.Client([]);
        client.ByEntity["sdkmessage"] = [new Entity("sdkmessage") { ["name"] = "ExportSolutionAsync" }];

        var capabilities = await Capabilities.ProbeAsync(client, CancellationToken.None);

        Assert.Equal("9.2.25010.100", capabilities.Version);
        Assert.True(capabilities.HasTable("customapi"));
        Assert.False(capabilities.HasTable("appaction"));
        Assert.True(capabilities.ExportSolutionAsync);
    }

    [Fact]
    public async Task Capabilities_of_an_older_on_premises_server_lack_the_online_features()
    {
        var client = KernelFakes.Client([]);
        var inner = client.OnExecute;
        client.OnExecute = request => request is RetrieveEntityRequest
            ? throw FakeAgentClient.Fault(unchecked((int)0x80040217), "Could not find entity")
            : request is RetrieveVersionRequest
                ? new RetrieveVersionResponse { Results = new ParameterCollection { ["Version"] = "9.1.0.0" } }
                : inner(request);

        var capabilities = await Capabilities.ProbeAsync(client, CancellationToken.None);

        Assert.Empty(capabilities.Tables);
        Assert.False(capabilities.ExportSolutionAsync);
        Assert.Equal(new Version(9, 1, 0, 0), capabilities.ParsedVersion);
    }

    [Fact]
    public async Task Capabilities_cache_probes_once_per_connection_until_it_expires()
    {
        var time = new ManualTime();
        var cache = new CapabilitiesCache(time, TimeSpan.FromMinutes(10));
        var client = KernelFakes.Client([]);

        await cache.GetAsync("org-a", client, CancellationToken.None);
        await cache.GetAsync("org-a", client, CancellationToken.None);
        Assert.Single(client.Executed.OfType<RetrieveVersionRequest>());

        await cache.GetAsync("org-b", client, CancellationToken.None);
        time.Advance(TimeSpan.FromMinutes(11));
        await cache.GetAsync("org-a", client, CancellationToken.None);
        Assert.Equal(3, client.Executed.OfType<RetrieveVersionRequest>().Count());
    }

    [Fact]
    public void Publisher_builds_one_request_per_kind_and_escapes_names()
    {
        var request = Publisher.Build([
            new PublishTarget(PublishKind.Entity, "account"),
            new PublishTarget(PublishKind.Entity, "account"),
            new PublishTarget(PublishKind.OptionSet, "con_stage"),
            new PublishTarget(PublishKind.WebResource, "con_/a&b.js"),
        ])!;

        Assert.Equal(
            "<importexportxml><entities><entity>account</entity></entities><optionsets><optionset>con_stage</optionset></optionsets>"
            + "<webresources><webresource>con_/a&amp;b.js</webresource></webresources></importexportxml>",
            request.ParameterXml);
        Assert.Null(Publisher.Build([]));
    }

    [Fact]
    public void Labels_compare_only_the_languages_the_spec_gives()
    {
        var current = new Label("Budget", 1033);
        current.LocalizedLabels.Add(new LocalizedLabel("Budget FR", 1036));

        Assert.True(Labels.Matches(current, "Budget", 1033));
        Assert.False(Labels.Matches(current, "Costs", 1033));
        Assert.True(Labels.Matches(new Label("Budget", 1033), "Budget", 1033), "a missing translation is not a change");
        Assert.False(Labels.Matches(current, "Budget", 1033, new Dictionary<int, string> { [1036] = "Budget (FR)" }));
    }

    [Fact]
    public async Task Solution_context_gives_the_publisher_prefix_and_refuses_a_managed_solution()
    {
        var client = Data.Client();

        var context = await SolutionContext.ResolveAsync(client, "Core", CancellationToken.None);
        Assert.Equal("new", context.Prefix);
        Assert.Equal(10000, context.OptionValuePrefix);
        Assert.NotNull(context.CheckSchemaName("fab_Project"));
        Assert.Null(context.CheckSchemaName("new_Project"));

        await Assert.ThrowsAsync<Dyno.Api.Tools.Agent.AgentProblemException>(() =>
            SolutionContext.ResolveAsync(client, "Managed1", CancellationToken.None));
    }

    [Fact]
    public async Task Import_runs_as_ExecuteAsync_and_polls_until_the_job_completes()
    {
        var client = Data.Client();
        var operationId = Guid.NewGuid();
        var polls = 0;
        client.OnExecute = request => request is ExecuteAsyncRequest
            ? new ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operationId } }
            : new OrganizationResponse();
        var jobs = new AsyncJobs(client, (_, _) =>
        {
            if (++polls == 2)
            {
                client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
                {
                    ["statecode"] = new OptionSetValue(3),
                    ["statuscode"] = new OptionSetValue(30),
                };
            }

            return Task.CompletedTask;
        });
        client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId) { ["statecode"] = new OptionSetValue(1) };

        var outcome = await jobs.ImportAsync([1, 2, 3], new ImportOptions(HoldingSolution: true), null, CancellationToken.None);

        Assert.True(outcome.Succeeded);
        Assert.Equal(2, polls);
        var sent = Assert.IsType<ImportSolutionRequest>(Assert.Single(client.Executed.OfType<ExecuteAsyncRequest>()).Request);
        Assert.True(sent.HoldingSolution);
        Assert.Equal(outcome.ImportJobId, sent.ImportJobId);
    }

    [Fact]
    public async Task A_failed_import_reports_the_first_error_of_the_import_job()
    {
        var client = Data.Client();
        var operationId = Guid.NewGuid();
        client.OnExecute = request => new ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operationId } };
        client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
        {
            ["statecode"] = new OptionSetValue(3),
            ["statuscode"] = new OptionSetValue(31),
        };
        client.OnExecute = request =>
        {
            if (request is ExecuteAsyncRequest async)
            {
                var jobId = ((ImportSolutionRequest)async.Request).ImportJobId;
                client.Records[("importjob", jobId)] = new Entity("importjob", jobId)
                {
                    ["progress"] = 40.0,
                    ["data"] = """<importexportxml><entities><entity name="con_project"><result result="failure" errortext="Missing dependency" /></entity></entities></importexportxml>""",
                };
            }

            return new ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operationId } };
        };

        var outcome = await new AsyncJobs(client, (_, _) => Task.CompletedTask).ImportAsync([1], new ImportOptions(), null, CancellationToken.None);

        Assert.False(outcome.Succeeded);
        Assert.Equal("con_project: Missing dependency", outcome.Message);
        Assert.Equal(40.0, outcome.Progress);
    }

    [Fact]
    public async Task Export_uses_the_synchronous_message_when_the_async_one_is_missing()
    {
        var client = Data.Client();
        client.OnExecute = request => request is ExportSolutionRequest
            ? new ExportSolutionResponse { Results = new ParameterCollection { ["ExportSolutionFile"] = new byte[] { 9 } } }
            : throw new InvalidOperationException("unexpected");

        var file = await new AsyncJobs(client).ExportAsync("Core", managed: true, KernelFakes.Capabilities(), CancellationToken.None);

        Assert.Equal([9], file);
    }

    [Fact]
    public async Task Export_uses_ExportSolutionAsync_and_downloads_the_file_when_available()
    {
        var client = Data.Client();
        var operationId = Guid.NewGuid();
        var exportJobId = Guid.NewGuid();
        client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
        {
            ["statecode"] = new OptionSetValue(3),
            ["statuscode"] = new OptionSetValue(30),
        };
        client.OnExecute = request => request.RequestName switch
        {
            "ExportSolutionAsync" => new OrganizationResponse { Results = new ParameterCollection { ["AsyncOperationId"] = operationId, ["ExportJobId"] = exportJobId } },
            "DownloadSolutionExportData" => new OrganizationResponse { Results = new ParameterCollection { ["ExportSolutionFile"] = new byte[] { 7 } } },
            _ => throw new InvalidOperationException(request.RequestName),
        };
        var capabilities = KernelFakes.Capabilities() with { ExportSolutionAsync = true };

        var file = await new AsyncJobs(client, (_, _) => Task.CompletedTask).ExportAsync("Core", false, capabilities, CancellationToken.None);

        Assert.Equal([7], file);
        Assert.Equal(exportJobId, client.Executed.Single(r => r.RequestName == "DownloadSolutionExportData")["ExportJobId"]);
    }

    [Fact]
    public async Task A_throttled_poll_waits_and_polls_again_instead_of_failing()
    {
        var client = Data.Client();
        var operationId = Guid.NewGuid();
        client.Records[("asyncoperation", operationId)] = new Entity("asyncoperation", operationId)
        {
            ["statecode"] = new OptionSetValue(3),
            ["statuscode"] = new OptionSetValue(30),
        };
        var throttled = 0;
        client.BeforeRetrieve = (table, _) =>
        {
            if (table == "asyncoperation" && throttled++ == 0)
            {
                var fault = new OrganizationServiceFault { ErrorCode = -2147015902, Message = "Number of requests exceeded the limit." };
                fault.ErrorDetails["Retry-After"] = TimeSpan.FromSeconds(5);
                throw new System.ServiceModel.FaultException<OrganizationServiceFault>(fault, "throttled");
            }
        };
        var waits = new List<TimeSpan>();

        var status = await new AsyncJobs(client, (wait, _) => { waits.Add(wait); return Task.CompletedTask; })
            .WaitAsync(operationId, null, CancellationToken.None);

        Assert.True(status.Succeeded);
        Assert.Equal([TimeSpan.FromSeconds(5)], waits);
    }
}

internal sealed class ManualTime : TimeProvider
{
    private DateTimeOffset now = new(2026, 11, 21, 12, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => now;

    public void Advance(TimeSpan by) => now += by;
}
