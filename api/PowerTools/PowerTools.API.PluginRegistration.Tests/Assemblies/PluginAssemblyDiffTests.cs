using Microsoft.AspNetCore.Hosting;
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
    }

    private sealed class PluginRegistrationApplicationFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("port", "0");
            builder.UseSetting("secret", "test-secret");
        }
    }

    private static AssemblyInspectionDto Inspection() => new("Contoso.dll", 1, "hash",
        new AssemblyIdentityInspectionDto("Contoso", "2.0.0.0", "neutral", "token"),
        ".NETFramework,Version=v4.6.2", "v4.0.30319", [], [], []);
}
