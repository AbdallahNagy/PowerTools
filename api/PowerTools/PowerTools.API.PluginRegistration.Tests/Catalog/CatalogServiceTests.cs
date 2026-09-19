using Microsoft.Xrm.Sdk;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Catalog;

public sealed class CatalogServiceTests
{
    [Fact]
    public async Task GetAsync_maps_hierarchy_and_derived_flags()
    {
        var assemblyId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var typeId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var stepId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
        var imageId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
        var messageId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
        var filterId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
        var userId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var secureId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("pluginassembly", assemblyId)
        {
            ["name"] = "Contoso.Plugins",
            ["version"] = "1.0.0.0",
            ["publickeytoken"] = "abcdef",
            ["culture"] = "neutral",
            ["isolationmode"] = new OptionSetValue(2),
            ["sourcetype"] = new OptionSetValue(0),
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
            ["description"] = "demo assembly",
        });
        gateway.Seed(new Entity("plugintype", typeId)
        {
            ["pluginassemblyid"] = new EntityReference("pluginassembly", assemblyId),
            ["typename"] = "Contoso.Plugins.AccountPlugin",
            ["name"] = "AccountPlugin",
            ["friendlyname"] = "Account Plugin",
            ["isworkflowactivity"] = false,
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
        });
        gateway.Seed(new Entity("sdkmessageprocessingstep", stepId)
        {
            ["name"] = "AccountPlugin: Update of account",
            ["plugintypeid"] = new EntityReference("plugintype", typeId),
            ["sdkmessageid"] = new EntityReference("sdkmessage", messageId),
            ["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", filterId),
            ["stage"] = new OptionSetValue(40),
            ["mode"] = new OptionSetValue(0),
            ["rank"] = 1,
            ["statecode"] = new OptionSetValue(0),
            ["filteringattributes"] = "name,accountnumber",
            ["impersonatinguserid"] = new EntityReference("systemuser", userId),
            ["description"] = "step",
            ["configuration"] = "{}",
            ["sdkmessageprocessingstepsecureconfigid"] =
                new EntityReference("sdkmessageprocessingstepsecureconfig", secureId),
            ["supporteddeployment"] = new OptionSetValue(0),
            ["asyncautodelete"] = false,
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
            ["sdkmessage.name"] = new AliasedValue("sdkmessage", "name", "Update"),
            ["sdkmessagefilter.primaryobjecttypecode"] =
                new AliasedValue("sdkmessagefilter", "primaryobjecttypecode", "account"),
            ["sdkmessagefilter.secondaryobjecttypecode"] =
                new AliasedValue("sdkmessagefilter", "secondaryobjecttypecode", "none"),
            ["systemuser.fullname"] = new AliasedValue("systemuser", "fullname", "Ada Lovelace"),
        });
        gateway.Seed(new Entity("sdkmessageprocessingstepimage", imageId)
        {
            ["sdkmessageprocessingstepid"] = new EntityReference("sdkmessageprocessingstep", stepId),
            ["name"] = "PreImage",
            ["entityalias"] = "Target",
            ["imagetype"] = new OptionSetValue(0),
            ["attributes"] = "name,revenue",
            ["messagepropertyname"] = "Target",
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
        });

        var catalog = await new CatalogService(gateway).GetAsync(CancellationToken.None);

        var assembly = Assert.Single(catalog.Assemblies);
        Assert.Equal("Contoso.Plugins", assembly.Name);
        Assert.Equal(2, assembly.IsolationMode);
        Assert.False(assembly.IsSystem);

        var type = Assert.Single(catalog.Types);
        Assert.Equal(assemblyId, type.AssemblyId);
        Assert.Equal("Contoso.Plugins.AccountPlugin", type.TypeName);

        var step = Assert.Single(catalog.Steps);
        Assert.Equal("Update", step.MessageName);
        Assert.Equal("account", step.PrimaryEntity);
        Assert.Equal("none", step.SecondaryEntity);
        Assert.True(step.HasSecureConfiguration);
        Assert.Equal(["name", "accountnumber"], step.FilteringAttributes);
        Assert.Equal("Ada Lovelace", step.ImpersonatingUserName);
        Assert.True(step.IsEnabled);

        var image = Assert.Single(catalog.Images);
        Assert.Equal(stepId, image.StepId);
        Assert.Equal(["name", "revenue"], image.Attributes);
    }
}
