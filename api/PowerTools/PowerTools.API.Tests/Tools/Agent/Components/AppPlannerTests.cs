using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Components.Apps;
using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Components;

public sealed class AppPlannerTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<AppApplySpec>(AppPlanner.Family, new AppPlanner());
    private readonly RowWorld world = new();
    private readonly Guid tableId = Guid.NewGuid();
    private readonly Entity mainForm;
    private readonly Entity role;

    public AppPlannerTests()
    {
        var table = world.Schema.AddTable("new_project", "Project", "Projects");
        SchemaWorld.Set(table, "MetadataId", tableId);
        mainForm = world.Add(new Entity("systemform") { ["name"] = "Information", ["objecttypecode"] = "new_project", ["type"] = new OptionSetValue(2) });
        world.Add(new Entity("savedquery") { ["name"] = "Active Projects", ["returnedtypecode"] = "new_project", ["querytype"] = 0 });
        role = world.Add(new Entity("role") { ["name"] = "Project manager" });
        world.Add(new Entity("webresource") { ["name"] = "new_/project.js", ["webresourcetype"] = new OptionSetValue(3) });
    }

    private static AppApplySpec Spec(List<AppCommand>? commands = null, string groupTitle = "Work") => new()
    {
        Solution = "Core",
        UniqueName = "new_Projects",
        Name = "Projects",
        Tables = [new AppTable { Table = "new_project", Forms = ["Information"], Views = ["Active Projects"] }],
        SiteMap = new AppSiteMap
        {
            Areas = [new SiteMapArea { Title = "Main", Groups = [new SiteMapGroup { Title = groupTitle, Subareas = [new SiteMapSubarea { Table = "new_project" }, new SiteMapSubarea { Dashboards = true }] }] }],
        },
        Roles = ["Project manager"],
        Commands = commands,
    };

    private Task<Plan> PlanAsync(AppApplySpec spec) => new AppPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity App => world.Table("appmodule").Single();

    [Fact]
    public async Task Creates_the_app_its_site_map_components_and_roles_then_validates_and_publishes()
    {
        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(["createApp", "createSiteMap", "addAppComponents", "addAppRole", "validateApp"], result.Steps.Select(s => s.Op));
        Assert.Equal(AppPlanner.DefaultIcon, App["webresourceid"]);
        var siteMap = world.Table("sitemap").Single();
        var xml = XElement.Parse((string)siteMap["sitemapxml"]);
        Assert.Equal("new_project", (string?)xml.Descendants("SubArea").First().Attribute("Entity"));
        Assert.Equal("Projects", (string?)xml.Descendants("SubArea").First().Descendants("Title").Single().Attribute("Title"));
        var components = world.Table("appmodulecomponent").Select(c => (Guid)c["objectid"]).ToList();
        Assert.Contains(tableId, components);
        Assert.Contains(mainForm.Id, components);
        Assert.Contains(siteMap.Id, components);
        Assert.Contains(("appmoduleroles_association", App.Id, role.Id), world.Links);
        var publish = world.Writes.OfType<PublishXmlRequest>().Single().ParameterXml;
        Assert.Contains($"<appmodule>{App.Id:D}</appmodule>", publish);
        Assert.Contains($"<sitemap>{siteMap.Id:D}</sitemap>", publish);
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task A_changed_site_map_is_one_update_and_the_app_is_validated_again()
    {
        await world.ApplyAsync(Family, Spec());

        var plan = await PlanAsync(Spec(groupTitle: "Projects"));

        Assert.Equal(["updateSiteMap", "validateApp"], plan.Steps.Select(s => s.Op));
    }

    [Fact]
    public async Task Validation_errors_stop_the_call_with_what_is_missing()
    {
        world.AppIssues.Add(new ValidationIssue { ErrorType = ErrorType.Error, DisplayName = "new_project", Message = "The table needs a main form." });

        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.PartlyApplied, result.Outcome);
        Assert.Contains("needs a main form", result.Message);
    }

    [Fact]
    public async Task Commands_are_created_online_and_unsupported_where_there_are_no_modern_commands()
    {
        var command = new AppCommand
        {
            UniqueName = "new_CloseProject", Label = "Close", Table = "new_project", Location = CommandLocation.Form,
            Library = "new_/project.js", Function = "Project.close", Parameters = "PrimaryControl",
        };

        var offline = await PlanAsync(Spec([command]));
        Assert.Contains(offline.Steps, s => s.Kind == PlanStepKind.Unsupported && s.Route!.Contains("solution_import"));

        world.Features.Add("appaction");
        await world.ApplyAsync(Family, Spec([command]));
        var action = world.Table("appaction").Single();
        Assert.Equal("Project.close", action["onclickeventjavascriptfunctionname"]);
        Assert.Equal(tableId, action.GetAttributeValue<EntityReference>("contextentity").Id);
        Assert.Equal(App.Id, action.GetAttributeValue<EntityReference>("appmoduleid").Id);
        Assert.Empty((await PlanAsync(Spec([command]))).Steps);
    }

    [Fact]
    public async Task A_missing_component_is_refused_before_anything_is_planned()
    {
        var spec = new AppApplySpec { Solution = "Core", UniqueName = "new_Projects", Name = "P", Tables = [new AppTable { Table = "new_project", Forms = ["Nope"] }] };

        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(spec));

        Assert.Contains("no form named 'Nope'", problem.Problem.Message);
    }

    [Fact]
    public void The_site_map_xml_is_the_same_for_the_same_spec()
    {
        var map = Spec().SiteMap!;
        Assert.Equal(SiteMapXmlBuilder.Build(map, 1033, _ => "Projects"), SiteMapXmlBuilder.Build(map, 1033, _ => "Projects"));
        Assert.Contains("Id=\"area_main\"", SiteMapXmlBuilder.Build(map, 1033, _ => "Projects"));
    }
}
