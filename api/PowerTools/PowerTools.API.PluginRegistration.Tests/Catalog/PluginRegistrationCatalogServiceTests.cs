using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Catalog;

public sealed class PluginRegistrationCatalogServiceTests
{
    [Fact]
    public async Task AssembleCatalog_nests_complete_out_of_order_rows_and_drops_orphans()
    {
        var alphaAssemblyId = Guid.NewGuid();
        var zuluAssemblyId = Guid.NewGuid();
        var pluginId = Guid.NewGuid();
        var workflowId = Guid.NewGuid();
        var stepId = Guid.NewGuid();
        var imageId = Guid.NewGuid();
        var orphanId = Guid.NewGuid();
        var firstPage = new PluginRegistrationRows(
            Assemblies:
            [
                Assembly(zuluAssemblyId, "Zulu Assembly")
            ],
            Types:
            [
                Type(workflowId, alphaAssemblyId, "Zulu.Workflow", true, "Workflow Group"),
                Type(orphanId, Guid.NewGuid(), "Orphan.Type")
            ],
            Steps:
            [
                Step(Guid.NewGuid(), workflowId, "Workflow orphan step", false),
                Step(orphanId, Guid.NewGuid(), "Orphan step", false)
            ],
            Images:
            [
                Image(Guid.NewGuid(), Guid.NewGuid(), "Orphan image")
            ]);
        var secondPage = new PluginRegistrationRows(
            [Assembly(alphaAssemblyId, "alpha Assembly")],
            [Type(pluginId, alphaAssemblyId, "Alpha.Plugin")],
            [Step(stepId, pluginId, "Create account", true)],
            [Image(imageId, stepId, "Pre Image")]);
        var gateway = new FakePluginRegistrationGateway(firstPage, secondPage);

        var catalog = await new PluginRegistrationCatalogService()
            .RetrieveCatalogAsync(gateway, CancellationToken.None);

        Assert.Equal(["alpha Assembly", "Zulu Assembly"],
            catalog.Assemblies.Select(assembly => assembly.Name));
        var alphaAssembly = catalog.Assemblies[0];
        Assert.Equal("Core Solution", alphaAssembly.SolutionDisplayName);
        Assert.Equal(["Alpha.Plugin", "Zulu.Workflow"],
            alphaAssembly.Handlers.Select(handler => handler.TypeName));
        var plugin = alphaAssembly.Handlers[0];
        Assert.Equal(HandlerKind.Plugin, plugin.Kind);
        Assert.Equal(pluginId, plugin.Id);
        Assert.Equal("Core Solution", plugin.SolutionDisplayName);
        var step = Assert.Single(plugin.Steps);
        Assert.Equal(stepId, step.Id);
        Assert.Equal("Core Solution", step.SolutionDisplayName);
        Assert.True(step.SecureConfigExists);
        Assert.DoesNotContain(
            step.GetType().GetProperties(),
            property => property.Name.Contains("SecureConfig", StringComparison.OrdinalIgnoreCase)
                && property.Name != nameof(PluginStepDto.SecureConfigExists));
        var image = Assert.Single(step.Images);
        Assert.Equal(imageId, image.Id);
        Assert.Equal("Core Solution", image.SolutionDisplayName);

        var workflow = alphaAssembly.Handlers[1];
        Assert.Equal(HandlerKind.WorkflowActivity, workflow.Kind);
        Assert.Equal("Workflow Group", workflow.WorkflowActivityGroupName);
        Assert.Empty(workflow.Steps);
        Assert.Equal(1, gateway.CallCount);
    }

    [Fact]
    public async Task AssembleCatalog_uses_stable_case_insensitive_alphabetical_ordering_at_each_level()
    {
        var assemblyId = Guid.NewGuid();
        var pluginId = Guid.NewGuid();
        var firstStepId = Guid.NewGuid();
        var secondStepId = Guid.NewGuid();
        var gateway = new FakePluginRegistrationGateway(new PluginRegistrationRows(
            [Assembly(assemblyId, "Assembly")],
            [Type(pluginId, assemblyId, "Plugin")],
            [
                Step(secondStepId, pluginId, "zeta", false),
                Step(firstStepId, pluginId, "Alpha", false)
            ],
            [
                Image(Guid.NewGuid(), firstStepId, "z image"),
                Image(Guid.NewGuid(), firstStepId, "Alpha image")
            ]));

        var catalog = await new PluginRegistrationCatalogService()
            .RetrieveCatalogAsync(gateway, CancellationToken.None);

        var steps = catalog.Assemblies[0].Handlers[0].Steps;
        Assert.Equal(["Alpha", "zeta"], steps.Select(step => step.Name));
        Assert.Equal(["Alpha image", "z image"], steps[0].Images.Select(image => image.Name));
    }

    private static PluginAssemblyRow Assembly(Guid id, string name) =>
        new(id, name, "1.0.0.0", "neutral", "token", 0, 2, false, true, 1,
            SolutionDisplayName: "Core Solution");

    private static PluginTypeRow Type(
        Guid id,
        Guid assemblyId,
        string typeName,
        bool isWorkflowActivity = false,
        string? workflowGroup = null) =>
        new(id, assemblyId, typeName, typeName, null, null, workflowGroup,
            isWorkflowActivity, false, true, 1, "Core Solution");

    private static PluginStepRow Step(
        Guid id,
        Guid pluginTypeId,
        string name,
        bool secureConfigExists) =>
        new(id, pluginTypeId, name, null, "Create", "account", null,
            "PreOperation", "Synchronous", 20, 0, 1, true, false, true, 1,
            secureConfigExists, "Core Solution");

    private static PluginImageRow Image(Guid id, Guid stepId, string name) =>
        new(id, stepId, name, null, "PreImage", "target", ["name", "emailaddress1"],
            false, true, 1, "Core Solution");
}
