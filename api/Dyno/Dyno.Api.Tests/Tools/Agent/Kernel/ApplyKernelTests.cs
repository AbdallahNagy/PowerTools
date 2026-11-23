using System.ServiceModel;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Kernel;

public sealed class ApplyKernelTests
{
    private readonly HashSet<string> world = [];

    private static ItemsSpec Spec(params string[] items) => new() { Items = [.. items] };

    private async Task<(ApplyResult Result, FakeAgentClient Client)> PlanAndApply(ItemsSpec spec, Func<string, Exception?>? fail = null)
    {
        var client = KernelFakes.Client(world, fail);
        var kernel = KernelFakes.Kernel(client, new ItemsPlanner(world));
        var preview = await kernel.PlanAsync(spec, CancellationToken.None);
        return (await kernel.ApplyAsync(spec, preview.Hash, CancellationToken.None), client);
    }

    [Fact]
    public async Task Applies_every_step_publishes_once_and_verifies_an_empty_plan()
    {
        var (result, client) = await PlanAndApply(Spec("a", "b"));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.All(result.Steps, step => Assert.Equal(StepStatus.Done, step.Status));
        Assert.Equal(["a", "b"], result.Published);
        Assert.Empty(result.Remaining.Steps);
        var publish = Assert.Single(client.Executed.OfType<PublishXmlRequest>());
        Assert.Equal("<importexportxml><entities><entity>a</entity><entity>b</entity></entities></importexportxml>", publish.ParameterXml);
    }

    [Fact]
    public async Task Every_request_carries_the_solution()
    {
        var (_, client) = await PlanAndApply(Spec("a"));

        var create = Assert.Single(client.Executed, r => r.RequestName == "CreateItem");
        Assert.Equal("Core", create["SolutionUniqueName"]);
    }

    [Fact]
    public async Task A_second_apply_of_the_same_spec_is_unchanged_and_sends_nothing()
    {
        await PlanAndApply(Spec("a"));
        var (again, client) = await PlanAndApply(Spec("a"));

        Assert.Equal(ApplyOutcome.Unchanged, again.Outcome);
        Assert.DoesNotContain(client.Executed, r => r.RequestName is "CreateItem" or "PublishXml");
    }

    [Fact]
    public async Task A_failure_halfway_is_partly_applied_with_the_rest_remaining_and_a_retry_finishes()
    {
        var broken = true;
        var (result, _) = await PlanAndApply(
            Spec("a", "b", "c"),
            name => broken && name == "b" ? FakeAgentClient.Fault(-2147220891, "b is invalid") : null);

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal([StepStatus.Done, StepStatus.Failed, StepStatus.NotRun], result.Steps.Select(s => s.Status));
        Assert.Contains("b is invalid", result.Steps[1].Error);
        Assert.Equal(["a"], result.Published);
        Assert.Equal(["b", "c"], result.Remaining.Steps.Select(s => s.Target));

        broken = false;
        var (retry, client) = await PlanAndApply(Spec("a", "b", "c"));

        Assert.Equal(ApplyOutcome.Applied, retry.Outcome);
        Assert.Equal(["b", "c"], retry.Steps.Select(s => s.Target));
        Assert.DoesNotContain(client.Executed, r => r.RequestName == "CreateItem" && (string)r["Name"] == "a");
    }

    [Fact]
    public async Task A_failure_on_the_first_step_is_failed()
    {
        var (result, client) = await PlanAndApply(Spec("a", "b"), _ => FakeAgentClient.Fault(-2147220891, "no"));

        Assert.Equal(ApplyOutcome.Failed, result.Outcome);
        Assert.Equal("DataverseFault", result.Code);
        Assert.DoesNotContain(client.Executed, r => r is PublishXmlRequest);
    }

    [Fact]
    public async Task An_unsupported_step_stops_the_run_with_NotSupported_and_names_the_route()
    {
        var spec = new ItemsSpec { Items = ["a", "file", "b"], Unsupported = ["file"] };

        var (result, _) = await PlanAndApply(spec);

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal("NotSupported", result.Code);
        Assert.Equal([StepStatus.Done, StepStatus.Unsupported, StepStatus.NotRun], result.Steps.Select(s => s.Status));
        Assert.Contains("solution_import", result.Message);
    }

