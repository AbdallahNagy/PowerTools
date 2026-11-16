using System.Text.Json.Nodes;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.DataMigration.Tests.Support;
using Xunit;

namespace PowerTools.API.DataMigration.Tests;

/// <summary>
/// The /api/migration contract the desktop app depends on, pinned through the real routes.
/// </summary>
public sealed class MigrationRoutesTests
{
    private static readonly Guid A = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid B = Guid.Parse("00000000-0000-0000-0000-00000000000b");
    private static readonly Guid C = Guid.Parse("00000000-0000-0000-0000-00000000000c");
    private static readonly Guid D = Guid.Parse("00000000-0000-0000-0000-00000000000d");

    private static FakeDataverse Accounts() => new("account", "accountid", "name");

    private static void AssertJson(string expected, JsonNode? actual) =>
        Assert.Equal(JsonNode.Parse(expected)!.ToJsonString(), actual?.ToJsonString());

    [Fact]
    public async Task Preview_lists_one_page_of_source_records_by_id_and_name()
    {
        var source = Accounts().Add(A, "Alpha").Add(B, "Beta").Add(C, "Gamma");
        await using var api = new MigrationApi(source, Accounts());

        var (status, body) = await api.PostAsync("/api/migration/preview",
            new { entityLogicalName = "account", pageSize = 2, page = 1 });

        Assert.Equal(200, status);
        AssertJson($$"""
            {"records":[{"id":"{{A}}","name":"Alpha"},{"id":"{{B}}","name":"Beta"}],
             "pagingCookie":"<cookie page=\"1\" />","moreRecords":true}
            """, body);
    }

    [Fact]
    public async Task Preview_reports_a_Dataverse_error_as_a_bad_request()
    {
        var source = Accounts();
        source.FailEverything = new InvalidOperationException("Source unreachable.");
        await using var api = new MigrationApi(source, Accounts());

        var (status, body) = await api.PostAsync("/api/migration/preview", new { entityLogicalName = "account" });

        Assert.Equal(400, status);
        AssertJson("""{"error":"Source unreachable."}""", body);
    }

    [Fact]
    public async Task Count_uses_the_aggregate_count()
    {
        await using var api = new MigrationApi(Accounts().Add(A).Add(B).Add(C), Accounts());

        var (status, body) = await api.PostAsync("/api/migration/count", new { entityLogicalName = "account" });

        Assert.Equal(200, status);
        AssertJson("""{"count":3}""", body);
    }

    [Fact]
    public async Task Count_pages_through_ids_when_the_aggregate_count_fails()
    {
        var source = Accounts().AddMany(5001);
        source.AggregateCountFails = true;
        await using var api = new MigrationApi(source, Accounts());

        var (_, body) = await api.PostAsync("/api/migration/count", new { entityLogicalName = "account" });

        AssertJson("""{"count":5001}""", body);
    }

    [Fact]
    public async Task Count_in_target_counts_source_records_and_those_already_in_the_target()
    {
        await using var api = new MigrationApi(Accounts().Add(A).Add(B).Add(C), Accounts().Add(B).Add(D));

        var (status, body) = await api.PostAsync("/api/migration/count/target", new { entityLogicalName = "account" });

        Assert.Equal(200, status);
        AssertJson("""{"count":3,"existing":1}""", body);
    }

    [Fact]
    public async Task Existing_answers_which_previewed_ids_are_in_the_target()
    {
        await using var api = new MigrationApi(Accounts(), Accounts().Add(A).Add(C));

        var (status, body) = await api.PostAsync("/api/migration/existing",
            new { entityLogicalName = "account", ids = new[] { A, B } });

        Assert.Equal(200, status);
        AssertJson($$"""{"existingIds":["{{A}}"]}""", body);
    }

    [Fact]
    public async Task Existing_looks_ids_up_in_chunks_of_1000()
    {
        var ids = Enumerable.Range(0, 1500).Select(_ => Guid.NewGuid()).ToArray();
        var target = Accounts().Add(ids[1499]);
        await using var api = new MigrationApi(Accounts(), target);

        var (_, body) = await api.PostAsync("/api/migration/existing", new { entityLogicalName = "account", ids });

        AssertJson($$"""{"existingIds":["{{ids[1499]}}"]}""", body);
        Assert.Equal([1000, 500], target.Fetches.Select(f => System.Xml.Linq.XElement.Parse(f).Descendants("value").Count()));
    }

