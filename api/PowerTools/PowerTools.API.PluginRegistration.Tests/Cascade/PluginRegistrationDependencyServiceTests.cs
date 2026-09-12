using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Cascade;

public sealed class PluginRegistrationDependencyServiceTests
{
    [Fact]
    public void Ownership_is_resolved_by_parent_ids_and_never_by_matching_names()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Shared", "1", null, null, 0, 2, false, true, 1, null);
        var plugin = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugin", "Shared", null, null, null, false, false, true, 2, null);
        var unrelated = new PluginTypeRow(Guid.NewGuid(), Guid.NewGuid(), "Other.Plugin", "Shared", null, null, null, false, false, true, 3, null);
        var ownedStep = new PluginStepRow(Guid.NewGuid(), plugin.Id, "Owned", null, "Update", "account", null, "Pre", "Sync", 20, 0, 1, true, false, true, 4, false, null);
        var unrelatedStep = new PluginStepRow(Guid.NewGuid(), unrelated.Id, "Same name", null, "Update", "account", null, "Pre", "Sync", 20, 0, 1, true, false, true, 5, false, null);
        var rows = new PluginRegistrationRows([assembly], [plugin, unrelated], [ownedStep, unrelatedStep], []);

        var snapshot = new PluginRegistrationDependencyService().Build(rows, new(CascadeTargetKind.Plugin, plugin.Id,
            new Dictionary<Guid, long>()));

        Assert.Single(snapshot.Steps);
        Assert.Equal(ownedStep.Id, snapshot.Steps[0].Id);
    }

    [Fact]
    public void Explicitly_external_dependency_is_a_blocker_even_when_its_id_matches_an_owned_record()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso", "1", null, null, 0, 2, false, true, 1, null);
        var plugin = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugin", "Plugin", null, null, null, false, false, true, 2, null);
        var rows = new PluginRegistrationRows([assembly], [plugin], [], [],
            [new PluginHandlerDependencyRow(plugin.Id, "Managed Custom API", "Custom API", true, true, plugin.Id, "Other", true, false, 3)]);

        var snapshot = new PluginRegistrationDependencyService().Build(rows, new(CascadeTargetKind.Plugin, plugin.Id,
            new Dictionary<Guid, long>()));

        var dependency = Assert.Single(snapshot.ExternalDependencies);
        Assert.Equal("Managed Custom API", dependency.Name);
    }
}
