using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.WorkflowActivities;

public sealed class WorkflowContractComparerTests
{
    [Fact]
    public void Compare_marks_referenced_removed_argument_as_blocker()
    {
        var existing = new WorkflowContractSnapshot("Contoso.Activity", "Contoso.Activity", [
            new WorkflowArgumentDto("account", "Account", "EntityReference", WorkflowArgumentDirection.Input, false, 0)
        ], true);

        var result = WorkflowContractComparer.Compare(existing, "Contoso.Activity", []);

        var difference = Assert.Single(result.Differences);
        Assert.Equal("removed", difference.Change);
        Assert.True(difference.IsBreaking);
        Assert.True(difference.IsReferenced);
        Assert.Contains(result.Differences, item => item.IsBreaking && item.IsReferenced);
    }

    [Fact]
    public void Compare_warns_for_unreferenced_type_and_direction_changes_and_required_addition()
    {
        var existing = new WorkflowContractSnapshot("Contoso.Activity", "Contoso.Activity", [
            new WorkflowArgumentDto("account", "Account", "EntityReference", WorkflowArgumentDirection.Input, false, 0),
            new WorkflowArgumentDto("result", "Result", "string", WorkflowArgumentDirection.Output, false, 1)
        ], false);

        var result = WorkflowContractComparer.Compare(existing, "Contoso.Activity", [
            new WorkflowArgumentDto("account", "Account", "string", WorkflowArgumentDirection.Output, false, 0),
            new WorkflowArgumentDto("required", "Required", "string", WorkflowArgumentDirection.Input, true, 1)
        ]);

        Assert.Equal(3, result.Differences.Count);
        Assert.All(result.Differences, difference => Assert.True(difference.IsBreaking));
        Assert.All(result.Differences, difference => Assert.False(difference.IsReferenced));
        Assert.DoesNotContain(result.Differences, item => item.IsBreaking && item.IsReferenced);
    }

    [Fact]
    public void Compare_treats_class_identity_change_as_breaking()
    {
        var existing = new WorkflowContractSnapshot("Contoso.Activity", "Contoso.OldActivity", [], true);

        var result = WorkflowContractComparer.Compare(existing, "Contoso.NewActivity", []);

        var difference = Assert.Single(result.Differences);
        Assert.Equal("class-identity-changed", difference.Change);
        Assert.Contains(result.Differences, item => item.IsBreaking && item.IsReferenced);
    }
}
