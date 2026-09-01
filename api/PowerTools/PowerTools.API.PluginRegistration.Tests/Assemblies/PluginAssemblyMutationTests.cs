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
    [Theory]
    [InlineData("register")]
    [InlineData("update")]
    public async Task Register_and_update_return_verified_readback_after_exactly_one_mutation_attempt(string operation)
    {
        var inspection = Inspection();
        var existing = operation == "update" ? Assembly("1.0.0.0") : null;
        var gateway = new StatefulAssemblyGateway(existing, inspection);
        var service = Service(inspection);
        var draft = Draft(operation, existing, inspection, 2, 0);

        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);
        var result = await service.ExecuteAsync(gateway, "https://contoso.test", preflight.Plan.Token,
            preflight.Draft, Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal("succeededAndVerified", result.Outcome);
        Assert.Equal(inspection.Identity.Version, result.Assembly?.Version);
        Assert.Equal(operation == "register" ? 1 : 0, gateway.RegisterCalls);
        Assert.Equal(operation == "update" ? 1 : 0, gateway.UpdateCalls);
        Assert.Equal(1, gateway.RegisterCalls + gateway.UpdateCalls);
    }

    [Fact]
    public async Task Execute_reports_verification_failure_when_readback_does_not_match_the_uploaded_identity()
    {
        var inspection = Inspection();
        var gateway = new StatefulAssemblyGateway(null, inspection) { ReturnMismatchedVersion = true };
        var service = Service(inspection);
        var draft = Draft("register", null, inspection, 2, 0);

        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);
        var result = await service.ExecuteAsync(gateway, "https://contoso.test", preflight.Plan.Token,
            preflight.Draft, Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);

        Assert.False(result.SucceededAndVerified);
        Assert.Equal("outcomeUncertain", result.Outcome);
        Assert.Equal(1, gateway.RegisterCalls);
    }

    [Fact]
    public async Task Online_execution_uses_only_sandbox_and_database_values()
    {
        var inspection = Inspection();
        var gateway = new StatefulAssemblyGateway(null, inspection);
        var service = Service(inspection);
        var draft = Draft("register", null, inspection, 2, 0);

        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);
        await service.ExecuteAsync(gateway, "https://contoso.test", preflight.Plan.Token,
            preflight.Draft, Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);

        Assert.Equal(2, gateway.LastCommand?.IsolationMode);
        Assert.Equal(0, gateway.LastCommand?.SourceType);
    }

    [Theory]
    [InlineData("register")]
    [InlineData("update")]
    public async Task Lost_assembly_response_is_reconciled_by_full_identity_hash_and_handlers(string operation)
    {
        var inspection = Inspection();
        var existing = operation == "update" ? Assembly("1.0.0.0") : null;
        var gateway = new StatefulAssemblyGateway(existing, inspection) { LoseResponseAfterMutation = true };
        var service = Service(inspection);
        var draft = Draft(operation, existing, inspection, 2, 0);
        var preview = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);

        var result = await service.ExecuteAsync(gateway, "https://contoso.test", preview.Plan.Token,
            preview.Draft, Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None);

        Assert.Equal("reconciledAfterCommunicationFailure", result.Outcome);
        Assert.True(result.SucceededAndVerified);
        Assert.Equal(1, gateway.RegisterCalls + gateway.UpdateCalls);
    }

    [Fact]
    public async Task Update_readback_requires_the_assembly_row_version_to_advance()
    {
        var inspection = Inspection();
        var existing = Assembly("1.0.0.0");
        var gateway = new StatefulAssemblyGateway(existing, inspection) { KeepVersionAfterMutation = true };
        var service = Service(inspection);
        var draft = Draft("update", existing, inspection, 2, 0);
        var preview = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), default);

        var result = await service.ExecuteAsync(gateway, "https://contoso.test", preview.Plan.Token,
            preview.Draft, Bytes(), 3, new Dictionary<string, bool>(), default);

        Assert.Equal("outcomeUncertain", result.Outcome);
        Assert.False(result.SucceededAndVerified);
    }

    [Fact]
    public async Task Non_default_on_premises_options_are_rejected_unless_the_capability_is_bound()
    {
        var inspection = Inspection();
        var service = Service(inspection);
        var draft = Draft("register", null, inspection, 1, 1);

        await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePreflightAsync(
            new StatefulAssemblyGateway(null, inspection), "https://contoso.test", draft,
            Bytes(), 3, new Dictionary<string, bool>(), CancellationToken.None));

        var gateway = new StatefulAssemblyGateway(null, inspection);
        var capabilities = new Dictionary<string, bool> { ["onPremisesAssemblyOptions"] = true };
        var preflight = await service.CreatePreflightAsync(gateway, "https://contoso.test", draft,
            Bytes(), 3, capabilities, CancellationToken.None);
        var result = await service.ExecuteAsync(gateway, "https://contoso.test", preflight.Plan.Token,
            preflight.Draft, Bytes(), 3, capabilities, CancellationToken.None);

        Assert.True(result.SucceededAndVerified);
        Assert.Equal(1, gateway.LastCommand?.IsolationMode);
        Assert.Equal(1, gateway.LastCommand?.SourceType);
    }

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

    private static PluginAssemblyMutationService Service(AssemblyInspectionDto inspection) => new(
        new FixedInspector(inspection),
        new PluginRegistrationPreflightService(new PluginRegistrationPlanSigner("test-secret", TimeProvider.System)),
        new PluginRegistrationCatalogService());

    private static AssemblyInspectionDto Inspection() => new(
        "Contoso.dll",
        3,
        "new-sha",
        new AssemblyIdentityInspectionDto("Contoso", "2.0.0.0", "neutral", "token"),
        ".NETFramework,Version=v4.6.2",
        "v4.0.30319",
        [],
        [],
        []);

    private static PluginAssemblyRow Assembly(string version) => new(
        Guid.NewGuid(), "Contoso", version, "neutral", "token", 0, 2, false, true, 1, null);

    private static AssemblyMutationDraftDto Draft(
        string operation,
        PluginAssemblyRow? existing,
        AssemblyInspectionDto inspection,
        int isolationMode,
        int sourceType) => new(
            "Contoso.dll",
            operation,
            existing?.Id,
            isolationMode,
            sourceType,
            existing?.VersionNumber,
            new Dictionary<Guid, long>(),
            inspection);

    private static MemoryStream Bytes() => new([1, 2, 3]);

    private sealed class StatefulAssemblyGateway(
        PluginAssemblyRow? existing,
        AssemblyInspectionDto inspection) : IPluginRegistrationGateway
    {
        private readonly Guid assemblyId = existing?.Id ?? Guid.NewGuid();
        private PluginAssemblyRow? current = existing;

        public int RegisterCalls { get; private set; }
        public int UpdateCalls { get; private set; }
        public PluginAssemblyMutationCommand? LastCommand { get; private set; }
        public bool ReturnMismatchedVersion { get; init; }
        public bool LoseResponseAfterMutation { get; init; }
        public bool KeepVersionAfterMutation { get; init; }

        public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new PluginRegistrationRows(current is null ? [] : [current], [], [], []));

        public Task<PluginAssemblyImpactSnapshot> RetrieveAssemblyImpactSnapshotAsync(
            PluginAssemblyRow assembly,
            IReadOnlyList<PluginTypeRow> handlers,
            CancellationToken cancellationToken) =>
            Task.FromResult(new PluginAssemblyImpactSnapshot([1, 2, 3], [], true));

        public Task<Guid> RegisterAssemblyAsync(PluginAssemblyMutationCommand command, CancellationToken cancellationToken)
        {
            RegisterCalls++;
            Apply(command);
            if (LoseResponseAfterMutation) throw new HttpRequestException("response lost");
            return Task.FromResult(assemblyId);
        }

        public Task<Guid> UpdateAssemblyAsync(PluginAssemblyMutationCommand command, CancellationToken cancellationToken)
        {
            UpdateCalls++;
            Apply(command);
            if (LoseResponseAfterMutation) throw new HttpRequestException("response lost");
            return Task.FromResult(assemblyId);
        }

        private void Apply(PluginAssemblyMutationCommand command)
        {
            LastCommand = command;
            current = new PluginAssemblyRow(
                assemblyId,
                inspection.Identity.Name,
                ReturnMismatchedVersion ? "9.9.9.9" : inspection.Identity.Version,
                inspection.Identity.Culture,
                inspection.Identity.PublicKeyToken,
                command.SourceType,
                command.IsolationMode,
                false,
                true,
                KeepVersionAfterMutation ? current?.VersionNumber ?? 0 : (current?.VersionNumber ?? 0) + 1,
                null);
        }
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
