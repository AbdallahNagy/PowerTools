using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Assemblies;

public sealed class PluginAssemblyMutationTests
{
    [Fact]
    public void Assembly_mutation_service_is_available_to_execute_a_verified_plan()
    {
        var type = typeof(Program).Assembly.GetType(
            "PowerTools.API.Tools.PluginRegistration.PluginAssemblyMutationService");

        Assert.NotNull(type);
    }
}
