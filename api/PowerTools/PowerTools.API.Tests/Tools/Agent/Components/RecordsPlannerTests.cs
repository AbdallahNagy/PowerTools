using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Records;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class RecordsPlannerTests
{
    private readonly RowWorld world = new();

    private static readonly IApplyFamily Write = new ApplyFamily<RecordsWriteSpec>(
        RecordsWritePlanner.Family, new RecordsWritePlanner(), RecordsWritePlanner.ForVerification, idempotent: false);

    private static readonly IApplyFamily Delete = new ApplyFamily<RecordsDeleteSpec>(
        RecordsDeletePlanner.Family, new RecordsDeletePlanner(), RecordsDeletePlanner.ForVerification);

    public RecordsPlannerTests() => world.Schema.AddTable("account", "Account", "Accounts", primary: "name");

    private static Dictionary<string, JsonElement> Values(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    private Entity Account(string name) => world.Add(new Entity("account") { ["name"] = name, ["accountnumber"] = name.ToUpperInvariant() });

    // ── records_write ────────────────────────────────────────────────────────

    [Fact]
    public async Task Each_operation_is_one_step_that_shows_the_values_it_writes()
    {
        var existing = Account("Contoso");
        var spec = new RecordsWriteSpec
        {
            Operations =
            [
                new() { Op = RecordOp.Create, Table = "Account", Values = Values("""{"name":"Fabrikam"}""") },
                new() { Op = RecordOp.Update, Table = "account", Id = existing.Id.ToString(), Values = Values("""{"name":"Contoso Ltd"}""") },
            ],
        };

        var plan = await new RecordsWritePlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

        Assert.Equal(["create", "update"], plan.Steps.Select(s => s.Op));
        Assert.Equal("""{"name":"Fabrikam"}""", plan.Steps[0].Detail);
        Assert.Equal($"account {existing.Id}", plan.Steps[1].Target);
        Assert.Contains(Locks.RecordKey(existing.Id), plan.LockKeys);
    }

    [Fact]
    public async Task Apply_returns_the_ids_of_created_records_and_verifies_as_applied()
    {
        var result = await world.ApplyAsync(Write, new RecordsWriteSpec
        {
            Operations = [new() { Op = RecordOp.Create, Table = "account", Values = Values("""{"name":"Fabrikam","numberofemployees":12}""") }],
        });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var id = Assert.Single(Assert.Single(result.Steps).Ids!);
        var row = world.Row("account", Guid.Parse(id));
        Assert.Equal("Fabrikam", row["name"]);
        Assert.Equal(12, row["numberofemployees"]);
    }

    [Fact]
    public async Task A_partial_write_lists_only_the_operations_that_did_not_run_as_remaining()
    {
        var result = await world.ApplyAsync(Write, new RecordsWriteSpec
        {
            Operations =
            [
                new() { Op = RecordOp.Create, Table = "account", Values = Values("""{"name":"Fabrikam"}""") },
                new() { Op = RecordOp.Update, Table = "account", Id = Guid.NewGuid().ToString(), Values = Values("""{"name":"Gone"}""") },
                new() { Op = RecordOp.Create, Table = "account", Values = Values("""{"name":"Tailspin"}""") },
            ],
        });

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal([StepStatus.Done, StepStatus.Failed, StepStatus.NotRun], result.Steps.Select(s => s.Status));
        // The done create is not in remaining: sending it again would create a second Fabrikam.
        Assert.Equal(["update", "create"], result.Remaining.Steps.Select(s => s.Op));
        Assert.Contains(result.Warnings, w => w.Contains("Send only the operations listed in remaining"));
        Assert.Single(world.Table("account"));
    }

    [Fact]
    public async Task All_or_nothing_runs_one_transaction_and_returns_every_created_id()
    {
        var result = await world.ApplyAsync(Write, new RecordsWriteSpec
        {
            AllOrNothing = true,
            Operations =
            [
                new() { Op = RecordOp.Create, Table = "account", Values = Values("""{"name":"A"}""") },
                new() { Op = RecordOp.Create, Table = "account", Values = Values("""{"name":"B"}""") },
            ],
        });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        var step = Assert.Single(result.Steps);
        Assert.Equal("transaction", step.Op);
        Assert.Equal(2, step.Ids!.Count);
        Assert.Single(world.Writes.OfType<ExecuteTransactionRequest>());
    }

    [Fact]
    public async Task Upsert_by_key_updates_the_matching_record()
    {
        var existing = Account("Contoso");

        var result = await world.ApplyAsync(Write, new RecordsWriteSpec
        {
            Operations = [new() { Op = RecordOp.Upsert, Table = "account", Key = Values("""{"accountnumber":"CONTOSO"}"""), Values = Values("""{"name":"Renamed"}""") }],
        });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal("Renamed", world.Row("account", existing.Id)["name"]);
        Assert.Single(world.Table("account"));
    }

    [Fact]
    public async Task Associate_links_the_related_records()
    {
        var a = Account("A");
        var b = Account("B");

        await world.ApplyAsync(Write, new RecordsWriteSpec
        {
            Operations = [new() { Op = RecordOp.Associate, Table = "account", Id = a.Id.ToString(), Relationship = "new_account_account", Related = [new() { Table = "account", Id = b.Id.ToString() }] }],
        });

        Assert.Contains(("new_account_account", a.Id, b.Id), world.Links);
    }

    [Theory]
    [InlineData(RecordOp.Update, null)]
    [InlineData(RecordOp.Associate, "needs relationship")]
    public async Task An_incomplete_operation_is_refused_with_its_path(RecordOp op, string? expected)
    {
        var spec = new RecordsWriteSpec { Operations = [new() { Op = op, Table = "account", Id = Guid.NewGuid().ToString() }] };

        var error = await Assert.ThrowsAsync<AgentProblemException>(() => new RecordsWritePlanner().PlanAsync(spec, world.Context(), CancellationToken.None));

        Assert.Contains("operations[0]", error.Problem.Message);
        if (expected is not null) Assert.Contains(expected, error.Problem.Message);
    }

    [Fact]
    public async Task More_than_one_hundred_operations_are_refused()
    {
        var spec = new RecordsWriteSpec
        {
            Operations = Enumerable.Range(0, 101).Select(_ => new RecordOperation { Op = RecordOp.Create, Table = "account" }).ToList(),
        };

        await Assert.ThrowsAsync<AgentProblemException>(() => new RecordsWritePlanner().PlanAsync(spec, world.Context(), CancellationToken.None));
    }

    // ── records_delete ───────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_by_id_names_the_record_and_is_destructive()
    {
        var row = Account("Contoso");

        var plan = await new RecordsDeletePlanner().PlanAsync(
            new RecordsDeleteSpec { Records = [new() { Table = "account", Id = row.Id.ToString() }] }, world.Context(), CancellationToken.None);

        var step = Assert.Single(plan.Steps);
        Assert.Equal("delete", step.Op);
        Assert.Equal(PlanEffect.Destructive, step.Effect);
        Assert.Equal("Contoso", step.Detail);
    }

    [Fact]
    public async Task Delete_by_key_then_plan_again_is_empty()
    {
        Account("Contoso");
        var spec = new RecordsDeleteSpec { Records = [new() { Table = "account", Key = Values("""{"accountnumber":"CONTOSO"}""") }] };

        var result = await world.ApplyAsync(Delete, spec);
        var again = await new RecordsDeletePlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(world.Table("account"));
        Assert.Empty(again.Steps);
        Assert.Contains("does not exist", Assert.Single(again.Warnings));
    }

    [Fact]
    public async Task A_query_deletes_what_it_matches()
    {
        Account("Keep");
        var gone1 = Account("Old");
        var gone2 = world.Add(new Entity("account") { ["name"] = "Old" });

        var plan = await new RecordsDeletePlanner().PlanAsync(new RecordsDeleteSpec
        {
            Query = new() { FetchXml = """<fetch><entity name="account"><filter><condition attribute="name" operator="eq" value="Old"/></filter></entity></fetch>""", MaxCount = 5 },
        }, world.Context(), CancellationToken.None);

        Assert.Equal([gone1.Id, gone2.Id], plan.Steps.Select(s => ((DeleteRequest)s.Request!).Target.Id));
    }

    [Fact]
    public async Task A_query_that_matches_more_than_max_count_is_blocked()
    {
        for (var i = 0; i < 3; i++) Account($"A{i}");

        var plan = await new RecordsDeletePlanner().PlanAsync(new RecordsDeleteSpec
        {
            Query = new() { FetchXml = """<fetch><entity name="account"/></fetch>""", MaxCount = 2 },
        }, world.Context(), CancellationToken.None);

        var step = Assert.Single(plan.Steps);
        Assert.Equal(PlanStepKind.Blocked, step.Kind);
        Assert.Contains("maxCount (2)", step.Reason);
    }

    [Fact]
    public async Task Disassociate_removes_the_link_and_keeps_both_records()
    {
        var a = Account("A");
        var b = Account("B");
        world.Links.Add(("new_account_account", a.Id, b.Id));

        var result = await world.ApplyAsync(Delete, new RecordsDeleteSpec
        {
            Disassociate = [new() { Table = "account", Id = a.Id.ToString(), Relationship = "new_account_account", Related = [new() { Table = "account", Id = b.Id.ToString() }] }],
        });

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Empty(world.Links);
        Assert.Equal(2, world.Table("account").Count);
        Assert.Equal(PlanEffect.Destructive, (await new RecordsDeletePlanner().PlanAsync(new RecordsDeleteSpec
        {
            Disassociate = [new() { Table = "account", Id = a.Id.ToString(), Relationship = "x", Related = [new() { Table = "account", Id = b.Id.ToString() }] }],
        }, world.Context(), CancellationToken.None)).Steps[0].Effect);
    }
}
