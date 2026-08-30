using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class DataverseImageMutationGatewayTests
{
    [Theory]
    [InlineData("create")]
    [InlineData("update")]
    [InlineData("unregister")]
    public async Task Image_write_atomically_checks_parent_and_target_row_versions(string operation)
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, CaptureProxy>();
        var proxy = (CaptureProxy)(object)service;
        var stepId = Guid.NewGuid(); var imageId = Guid.NewGuid();
        var draft = new ImageDraftDto(stepId, 0, "PreImage", "Target", ["name"], new Dictionary<Guid, long>());

        await new DataversePluginRegistrationGateway(service).MutateImageAsync(
            new(operation, operation == "create" ? null : imageId, draft, 11, operation == "create" ? null : 22), default);

        var parent = Assert.IsType<UpdateRequest>(proxy.Transaction!.Requests[0]);
        Assert.Equal("11", parent.Target.RowVersion);
        Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, parent.ConcurrencyBehavior);
        if (operation == "update") Assert.Equal("22", Assert.IsType<UpdateRequest>(proxy.Transaction.Requests[1]).Target.RowVersion);
        if (operation == "unregister") Assert.Equal("22", Assert.IsType<DeleteRequest>(proxy.Transaction.Requests[1]).Target.RowVersion);
    }

    public class CaptureProxy : DispatchProxy
    {
        public ExecuteTransactionRequest? Transaction { get; private set; }
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name == "ExecuteAsync") { Transaction = Assert.IsType<ExecuteTransactionRequest>(args![0]); return Task.FromResult<OrganizationResponse>(new ExecuteTransactionResponse()); }
            throw new NotSupportedException(targetMethod?.Name);
        }
    }
}