    [Fact]
    public async Task A_changed_environment_after_approval_refuses_and_changes_nothing()
    {
        var client = KernelFakes.Client(world);
        var kernel = KernelFakes.Kernel(client, new ItemsPlanner(world));
        var preview = await kernel.PlanAsync(Spec("a", "b"), CancellationToken.None);
        world.Add("a"); // someone else created it in the maker portal

        var result = await kernel.ApplyAsync(Spec("a", "b"), preview.Hash, CancellationToken.None);

        Assert.Equal(ApplyOutcome.Refused, result.Outcome);
        Assert.Equal(ApplyResult.PlanChangedCode, result.Code);
        Assert.Equal(["b"], result.Remaining.Steps.Select(s => s.Target));
        Assert.DoesNotContain(client.Executed, r => r.RequestName == "CreateItem");
    }

    [Fact]
    public async Task A_lock_held_too_long_refuses()
    {
        var client = KernelFakes.Client(world);
        var kernel = KernelFakes.Kernel(client, new ItemsPlanner(world), TimeSpan.FromMilliseconds(50));
        var name = $"locked-{Guid.NewGuid()}";
        var preview = await kernel.PlanAsync(Spec(name), CancellationToken.None);

        using (await Locks.HoldAsync($"item:{name}", CancellationToken.None))
        {
            var result = await kernel.ApplyAsync(Spec(name), preview.Hash, CancellationToken.None);
            Assert.Equal(ApplyOutcome.Refused, result.Outcome);
            Assert.Equal(ApplyResult.LockTimeoutCode, result.Code);
        }
    }

    [Fact]
    public async Task Two_calls_on_the_same_component_serialize_and_the_second_is_refused_not_duplicated()
    {
        var gate = new TaskCompletionSource();
        var entered = new TaskCompletionSource();
        var client = KernelFakes.Client(world);
        var inner = client.OnExecute;
        client.OnExecute = request =>
        {
            if (request.RequestName == "CreateItem")
            {
                entered.TrySetResult();
                gate.Task.Wait();
            }

            return inner(request);
        };
        var name = $"shared-{Guid.NewGuid()}";
        var kernel = KernelFakes.Kernel(client, new ItemsPlanner(world));
        var hash = (await kernel.PlanAsync(Spec(name), CancellationToken.None)).Hash;

        var first = Task.Run(() => kernel.ApplyAsync(Spec(name), hash, CancellationToken.None));
        await entered.Task;
        var second = Task.Run(() => kernel.ApplyAsync(Spec(name), hash, CancellationToken.None));
        await Task.Delay(50);
        Assert.False(second.IsCompleted);
        gate.SetResult();

        Assert.Equal(ApplyOutcome.Applied, (await first).Outcome);
        Assert.Equal(ApplyOutcome.Refused, (await second).Outcome);
        Assert.Single(client.Executed, r => r.RequestName == "CreateItem");
    }

    [Fact]
    public async Task Throttled_steps_are_retried_without_failing_the_call()
    {
        var throttled = 0;
        var (result, _) = await PlanAndApply(Spec("a"), _ =>
            throttled++ == 0
                ? new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147015902 }, "throttled")
                : null);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
    }

    [Fact]
    public void Verification_that_still_finds_steps_is_partly_applied()
    {
        var plan = new Plan([new PlanStep { Op = "createItem", Target = "a" }]);
        var execution = new Execution([new StepResult("createItem", "a", StepStatus.Done)], ["a"], [], null, null);

        var result = ApplyKernel.Combine(plan, execution, plan);

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Equal("VerificationFailed", result.Code);
        Assert.Single(result.Remaining.Steps);
    }

    [Fact]
    public async Task A_publish_that_fails_is_reported_as_a_warning_and_partly_applied()
    {
        var client = KernelFakes.Client(world);
        var inner = client.OnExecute;
        client.OnExecute = request => request is PublishXmlRequest ? throw FakeAgentClient.Fault(-2147220891, "publish broke") : inner(request);
        var kernel = KernelFakes.Kernel(client, new ItemsPlanner(world));
        var hash = (await kernel.PlanAsync(Spec("a"), CancellationToken.None)).Hash;

        var result = await kernel.ApplyAsync(Spec("a"), hash, CancellationToken.None);

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Empty(result.Published);
        Assert.Contains(result.Warnings, w => w.Contains("not published"));
    }
}
