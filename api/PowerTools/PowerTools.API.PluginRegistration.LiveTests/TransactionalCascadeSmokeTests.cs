using Microsoft.Crm.Sdk.Messages;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.LiveTests;

public sealed class LiveFactAttribute : FactAttribute
{
    public LiveFactAttribute()
    {
        var live = Environment.GetEnvironmentVariable("POWERTOOLS_PLUGIN_LIVE");
        var connection = Environment.GetEnvironmentVariable("POWERTOOLS_PLUGIN_CONNECTION");
        var fixture = Environment.GetEnvironmentVariable("POWERTOOLS_PLUGIN_FIXTURE");
        if (live != "1" || string.IsNullOrWhiteSpace(connection) || string.IsNullOrWhiteSpace(fixture))
        {
            Skip = "Requires POWERTOOLS_PLUGIN_LIVE=1, POWERTOOLS_PLUGIN_CONNECTION, and POWERTOOLS_PLUGIN_FIXTURE.";
            return;
        }

        if (!LiveInputs.IsExplicitlyDisposable(connection))
            throw new InvalidOperationException(
                "Live plug-in tests require a connection whose URL/name explicitly contains dev, development, disposable, sandbox, or test, and never prod/production.");
        if (!Path.IsPathFullyQualified(fixture) || !File.Exists(fixture))
            throw new InvalidOperationException("POWERTOOLS_PLUGIN_FIXTURE must be an existing absolute signed fixture path.");
    }
}

public sealed class TransactionalCascadeSmokeTests
{
    [LiveFact]
    public async Task Signed_fixture_lifecycle_is_atomic_and_completely_removed()
    {
        var inputs = LiveInputs.Require();
        var bytes = await File.ReadAllBytesAsync(inputs.FixturePath);
        await using var fixtureStream = new MemoryStream(bytes, writable: false);
        var inspection = await new PluginAssemblyInspector().InspectAsync(
            fixtureStream, Path.GetFileName(inputs.FixturePath), bytes.Length, CancellationToken.None);
        Assert.NotEmpty(inspection.Identity.PublicKeyToken);
        Assert.NotEmpty(inspection.Plugins);

        using var client = Connect(inputs.Connection);
        AssertDisposableOrganization(client);
        AssertAssemblyNameIsUnused(client, inspection.Identity.Name);

        var assemblyId = Guid.Empty;
        var stepId = Guid.Empty;
        var imageId = Guid.Empty;
        IReadOnlyList<Guid> handlerIds = [];
        try
        {
            assemblyId = RegisterAssembly(client, inspection, bytes);
            handlerIds = RetrieveHandlerIds(client, assemblyId);
            var pluginId = RetrievePluginHandlerId(client, assemblyId, inspection.Plugins[0].TypeName);
            stepId = CreateUpdateStep(client, pluginId);
            imageId = CreatePostImage(client, stepId);

            client.Update(new Entity("sdkmessageprocessingstep", stepId) { ["rank"] = 2 });
            Assert.Equal(2, client.Retrieve("sdkmessageprocessingstep", stepId, new ColumnSet("rank"))
                .GetAttributeValue<int>("rank"));

            AssertReferencedBreakingContractIsBlocked(inspection);
            ProveRollback(client, imageId);

            ExecuteCascade(client, imageId, stepId, handlerIds, assemblyId);
            AssertAbsent(client, "sdkmessageprocessingstepimage", imageId);
            AssertAbsent(client, "sdkmessageprocessingstep", stepId);
            foreach (var handlerId in handlerIds) AssertAbsent(client, "plugintype", handlerId);
            AssertAbsent(client, "pluginassembly", assemblyId);
            assemblyId = Guid.Empty;
        }
        finally
        {
            CleanupOwnedRegistration(client, imageId, stepId, handlerIds, assemblyId);
        }
    }

    [LiveFact]
    public async Task External_custom_api_blocks_handler_delete_and_remains_untouched()
    {
        var inputs = LiveInputs.Require();
        var bytes = await File.ReadAllBytesAsync(inputs.FixturePath);
        await using var fixtureStream = new MemoryStream(bytes, writable: false);
        var inspection = await new PluginAssemblyInspector().InspectAsync(
            fixtureStream, Path.GetFileName(inputs.FixturePath), bytes.Length, CancellationToken.None);

        using var client = Connect(inputs.Connection);
        AssertDisposableOrganization(client);
        AssertAssemblyNameIsUnused(client, inspection.Identity.Name);
        var assemblyId = Guid.Empty;
        var customApiId = Guid.Empty;
        IReadOnlyList<Guid> handlerIds = [];
        try
        {
            assemblyId = RegisterAssembly(client, inspection, bytes);
            handlerIds = RetrieveHandlerIds(client, assemblyId);
            var pluginId = RetrievePluginHandlerId(client, assemblyId, inspection.Plugins[0].TypeName);
            customApiId = CreateExternalCustomApi(client, pluginId);

            var gateway = new DataversePluginRegistrationGateway(client);
            var dependencies = await gateway.RetrieveCascadeDependenciesAsync(
                [new CascadeDeleteRequestDto(pluginId, "plugintype", RowVersion(client, "plugintype", pluginId))],
                CancellationToken.None);
            Assert.Contains(dependencies, dependency => dependency.ComponentId == customApiId && dependency.IsExternal);
            Assert.ThrowsAny<Exception>(() => client.Delete("plugintype", pluginId));
            AssertPresent(client, "customapi", customApiId);
        }
        finally
        {
            TryDelete(client, "customapi", customApiId);
            CleanupOwnedRegistration(client, Guid.Empty, Guid.Empty, handlerIds, assemblyId);
        }
    }

