using System.Text.Json;
using Microsoft.Crm.Sdk.Messages;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Kernel;

public sealed class PlanTests
{
    private static PlanStep Step(string target, PlanEffect effect = PlanEffect.Change) =>
        new() { Op = "createColumn", Target = target, Effect = effect };

    [Fact]
    public void Same_steps_give_the_same_hash()
    {
        Assert.Equal(new Plan([Step("a"), Step("b")]).Hash, new Plan([Step("a"), Step("b")]).Hash);
    }

    [Fact]
    public void Hash_changes_with_the_steps_their_order_and_the_state_token()
    {
        var baseline = new Plan([Step("a"), Step("b")]).Hash;

        Assert.NotEqual(baseline, new Plan([Step("b"), Step("a")]).Hash);
        Assert.NotEqual(baseline, new Plan([Step("a"), Step("b", PlanEffect.Destructive)]).Hash);
        Assert.NotEqual(baseline, new Plan([Step("a"), Step("b")], stateToken: "v2").Hash);
    }

    [Fact]
    public void Effect_is_the_strongest_step_that_would_run()
    {
        Assert.Equal(PlanEffect.Read, Plan.Empty.Effect);
        Assert.Equal(PlanEffect.Change, new Plan([Step("a")]).Effect);
        Assert.Equal(PlanEffect.Destructive, new Plan([Step("a"), Step("b", PlanEffect.Destructive)]).Effect);
    }

    [Fact]
    public void Unsupported_steps_do_not_raise_the_effect()
    {
        var plan = new Plan([PlanStep.Unsupported("createColumn", "con_file", "File columns are online only.")]);

        Assert.Equal(PlanEffect.Read, plan.Effect);
    }

    [Fact]
    public void Preview_serializes_effects_and_kinds_as_lowercase_text_and_never_the_request()
    {
        var plan = new Plan([
            new PlanStep { Op = "publish", Target = "account", Request = new PublishAllXmlRequest() },
            PlanStep.Unsupported("createCommand", "save", "Modern commands are online only.", "solution_import"),
        ]);

        var json = JsonSerializer.Serialize(plan.ToPreview(), JsonSerializerOptions.Web);

        Assert.Contains("\"effect\":\"change\"", json);
        Assert.Contains("\"kind\":\"unsupported\"", json);
        Assert.Contains("\"route\":\"solution_import\"", json);
        Assert.DoesNotContain("PublishAllXml", json);
        Assert.Contains($"\"hash\":\"{plan.Hash}\"", json);
    }
}
