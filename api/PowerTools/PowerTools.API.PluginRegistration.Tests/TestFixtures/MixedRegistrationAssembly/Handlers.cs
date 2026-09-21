using System;
using System.Activities;
using System.IO;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;

namespace MixedRegistrationAssembly;

public sealed class AlphaPlugin : IPlugin
{
    public const string StaticInitializerMarkerFileName =
        "plugin-inspector-static-initializer.marker";

    static AlphaPlugin()
    {
        File.WriteAllText(
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory,
                StaticInitializerMarkerFileName),
            "executed");
    }

    public void Execute(IServiceProvider serviceProvider)
    {
    }
}

public sealed class BetaPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
    }
}

public sealed class FirstWorkflowActivity : CodeActivity
{
    [Input("Account")]
    [ReferenceTarget("account")]
    [RequiredArgument]
    public InArgument<EntityReference> Account { get; set; }

    [Input("Quantity")]
    public InArgument<int> Quantity { get; set; }

    [Output("Message")]
    public OutArgument<string> Message { get; set; }

    protected override void Execute(CodeActivityContext executionContext)
    {
    }
}

public sealed class SecondWorkflowActivity : CodeActivity
{
    [Input("Related contact")]
    [ReferenceTarget("contact")]
    public InArgument<EntityReference> RelatedContact { get; set; }

    [Output("Succeeded")]
    public OutArgument<bool> Succeeded { get; set; }

    protected override void Execute(CodeActivityContext executionContext)
    {
    }
}