    private static ServiceClient Connect(string connection)
    {
        var client = new ServiceClient(connection);
        Assert.True(client.IsReady, "The explicitly disposable Dataverse connection could not be opened.");
        return client;
    }

    private static void AssertDisposableOrganization(ServiceClient client)
    {
        _ = (WhoAmIResponse)client.Execute(new WhoAmIRequest());
        Assert.True(LiveInputs.IsExplicitlyDisposable(client.ConnectedOrgUriActual?.ToString() ?? string.Empty),
            "Connected organization URL does not explicitly identify a disposable/development target.");
    }

    private static Guid RegisterAssembly(ServiceClient client, AssemblyInspectionDto inspection, byte[] bytes) =>
        client.Create(new Entity("pluginassembly")
        {
            ["name"] = inspection.Identity.Name,
            ["version"] = inspection.Identity.Version,
            ["culture"] = inspection.Identity.Culture,
            ["publickeytoken"] = inspection.Identity.PublicKeyToken,
            ["sourcetype"] = new OptionSetValue(0),
            ["isolationmode"] = new OptionSetValue(2),
            ["content"] = Convert.ToBase64String(bytes)
        });

    private static void AssertAssemblyNameIsUnused(ServiceClient client, string assemblyName)
    {
        var query = new QueryExpression("pluginassembly") { ColumnSet = new ColumnSet(false), TopCount = 1 };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, assemblyName);
        Assert.Empty(client.RetrieveMultiple(query).Entities);
    }

    private static IReadOnlyList<Guid> RetrieveHandlerIds(ServiceClient client, Guid assemblyId)
    {
        var query = new QueryExpression("plugintype") { ColumnSet = new ColumnSet("plugintypeid") };
        query.Criteria.AddCondition("pluginassemblyid", ConditionOperator.Equal, assemblyId);
        var ids = client.RetrieveMultiple(query).Entities.Select(entity => entity.Id).ToArray();
        Assert.NotEmpty(ids);
        return ids;
    }

    private static Guid RetrievePluginHandlerId(ServiceClient client, Guid assemblyId, string typeName)
    {
        var query = new QueryExpression("plugintype") { ColumnSet = new ColumnSet("plugintypeid"), TopCount = 1 };
        query.Criteria.AddCondition("pluginassemblyid", ConditionOperator.Equal, assemblyId);
        query.Criteria.AddCondition("typename", ConditionOperator.Equal, typeName);
        return Assert.Single(client.RetrieveMultiple(query).Entities).Id;
    }

    private static Guid CreateUpdateStep(ServiceClient client, Guid pluginId)
    {
        var messageQuery = new QueryExpression("sdkmessage") { ColumnSet = new ColumnSet("sdkmessageid"), TopCount = 1 };
        messageQuery.Criteria.AddCondition("name", ConditionOperator.Equal, "Update");
        var messageId = Assert.Single(client.RetrieveMultiple(messageQuery).Entities).Id;
        var filterQuery = new QueryExpression("sdkmessagefilter") { ColumnSet = new ColumnSet("sdkmessagefilterid"), TopCount = 1 };
        filterQuery.Criteria.AddCondition("sdkmessageid", ConditionOperator.Equal, messageId);
        filterQuery.Criteria.AddCondition("primaryobjecttypecode", ConditionOperator.Equal, "account");
        var filterId = Assert.Single(client.RetrieveMultiple(filterQuery).Entities).Id;
        return client.Create(new Entity("sdkmessageprocessingstep")
        {
            ["name"] = $"PowerTools disposable smoke {Guid.NewGuid():N}",
            ["sdkmessageid"] = new EntityReference("sdkmessage", messageId),
            ["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", filterId),
            ["eventhandler"] = new EntityReference("plugintype", pluginId),
            ["stage"] = new OptionSetValue(40),
            ["mode"] = new OptionSetValue(0),
            ["rank"] = 1,
            ["supporteddeployment"] = new OptionSetValue(0)
        });
    }

    private static Guid CreatePostImage(ServiceClient client, Guid stepId) =>
        client.Create(new Entity("sdkmessageprocessingstepimage")
        {
            ["name"] = "PowerTools disposable post image",
            ["sdkmessageprocessingstepid"] = new EntityReference("sdkmessageprocessingstep", stepId),
            ["imagetype"] = new OptionSetValue(1),
            ["entityalias"] = "Target",
            ["messagepropertyname"] = "Target",
            ["attributes"] = "name"
        });

    private static void AssertReferencedBreakingContractIsBlocked(AssemblyInspectionDto inspection)
    {
        var activity = Assert.Single(inspection.WorkflowActivities.Where(item => item.Arguments.Count > 0).Take(1));
        var existing = new WorkflowContractSnapshot(activity.TypeName,
            activity.Arguments.Select((argument, position) => new WorkflowArgumentDto(argument.Name, argument.Name,
                argument.TypeName, argument.Direction, argument.IsRequired, position)).ToArray(), true);
        Assert.True(WorkflowContractComparer.Compare(existing, []).HasBreakingChanges);
    }

    private static void ProveRollback(ServiceClient client, Guid imageId)
    {
        var request = new ExecuteTransactionRequest { ReturnResponses = true };
        request.Requests.Add(new DeleteRequest { Target = new EntityReference("sdkmessageprocessingstepimage", imageId) });
        request.Requests.Add(new DeleteRequest { Target = new EntityReference("pluginassembly", Guid.NewGuid()) });
        Assert.ThrowsAny<Exception>(() => client.Execute(request));
        AssertPresent(client, "sdkmessageprocessingstepimage", imageId);
    }

    private static void ExecuteCascade(ServiceClient client, Guid imageId, Guid stepId,
        IReadOnlyList<Guid> handlerIds, Guid assemblyId)
    {
        var request = new ExecuteTransactionRequest { ReturnResponses = true };
        request.Requests.Add(new DeleteRequest { Target = new EntityReference("sdkmessageprocessingstepimage", imageId) });
        request.Requests.Add(new DeleteRequest { Target = new EntityReference("sdkmessageprocessingstep", stepId) });
        foreach (var handlerId in handlerIds)
            request.Requests.Add(new DeleteRequest { Target = new EntityReference("plugintype", handlerId) });
        request.Requests.Add(new DeleteRequest { Target = new EntityReference("pluginassembly", assemblyId) });
        _ = (ExecuteTransactionResponse)client.Execute(request);
    }

    private static Guid CreateExternalCustomApi(ServiceClient client, Guid pluginId)
    {
        var suffix = Guid.NewGuid().ToString("N");
        return client.Create(new Entity("customapi")
        {
            ["name"] = $"PowerTools disposable blocker {suffix}",
            ["uniquename"] = $"powertools_disposable_{suffix}",
            ["displayname"] = "PowerTools disposable blocker",
            ["description"] = "Owned release-gate blocker fixture",
            ["bindingtype"] = new OptionSetValue(0),
            ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
            ["isfunction"] = false,
            ["isprivate"] = true,
            ["plugintypeid"] = new EntityReference("plugintype", pluginId)
        });
    }

    private static long RowVersion(ServiceClient client, string logicalName, Guid id)
    {
        var entity = client.Retrieve(logicalName, id, new ColumnSet(false));
        return long.TryParse(entity.RowVersion, out var version) ? version : 0;
    }

    private static void CleanupOwnedRegistration(ServiceClient client, Guid imageId, Guid stepId,
        IReadOnlyList<Guid> handlerIds, Guid assemblyId)
    {
        TryDelete(client, "sdkmessageprocessingstepimage", imageId);
        TryDelete(client, "sdkmessageprocessingstep", stepId);
        foreach (var handlerId in handlerIds) TryDelete(client, "plugintype", handlerId);
        TryDelete(client, "pluginassembly", assemblyId);
    }

    private static void TryDelete(ServiceClient client, string logicalName, Guid id)
    {
        if (id == Guid.Empty) return;
        try { client.Delete(logicalName, id); }
        catch { /* Best-effort cleanup of IDs created by this test only. */ }
    }

    private static void AssertPresent(ServiceClient client, string logicalName, Guid id) =>
        Assert.Equal(id, client.Retrieve(logicalName, id, new ColumnSet(false)).Id);

    private static void AssertAbsent(ServiceClient client, string logicalName, Guid id)
    {
        var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet(false), TopCount = 1 };
        query.Criteria.AddCondition($"{logicalName}id", ConditionOperator.Equal, id);
        Assert.Empty(client.RetrieveMultiple(query).Entities);
    }
}

internal sealed record LiveInputs(string Connection, string FixturePath)
{
    public static LiveInputs Require() => new(
        Environment.GetEnvironmentVariable("POWERTOOLS_PLUGIN_CONNECTION")
            ?? throw new InvalidOperationException("POWERTOOLS_PLUGIN_CONNECTION is required."),
        Environment.GetEnvironmentVariable("POWERTOOLS_PLUGIN_FIXTURE")
            ?? throw new InvalidOperationException("POWERTOOLS_PLUGIN_FIXTURE is required."));

    public static bool IsExplicitlyDisposable(string value)
    {
        var normalized = value.ToLowerInvariant();
        if (normalized.Contains("prod") || normalized.Contains("production")) return false;
        return new[] { "development", "disposable", "sandbox", "test", "dev" }
            .Any(marker => normalized.Contains(marker, StringComparison.Ordinal));
    }
}
