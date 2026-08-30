using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Assemblies;

public sealed class PluginAssemblyDiffTests
{
    [Fact]
    public void Removing_an_unreferenced_childless_workflow_activity_is_allowed()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso", "1.0.0.0", "neutral",
            "token", 0, 2, false, true, 1, null);
        var activity = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Workflow", "Workflow",
            null, null, null, true, false, true, 2, null);

        var impact = PluginAssemblyDiff.Compare(assembly, [activity], [], [], Inspection());

        Assert.DoesNotContain(impact.Blockers,
            blocker => blocker.Code == "assembly_removed_workflow_activity");
    }

    [Fact]
    public void Removing_a_plugin_with_owned_step_and_image_is_blocked()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso", "1.0.0.0", "neutral",
            "token", 0, 2, false, true, 1, null);
        var plugin = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugin", "Plugin",
            null, null, null, false, false, true, 2, null);
        var step = new PluginStepRow(Guid.NewGuid(), plugin.Id, "Step", null, "Update", null, null,
            "Post", "Sync", 40, 0, 1, true, false, true, 3, false, null);
        var image = new PluginImageRow(Guid.NewGuid(), step.Id, "Image", null, "Post", null, [],
            false, true, 4, null);

        var impact = PluginAssemblyDiff.Compare(assembly, [plugin], [step], [image], Inspection());

        Assert.Contains(impact.Blockers,
            blocker => blocker.Code == "assembly_removed_handler_has_owned_records");
    }

    [Fact]
    public void Removing_a_plugin_with_an_external_or_custom_api_dependency_is_blocked()
    {
        var assembly = Assembly();
        var plugin = Type(assembly.Id, "Contoso.Plugin", false);
        var dependency = new PluginHandlerDependencyRow(plugin.Id, "Submit Account", "Custom API", true, true);

        var impact = PluginAssemblyDiff.Compare(assembly, [plugin], [], [], Inspection(), [dependency], [], true);

        Assert.Contains(impact.Blockers, blocker => blocker.Code == "assembly_removed_handler_has_dependency");
        Assert.Contains("Custom API: Submit Account", impact.Dependencies);
    }

    [Fact]
    public void Removing_a_referenced_workflow_activity_is_blocked_but_childless_unreferenced_removal_is_allowed()
    {
        var assembly = Assembly();
        var activity = Type(assembly.Id, "Contoso.Workflow", true);
        var dependency = new PluginHandlerDependencyRow(activity.Id, "Account flow", "Workflow", false, false);

        var blocked = PluginAssemblyDiff.Compare(assembly, [activity], [], [], Inspection(), [dependency], [], true);
        var allowed = PluginAssemblyDiff.Compare(assembly, [activity], [], [], Inspection(), [], [], true);

        Assert.Contains(blocked.Blockers, blocker => blocker.Code == "assembly_removed_workflow_activity");
        Assert.DoesNotContain(allowed.Blockers, blocker => blocker.Code == "assembly_removed_workflow_activity");
    }

    [Fact]
    public void Breaking_referenced_workflow_argument_contract_is_blocked()
    {
        var assembly = Assembly();
        var activity = Type(assembly.Id, "Contoso.Workflow", true);
        var oldArgument = new PluginWorkflowArgumentRow(activity.Id, "Account", "Microsoft.Xrm.Sdk.EntityReference", WorkflowArgumentDirection.Input, true, "account");
        var dependency = new PluginHandlerDependencyRow(activity.Id, "Account flow", "Workflow", false, false);
        var inspection = Inspection([new WorkflowActivityInspectionDto("Contoso.Workflow", [
            new WorkflowArgumentInspectionDto("Account", "Account", "System.String", WorkflowArgumentDirection.Input, true, null)
        ])]);

        var impact = PluginAssemblyDiff.Compare(assembly, [activity], [], [], inspection, [dependency], [oldArgument], true);

        Assert.Contains(impact.Blockers, blocker => blocker.Code == "assembly_workflow_contract_breaking");
        Assert.Contains(impact.WorkflowContractDifferences, difference => difference.ArgumentName == "Account" && difference.IsBreaking);
    }
    [Fact]
    public void Application_maps_assembly_register_and_update_preflight_endpoints()
    {
        using var factory = new PluginRegistrationApplicationFactory();
        _ = factory.Server;

        var routes = factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => endpoint.RoutePattern.RawText)
            .ToHashSet(StringComparer.Ordinal);

        Assert.Contains("/api/plugin-registration/assemblies/register/preflight", routes);
        Assert.Contains("/api/plugin-registration/assemblies/{assemblyId:guid}/update/preflight", routes);
        var mutationEndpoints = factory.Services.GetServices<EndpointDataSource>().SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>().Where(endpoint => endpoint.RoutePattern.RawText?.Contains("/assemblies/") == true
                && endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("POST") == true).ToArray();
        Assert.All(mutationEndpoints, endpoint => Assert.NotNull(endpoint.Metadata.GetMetadata<RequestSizeLimitAttribute>()));
        Assert.All(mutationEndpoints, endpoint => Assert.NotNull(endpoint.Metadata.GetMetadata<RequestFormLimitsAttribute>()));
        Assert.All(mutationEndpoints, endpoint => Assert.Equal(
            (int)PluginAssemblyInspector.MaxAssemblyBytes,
            endpoint.Metadata.GetMetadata<RequestFormLimitsAttribute>()!.MemoryBufferThreshold));
    }

    private sealed class PluginRegistrationApplicationFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("port", "0");
            builder.UseSetting("secret", "test-secret");
        }
    }

    private static PluginAssemblyRow Assembly() => new(Guid.NewGuid(), "Contoso", "1.0.0.0", "neutral", "token", 0, 2, false, true, 1, null);
    private static PluginTypeRow Type(Guid assemblyId, string typeName, bool workflow) => new(Guid.NewGuid(), assemblyId, typeName, typeName, null, null, null, workflow, false, true, 2, null);
    private static AssemblyInspectionDto Inspection(IReadOnlyList<WorkflowActivityInspectionDto>? workflowActivities = null) => new("Contoso.dll", 1, "hash",
        new AssemblyIdentityInspectionDto("Contoso", "2.0.0.0", "neutral", "token"),
        ".NETFramework,Version=v4.6.2", "v4.0.30319", [], [], workflowActivities ?? []);
}