    [Fact]
    public async Task Deletions_lists_every_target_record_missing_from_the_source()
    {
        await using var api = new MigrationApi(
            Accounts().Add(A, "Alpha"),
            Accounts().Add(A, "Alpha").Add(B, "Beta").Add(C, "Gamma"));

        var (status, body) = await api.PostAsync("/api/migration/deletions", new { entityLogicalName = "account" });

        Assert.Equal(200, status);
        AssertJson($$"""
            {"count":2,"sourceCount":1,"records":[{"id":"{{B}}","name":"Beta"},{"id":"{{C}}","name":"Gamma"}]}
            """, body);
    }

    [Fact]
    public async Task Run_needs_at_least_one_option()
    {
        await using var api = new MigrationApi(Accounts(), Accounts());

        var (status, body) = await api.PostAsync("/api/migration/run", Run(create: false, update: false));

        Assert.Equal(400, status);
        AssertJson("""{"error":"Choose Create, Update, or Delete."}""", body);
    }

    [Fact]
    public async Task Run_needs_a_confirmed_count_to_delete()
    {
        await using var api = new MigrationApi(Accounts(), Accounts());

        var (status, body) = await api.PostAsync("/api/migration/run", Run(delete: true));

        Assert.Equal(400, status);
        AssertJson("""{"error":"Confirm the records to delete before starting."}""", body);
    }

    [Fact]
    public async Task Run_creates_missing_records_and_updates_existing_ones()
    {
        var target = Accounts().Add(B, "Old name");
        await using var api = new MigrationApi(Accounts().Add(A, "Alpha").Add(B, "Beta").Add(C, "Gamma"), target);

        var job = await api.RunAsync(Run());

        AssertJson("""
            {"status":"completed","processed":3,"total":3,"succeeded":3,"created":2,"updated":1,
             "skipped":0,"deleted":0,"failed":0,"errors":[]}
            """, job);
        Assert.Equal(["Alpha", "Beta", "Gamma"], [.. new[] { A, B, C }.Select(id => target.Row(id)["name"])]);
    }

    [Fact]
    public async Task Run_skips_records_the_options_do_not_cover()
    {
        var target = Accounts().Add(B, "Old name");
        await using var api = new MigrationApi(Accounts().Add(A, "Alpha").Add(B, "Beta"), target);

        var job = await api.RunAsync(Run(update: false));

        AssertJson("""
            {"status":"completed","processed":2,"total":2,"succeeded":1,"created":1,"updated":0,
             "skipped":1,"deleted":0,"failed":0,"errors":[]}
            """, job);
        Assert.Equal("Old name", target.Row(B)["name"]);
    }

