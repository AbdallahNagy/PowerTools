using System.Reflection;
using System.Text;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Assemblies;

public sealed class PluginAssemblyMutationTests
{
    [Fact]
    public async Task Execute_rejects_a_new_dependency_before_the_single_update_attempt_when_versions_are_unchanged()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso", "1.0.0.0", "neutral", "token", 0, 2, false, true, 1, null);
        var handler = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugin", "Plugin", null, null, null, false, false, true, 1, null);
        var rows = new PluginRegistrationRows([assembly], [handler], [], []);
        var gateway = new DependencyAppearsGateway(rows, assembly, handler);
        var inspection = new AssemblyInspectionDto("Contoso.dll", 3, "new-sha",
            new AssemblyIdentityInspectionDto("Contoso", "2.0.0.0", "neutral", "token"),
            ".NETFramework,Version=v4.6.2", "v4.0.30319", [], [], []);
        var service = new PluginAssemblyMutationService(
            new FixedInspector(inspection),
            new PluginRegistrationPreflightService(new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)),
            new PluginRegistrationCatalogService());
        var draft = new AssemblyMutationDraftDto("Contoso.dll", "update", assembly.Id, 2, 0,
            assembly.VersionNumber, new Dictionary<Guid, long> { [handler.Id] = handler.VersionNumber }, inspection);

        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            new MemoryStream([1, 2, 3]), 3, new Dictionary<string, bool>(), CancellationToken.None);

        await Assert.ThrowsAsync<PluginRegistrationPreflightException>(() => service.ExecuteAsync(
            gateway, "https://contoso.test", preflight.Plan.Token, draft,
            new MemoryStream([1, 2, 3]), 3, new Dictionary<string, bool>(), CancellationToken.None));

        Assert.Equal(0, gateway.UpdateCalls);
    }

    [Fact]
    public void Assembly_mutation_service_is_available_to_execute_a_verified_plan()
    {
        var type = typeof(Program).Assembly.GetType(
            "PowerTools.API.Tools.PluginRegistration.PluginAssemblyMutationService");

        Assert.NotNull(type);
    }

    [Fact]
    public async Task Gateway_reads_source_bytes_and_delete_dependencies_into_a_complete_impact_snapshot()
    {
        var assembly = new PluginAssemblyRow(Guid.NewGuid(), "Contoso", "1.0.0.0", "neutral", "token", 0, 2, false, true, 1, null);
        var handler = new PluginTypeRow(Guid.NewGuid(), assembly.Id, "Contoso.Plugin", "Plugin", null, null, null, false, false, true, 1, null);
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, ImpactServiceProxy>();
        var recorder = (ImpactServiceProxy)(object)proxy;
        recorder.AssemblyContent["content"] = Convert.ToBase64String(Encoding.UTF8.GetBytes("dll"));
        var dependency = new Entity("dependency")
        {
            ["dependentcomponenttype"] = new OptionSetValue(371),
            ["dependentcomponentobjectid"] = new EntityReference("customapi", Guid.NewGuid()) { Name = "Submit Account" }
        };
        recorder.Dependencies.Entities.Add(dependency);

        var snapshot = await new DataversePluginRegistrationGateway(proxy)
            .RetrieveAssemblyImpactSnapshotAsync(assembly, [handler], CancellationToken.None);

        Assert.True(snapshot.IsComplete);
        Assert.Equal("dll", Encoding.UTF8.GetString(snapshot.Content));
        Assert.Contains(snapshot.Dependencies, row => row.HandlerId == handler.Id && row.IsCustomApi && row.Name == "Submit Account");
        Assert.Equal("RetrieveDependenciesForDelete", recorder.Request?.RequestName);
        Assert.Equal(90, recorder.Request?.Parameters["ComponentType"]);
        Assert.Equal(handler.Id, recorder.Request?.Parameters["ObjectId"]);
        Array.Clear(snapshot.Content);
    }

    private class ImpactServiceProxy : DispatchProxy
    {
        public Entity AssemblyContent { get; } = new("pluginassembly");
        public EntityCollection Dependencies { get; } = new();
        public OrganizationRequest? Request { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod?.Name switch
        {
            nameof(IOrganizationServiceAsync2.RetrieveAsync) => Task.FromResult(AssemblyContent),
            nameof(IOrganizationServiceAsync2.ExecuteAsync) => Execute(args),
            _ => throw new NotSupportedException(targetMethod?.Name)
        };

        private OrganizationResponse Response()
        {
            var response = new OrganizationResponse();
            response.Results["EntityDependencies"] = Dependencies;
            return response;
        }

        private Task<OrganizationResponse> Execute(object?[]? args)
        {
            Request = args?.OfType<OrganizationRequest>().Single();
            return Task.FromResult(Response());
        }
    }

    private sealed class FixedInspector(AssemblyInspectionDto inspection) : IPluginAssemblyInspector
    {
        public Task<AssemblyInspectionDto> InspectAsync(Stream assembly, string fileName, long length, CancellationToken cancellationToken) =>
            Task.FromResult(inspection);
    }

    private sealed class DependencyAppearsGateway(
        PluginRegistrationRows rows,
        PluginAssemblyRow assembly,
        PluginTypeRow handler) : IPluginRegistrationGateway
    {
        private int snapshotReads;
        public int UpdateCalls { get; private set; }

        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) => Task.FromResult(rows);

        public Task<PluginAssemblyImpactSnapshot> RetrieveAssemblyImpactSnapshotAsync(
            PluginAssemblyRow requestedAssembly,
            IReadOnlyList<PluginTypeRow> handlers,
            CancellationToken cancellationToken)
        {
            snapshotReads++;
            var dependencies = snapshotReads < 3
                ? []
                : new[] { new PluginHandlerDependencyRow(handler.Id, "Submit Account", "Custom API", true, true) };
            return Task.FromResult(new PluginAssemblyImpactSnapshot([1, 2, 3], dependencies, true));
        }

        public Task<Guid> UpdateAssemblyAsync(PluginAssemblyMutationCommand command, CancellationToken cancellationToken)
        {
            UpdateCalls++;
            return Task.FromResult(assembly.Id);
        }
    }
}
