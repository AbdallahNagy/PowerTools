using System;
using System.Activities;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;

namespace MixedRegistrationAssembly;

public sealed class AlphaPlugin : IPlugin
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
