using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Contracts;

public sealed class CatalogContractTests
{
    [Fact]
    public void Catalog_contract_keeps_handlers_directly_below_assembly()
    {
        var plugin = new PluginHandlerDto(
            Guid.NewGuid(), HandlerKind.Plugin, "Contoso.ValidateAccount",
            "ValidateAccount", null, null, null, false, true, 3,
            [], [], []);
        var workflow = plugin with
        {
            Id = Guid.NewGuid(),
            Kind = HandlerKind.WorkflowActivity,
            TypeName = "Contoso.CalculateDiscount",
            Name = "CalculateDiscount",
            WorkflowActivityGroupName = "Contoso"
        };
        var assembly = new PluginAssemblyDto(
            Guid.NewGuid(), "Contoso.Plugins", "1.2.0.0", "neutral", "31bf3856ad364e35",
            2, 0, false, true, 7, [plugin, workflow]);

        Assert.Equal([HandlerKind.Plugin, HandlerKind.WorkflowActivity],
            assembly.Handlers.Select(handler => handler.Kind));
    }
}
