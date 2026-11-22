using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.WebResources;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class WebResourcePlannerTests : IDisposable
{
    private static readonly IApplyFamily Family = new ApplyFamily<WebResourceApplySpec>(WebResourcePlanner.Family, new WebResourcePlanner());
    private readonly RowWorld world = new();
    private readonly string folder = Directory.CreateTempSubdirectory("webresources").FullName;

    public void Dispose() => Directory.Delete(folder, recursive: true);

    private string File(string relative, string content)
    {
        var path = Path.Combine(folder, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        System.IO.File.WriteAllText(path, content);
        return path;
    }

    private Task<Plan> PlanAsync(WebResourceApplySpec spec) => new WebResourcePlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Row(string name) => world.Table("webresource").Single(r => (string)r["name"] == name);

    [Fact]
    public async Task A_folder_becomes_web_resources_named_from_the_prefix_and_path_and_a_second_run_plans_nothing()
    {
        File("form.js", "function onLoad() {}");
        File("css/site.css", "body { }");
        File("readme.md", "not a web resource");
        var spec = new WebResourceApplySpec { Solution = "Core", Folder = folder };

        var result = await world.ApplyAsync(Family, spec);

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["new_/css/site.css", "new_/form.js"], world.Table("webresource").Select(r => (string)r["name"]).Order());
        Assert.Equal(3, Row("new_/form.js").GetAttributeValue<OptionSetValue>("webresourcetype").Value);
        Assert.Equal(2, Row("new_/css/site.css").GetAttributeValue<OptionSetValue>("webresourcetype").Value);
        Assert.Equal(Convert.ToBase64String("function onLoad() {}"u8.ToArray()), Row("new_/form.js")["content"]);
        Assert.All(world.Writes.OfType<Microsoft.Xrm.Sdk.Messages.CreateRequest>(), r => Assert.Equal("Core", r.Parameters["SolutionUniqueName"]));
        Assert.Contains(world.Writes.OfType<PublishXmlRequest>(), p => p.ParameterXml.Contains($"<webresource>{Row("new_/form.js").Id:D}</webresource>"));
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Changed_content_is_an_update_that_adds_the_web_resource_to_the_solution()
    {
        var path = File("form.js", "v1");
        var spec = new WebResourceApplySpec { Solution = "Core", Files = [new WebResourceFile { Path = path, Name = "new_/project/form.js", DisplayName = "Project form" }] };
        await world.ApplyAsync(Family, spec);
        System.IO.File.WriteAllText(path, "v2");

        var plan = await PlanAsync(spec);

        var step = Assert.Single(plan.Steps);
        Assert.Equal("updateWebResource", step.Op);
        Assert.StartsWith("content → js", step.Detail);
        await world.ApplyAsync(Family, spec);
        Assert.Equal(Convert.ToBase64String("v2"u8.ToArray()), Row("new_/project/form.js")["content"]);
        Assert.Contains(world.Writes.OfType<AddSolutionComponentRequest>(), r => r.ComponentId == Row("new_/project/form.js").Id && r.ComponentType == 61);
    }

    [Fact]
    public async Task A_type_change_is_blocked_and_a_name_without_the_prefix_is_refused()
    {
        world.Add(new Entity("webresource") { ["name"] = "new_/logo.png", ["webresourcetype"] = new OptionSetValue(5), ["content"] = "" });
        var svg = File("logo.svg", "<svg/>");

        var plan = await PlanAsync(new WebResourceApplySpec { Solution = "Core", Files = [new WebResourceFile { Path = svg, Name = "new_/logo.png" }] });

        Assert.Equal(PlanStepKind.Blocked, Assert.Single(plan.Steps).Kind);
        var refused = await Assert.ThrowsAsync<AgentProblemException>(() =>
            PlanAsync(new WebResourceApplySpec { Solution = "Core", Files = [new WebResourceFile { Path = svg, Name = "other_/logo.svg" }] }));
        Assert.Contains("new_", refused.Problem.Message);
    }

    [Theory]
    [InlineData("a.html", 1)]
    [InlineData("a.xml", 4)]
    [InlineData("a.jpeg", 6)]
    [InlineData("a.svg", 11)]
    [InlineData("a.resx", 12)]
    public void The_type_comes_from_the_extension(string file, int type) => Assert.Equal(type, WebResourcePlanner.TypeOf(file));
}
