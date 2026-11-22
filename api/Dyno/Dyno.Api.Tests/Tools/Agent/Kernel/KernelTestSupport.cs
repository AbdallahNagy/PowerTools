using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tests.Tools.Agent.Kernel;

/// <summary>A spec for the test family: the names that must exist.</summary>
public sealed class ItemsSpec : IApplySpec
{
    public string? Solution { get; init; } = "Core";

    public List<string> Items { get; init; } = [];

    /// <summary>Items planned as needing a feature this environment lacks.</summary>
    public List<string> Unsupported { get; init; } = [];

    /// <summary>Items planned with a destructive step.</summary>
    public List<string> Destructive { get; init; } = [];
}

/// <summary>
/// A tiny component family over an in-memory world. Creating an item runs a request through the fake client, so the
/// executor's SolutionUniqueName, retries and failures are exercised as a real family would.
/// </summary>
public sealed class ItemsPlanner(HashSet<string> world) : IComponentPlanner<ItemsSpec>
{
    public int Plans { get; private set; }

    public Task<Plan> PlanAsync(ItemsSpec spec, PlanContext context, CancellationToken ct)
    {
        Plans++;
        var steps = new List<PlanStep>();
        foreach (var item in spec.Items.Where(item => !world.Contains(item)))
        {
            if (spec.Unsupported.Contains(item))
            {
                steps.Add(PlanStep.Unsupported("createItem", item, "Items need a newer version.", "Use solution_import."));
                continue;
            }

            steps.Add(new PlanStep
            {
                Op = "createItem",
                Target = item,
                Effect = spec.Destructive.Contains(item) ? PlanEffect.Destructive : PlanEffect.Change,
                Request = new OrganizationRequest("CreateItem") { ["Name"] = item },
                Publishes = [new PublishTarget(PublishKind.Entity, item)],
            });
        }

        return Task.FromResult(new Plan(steps, lockKeys: spec.Items.Select(i => $"item:{i}").ToList()));
    }
}

internal static class KernelFakes
{
    /// <summary>A client whose CreateItem request adds to <paramref name="world"/>, unless <paramref name="fail"/> says otherwise.</summary>
    public static FakeAgentClient Client(HashSet<string> world, Func<string, Exception?>? fail = null)
    {
        var client = Data.Client();
        client.OnExecute = request =>
        {
            switch (request)
            {
                case RetrieveVersionRequest:
                    return new RetrieveVersionResponse { Results = new ParameterCollection { ["Version"] = "9.2.25010.100" } };
                case RetrieveEntityRequest entity when entity.LogicalName is "customapi" or "environmentvariabledefinition":
                    return new RetrieveEntityResponse();
                case RetrieveEntityRequest:
                    throw FakeAgentClient.Fault(unchecked((int)0x80040217), "Could not find entity");
            }

            if (request.RequestName == "CreateItem")
            {
                var name = (string)request["Name"];
                if (fail?.Invoke(name) is { } error) throw error;
                lock (world) world.Add(name);
            }

            return new OrganizationResponse();
        };
        return client;
    }

    public static Capabilities Capabilities() => new("9.2", new HashSet<string>(), ExportSolutionAsync: false);

    public static RetryPolicy NoWaitRetry() => new((_, _) => Task.CompletedTask);

    public static ApplyKernel Kernel(IAgentClient client, ItemsPlanner planner, TimeSpan? lockTimeout = null) =>
        new(
            new ApplyFamily<ItemsSpec>("items", planner),
            () => new PlanContext(client, Capabilities(), "https://example.crm.dynamics.com"),
            new KernelOptions(lockTimeout ?? TimeSpan.FromSeconds(5), NoWaitRetry()));
}
