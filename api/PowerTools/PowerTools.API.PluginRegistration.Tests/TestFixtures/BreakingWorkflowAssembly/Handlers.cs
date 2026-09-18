using System.Activities;
using Microsoft.Xrm.Sdk.Workflow;

namespace MixedRegistrationAssembly;

public sealed class FirstWorkflowActivity : CodeActivity
{
    [Output("Quantity")]
    [RequiredArgument]
    public OutArgument<string> Quantity { get; set; }

    protected override void Execute(CodeActivityContext executionContext)
    {
    }
}