    [Fact]
    public async Task Run_creates_an_inactive_record_and_moves_it_to_its_state_in_one_transaction()
    {
        var source = Accounts().Add(A, "Alpha", ("statecode", new OptionSetValue(1)), ("statuscode", new OptionSetValue(2)));
        var target = Accounts();
        await using var api = new MigrationApi(source, target);

        var job = await api.RunAsync(Run(attributes: ["name", "statuscode"]));

        Assert.Equal(1, (int)job["created"]!);
        var write = Assert.IsType<ExecuteTransactionRequest>(Assert.Single(target.Writes));
        var create = Assert.IsType<CreateRequest>(write.Requests[0]);
        Assert.False(create.Target.Contains("statecode"));
        Assert.False(create.Target.Contains("statuscode"));
        Assert.Equal(1, target.Row(A).GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(2, target.Row(A).GetAttributeValue<OptionSetValue>("statuscode").Value);
    }

    [Fact]
    public async Task Run_records_a_rejected_record_and_carries_on()
    {
        var target = Accounts();
        target.FailingIds.Add(B);
        await using var api = new MigrationApi(Accounts().Add(A, "Alpha").Add(B, "Beta").Add(C, "Gamma"), target);

        var job = await api.RunAsync(Run());

        AssertJson($$"""
            {"status":"completed","processed":3,"total":3,"succeeded":2,"created":2,"updated":0,
             "skipped":0,"deleted":0,"failed":1,"errors":[{"recordId":"{{B}}","message":"Record rejected."}]}
            """, job);
        Assert.True(target.Has(A) && target.Has(C));
    }

    [Fact]
    public async Task Run_deletes_target_records_missing_from_the_source_after_sending_records()
    {
        var target = Accounts().Add(A, "Alpha").Add(D, "Delta");
        await using var api = new MigrationApi(Accounts().Add(A, "Alpha").Add(B, "Beta"), target);

        var job = await api.RunAsync(Run(update: false, delete: true, confirmedDeleteCount: 1));

        AssertJson("""
            {"status":"completed","processed":3,"total":3,"succeeded":1,"created":1,"updated":0,
             "skipped":1,"deleted":1,"failed":0,"errors":[]}
            """, job);
        Assert.Equal([A, B], target.Rows.Select(r => r.Id).OrderBy(id => id));
        Assert.IsType<CreateRequest>(target.Writes[0]);
        Assert.IsType<DeleteRequest>(target.Writes[1]);
    }

    [Fact]
    public async Task Run_deletes_nothing_when_more_records_would_go_than_were_confirmed()
    {
        var target = Accounts().Add(C).Add(D);
        await using var api = new MigrationApi(Accounts().Add(A), target);

        var job = await api.RunAsync(Run(create: false, update: false, delete: true, confirmedDeleteCount: 1));

        AssertJson("""
            {"status":"completed","processed":0,"total":0,"succeeded":0,"created":0,"updated":0,
             "skipped":0,"deleted":0,"failed":1,"errors":[{"recordId":"N/A","message":"2 target records would be deleted, more than the 1 you confirmed, so none were deleted. Open Preview to see the current list, then start again."}]}
            """, job);
        Assert.Equal(2, target.Rows.Count);
    }

    [Fact]
    public async Task Run_deletes_nothing_when_no_source_records_match()
    {
        var target = Accounts().Add(C);
        await using var api = new MigrationApi(Accounts(), target);

        var job = await api.RunAsync(Run(create: false, update: false, delete: true, confirmedDeleteCount: 5));

        Assert.Equal("completed", (string)job["status"]!);
        Assert.Equal(
            "No source records match, so the 1 target records that are not in the source were not deleted. Check the source connection and filter.",
            (string)job["errors"]![0]!["message"]!);
        Assert.True(target.Has(C));
    }

    [Fact]
    public async Task Run_fails_with_the_Dataverse_error_when_the_target_cannot_be_read()
    {
        var target = Accounts();
        target.FailEverything = new InvalidOperationException("Target unreachable.");
        await using var api = new MigrationApi(Accounts().Add(A), target);

        var job = await api.RunAsync(Run());

        AssertJson("""
            {"status":"failed","processed":0,"total":1,"succeeded":0,"created":0,"updated":0,
             "skipped":0,"deleted":0,"failed":0,"errors":[{"recordId":"N/A","message":"Target unreachable."}]}
            """, job);
    }

    [Fact]
    public async Task Run_that_fails_while_sending_records_deletes_nothing()
    {
        var source = Accounts().Add(A, "Alpha");
        source.FailRetrieveWhen = fetch => (string?)fetch.Attribute("count") == "100";
        var target = Accounts().Add(D, "Delta");
        await using var api = new MigrationApi(source, target);

        var job = await api.RunAsync(Run(delete: true, confirmedDeleteCount: 1));

        Assert.Equal("failed", (string)job["status"]!);
        Assert.True(target.Has(D));
        Assert.Empty(target.Writes);
    }

    [Fact]
    public async Task Run_sends_records_in_pages_of_100()
    {
        var source = Accounts().AddMany(250);
        var target = Accounts();
        await using var api = new MigrationApi(source, target);

        var job = await api.RunAsync(Run());

        Assert.Equal(250, (int)job["created"]!);
        Assert.Equal(250, target.Rows.Count);
        var pages = source.Fetches.Where(f => f.Contains("count=\"100\"")).ToList();
        Assert.Equal(3, pages.Count);
        Assert.Contains("page=\"3\"", pages[2]);
        Assert.Contains("paging-cookie=\"&lt;cookie page=&quot;2&quot; /&gt;\"", pages[2]);
    }

    [Fact]
    public async Task Run_carries_on_with_a_total_of_zero_when_the_count_fails()
    {
        var source = Accounts().Add(A, "Alpha");
        source.AggregateCountFails = true;
        source.FailRetrieveWhen = fetch => (string?)fetch.Attribute("count") == "5000";
        await using var api = new MigrationApi(source, Accounts());

        var job = await api.RunAsync(Run());

        AssertJson("""
            {"status":"completed","processed":1,"total":0,"succeeded":1,"created":1,"updated":0,
             "skipped":0,"deleted":0,"failed":0,"errors":[]}
            """, job);
    }

    private static object Run(
        bool create = true,
        bool update = true,
        bool delete = false,
        int? confirmedDeleteCount = null,
        string[]? attributes = null) => new
    {
        entityLogicalName = "account",
        attributes = attributes ?? ["name"],
        fetchXmlFilter = (string?)null,
        create,
        update,
        delete,
        confirmedDeleteCount,
    };
}
