using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class DataverseStepMutationGatewayTests
{
    [Theory]
    [InlineData("update")]
    [InlineData("unregister")]
    public async Task Existing_step_writes_use_row_version_optimistic_concurrency(string operation)
    {
        var proxy = Proxy();
        var command = Command(operation);

        await new DataversePluginRegistrationGateway(proxy.Service).MutateStepAsync(command, CancellationToken.None);

        var request = Assert.Single(proxy.Transaction!.Requests);
        if (operation == "update")
        {
            var update = Assert.IsType<UpdateRequest>(request);
            Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
            Assert.Equal("7", update.Target.RowVersion);
        }
        else
        {
            var delete = Assert.IsType<DeleteRequest>(request);
            Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, delete.ConcurrencyBehavior);
            Assert.Equal("7", delete.Target.RowVersion);
        }
    }

    [Fact]
    public async Task Parent_version_mismatch_rejects_before_transaction_send()
    {
        var proxy = Proxy(parentVersion: 5);

        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() =>
            new DataversePluginRegistrationGateway(proxy.Service).MutateStepAsync(Command("update"), CancellationToken.None));

        Assert.Null(proxy.Transaction);
    }

    [Fact]
    public async Task Existing_secure_config_update_uses_bound_id_version_and_optimistic_concurrency()
    {
        var secureId = Guid.NewGuid();
        var proxy = Proxy();
        var command = Command("update") with { ExpectedSecureConfigId = secureId, ExpectedSecureConfigVersion = 11,
            Draft = Command("update").Draft with { ReplacementSecureConfiguration = "replacement" } };

        await new DataversePluginRegistrationGateway(proxy.Service).MutateStepAsync(command, CancellationToken.None);

        var update = Assert.IsType<UpdateRequest>(proxy.Transaction!.Requests[0]);
        Assert.Equal("sdkmessageprocessingstepsecureconfig", update.Target.LogicalName);
        Assert.Equal(secureId, update.Target.Id);
        Assert.Equal("11", update.Target.RowVersion);
        Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
    }

    private static PluginStepMutationCommand Command(string operation)
    {
        var pluginId = Guid.NewGuid();
        var stepId = Guid.NewGuid();
        var draft = new StepDraftDto(pluginId, Guid.NewGuid(), Guid.NewGuid(), "account", null, 40, 0, 1,
            ["name"], null, null, null, new Dictionary<Guid, long> { [pluginId] = 4, [stepId] = 7 });
        var before = new StepPublicValuesDto("Update account", "Update", "account", null, 40, 0, 1,
            ["name"], null, null, true, true, "keep");
        return new(operation, stepId, draft, before, 4, 7, null, null);
    }

    private static CaptureServiceProxy Proxy(long parentVersion = 4)
    {
        var service = DispatchProxy.Create<IOrganizationServiceAsync2, CaptureServiceProxy>();
        var proxy = (CaptureServiceProxy)(object)service;
        proxy.ParentVersion = parentVersion;
        proxy.Service = service;
        return proxy;
    }

    public class CaptureServiceProxy : DispatchProxy
    {
        public required IOrganizationServiceAsync2 Service { get; set; }
        public long ParentVersion { get; set; }
        public ExecuteTransactionRequest? Transaction { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name == "RetrieveAsync")
            {
                var entity = new Entity((string)args![0]!, (Guid)args[1]!) { ["versionnumber"] = ParentVersion };
                return Task.FromResult(entity);
            }
            if (targetMethod?.Name == "ExecuteAsync")
            {
                Transaction = Assert.IsType<ExecuteTransactionRequest>(args![0]);
                return Task.FromResult<OrganizationResponse>(new ExecuteTransactionResponse());
            }
            throw new NotSupportedException(targetMethod?.Name);
        }
    }
}
