using System.Security.Cryptography;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.AssemblyInspection;

public sealed class PluginAssemblyInspectorTests
{
    private const string ExpectedPublicKeyToken = "d2997b4d969e30c1";
    private const string StaticInitializerMarkerFileName =
        "plugin-inspector-static-initializer.marker";

    [Fact]
    public async Task Inspect_mixed_fixture_returns_identity_hash_handlers_and_runtime_metadata()
    {
        var path = FixturePath("MixedRegistrationAssembly.dll");
        var bytes = await File.ReadAllBytesAsync(path);

        var result = await InspectAsync(path);

        Assert.Equal("MixedRegistrationAssembly.dll", result.FileName);
        Assert.Equal(bytes.LongLength, result.Size);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
            result.Sha256);
        Assert.Equal("MixedRegistrationAssembly", result.Identity.Name);
        Assert.Equal("1.2.3.4", result.Identity.Version);
        Assert.Equal("neutral", result.Identity.Culture);
        Assert.Equal(ExpectedPublicKeyToken, result.Identity.PublicKeyToken);
        Assert.Equal(".NETFramework,Version=v4.6.2", result.TargetFramework);
        Assert.Equal("v4.0.30319", result.RuntimeVersion);
        Assert.Empty(result.Diagnostics);
        Assert.Equal(
            ["MixedRegistrationAssembly.AlphaPlugin", "MixedRegistrationAssembly.BetaPlugin"],
            result.Plugins.Select(plugin => plugin.TypeName));
        Assert.Equal(
            ["MixedRegistrationAssembly.FirstWorkflowActivity", "MixedRegistrationAssembly.SecondWorkflowActivity"],
            result.WorkflowActivities.Select(activity => activity.TypeName));
    }

    [Fact]
    public async Task Inspect_returns_stable_class_identities_for_removed_and_breaking_fixtures()
    {
        var removed = await InspectAsync(FixturePath("RemovedHandlerAssembly.dll"));
        var breaking = await InspectAsync(FixturePath("BreakingWorkflowAssembly.dll"));

        Assert.Equal(["MixedRegistrationAssembly.AlphaPlugin"],
            removed.Plugins.Select(plugin => plugin.TypeName));
        Assert.Equal(["MixedRegistrationAssembly.FirstWorkflowActivity"],
            removed.WorkflowActivities.Select(activity => activity.TypeName));
        Assert.Equal(["MixedRegistrationAssembly.FirstWorkflowActivity"],
            breaking.WorkflowActivities.Select(activity => activity.TypeName));
    }

    [Fact]
    public async Task Inspect_returns_workflow_argument_contracts_from_property_metadata()
    {
        var result = await InspectAsync(FixturePath("MixedRegistrationAssembly.dll"));
        var activity = Assert.Single(result.WorkflowActivities,
            item => item.TypeName == "MixedRegistrationAssembly.FirstWorkflowActivity");

        Assert.Equal(
        [
            new WorkflowArgumentInspectionDto(
                "Account", "Account", "Microsoft.Xrm.Sdk.EntityReference",
                WorkflowArgumentDirection.Input, true, "account"),
            new WorkflowArgumentInspectionDto(
                "Message", "Message", "System.String",
                WorkflowArgumentDirection.Output, false, null),
            new WorkflowArgumentInspectionDto(
                "Quantity", "Quantity", "System.Int32",
                WorkflowArgumentDirection.Input, false, null)
        ], activity.Arguments);
    }

    [Fact]
    public async Task Breaking_fixture_keeps_class_identity_and_changes_argument_contract()
    {
        var result = await InspectAsync(FixturePath("BreakingWorkflowAssembly.dll"));
        var activity = Assert.Single(result.WorkflowActivities);
        var argument = Assert.Single(activity.Arguments);

        Assert.Equal("MixedRegistrationAssembly.FirstWorkflowActivity", activity.TypeName);
        Assert.Equal(new WorkflowArgumentInspectionDto(
            "Quantity", "Quantity", "System.String",
            WorkflowArgumentDirection.Output, true, null), argument);
    }

    [Fact]
    public async Task Inspect_rejects_unsigned_assembly_with_safe_validation_code()
    {
        var path = FixturePath("UnsignedPluginAssembly.dll");
        await using var stream = File.OpenRead(path);
        var inspector = new PluginAssemblyInspector();

        var error = await Assert.ThrowsAsync<AssemblyInspectionValidationException>(
            () => inspector.InspectAsync(
                stream, Path.GetFileName(path), stream.Length, CancellationToken.None));

        Assert.Equal(AssemblyInspectionValidationCodes.Unsigned, error.Code);
        Assert.Equal("The assembly must be strong-name signed.", error.Message);
    }

    [Fact]
    public async Task Inspect_rejects_a_tampered_strong_name_signature()
    {
        var bytes = await File.ReadAllBytesAsync(
            FixturePath("MixedRegistrationAssembly.dll"));
        var typeName = "AlphaPlugin"u8.ToArray();
        var offset = bytes.AsSpan().IndexOf(typeName);
        Assert.True(offset >= 0, "The fixture must contain the type name to tamper.");
        bytes[offset] = (byte)'Z';

        await using var stream = new MemoryStream(bytes);
        var error = await Assert.ThrowsAsync<AssemblyInspectionValidationException>(
            () => new PluginAssemblyInspector().InspectAsync(
                stream, "tampered.dll", stream.Length, CancellationToken.None));

        Assert.Equal("assembly_strong_name_invalid", error.Code);
        Assert.Equal("The assembly strong-name signature is invalid.", error.Message);
    }

    [Fact]
    public async Task Inspect_reports_an_unsupported_target_framework_diagnostic()
    {
        var result = await InspectAsync(
            FixturePath("UnsupportedTargetFrameworkAssembly.dll"));

        Assert.Contains(result.Diagnostics, diagnostic =>
            diagnostic.Code == "target_framework_unsupported"
            && diagnostic.Severity == AssemblyInspectionDiagnosticSeverity.Error);
    }

    [Fact]
    public async Task Inspect_rejects_corrupt_pe_with_safe_validation_code()
    {
        await using var stream = new MemoryStream("not a PE file"u8.ToArray());

        var error = await Assert.ThrowsAsync<AssemblyInspectionValidationException>(
            () => new PluginAssemblyInspector().InspectAsync(
                stream, "corrupt.dll", stream.Length, CancellationToken.None));

        Assert.Equal(AssemblyInspectionValidationCodes.InvalidPe, error.Code);
        Assert.Equal("The file is not a valid managed PE assembly.", error.Message);
    }

    [Fact]
    public async Task Inspect_rejects_empty_input_with_safe_validation_code()
    {
        await using var stream = new MemoryStream();

        var error = await Assert.ThrowsAsync<AssemblyInspectionValidationException>(
            () => new PluginAssemblyInspector().InspectAsync(
                stream, "empty.dll", 0, CancellationToken.None));

        Assert.Equal(AssemblyInspectionValidationCodes.Empty, error.Code);
    }

    [Fact]
    public async Task Inspect_rejects_declared_oversized_input_before_reading()
    {
        await using var stream = new ThrowOnReadStream();

        var error = await Assert.ThrowsAsync<AssemblyInspectionValidationException>(
            () => new PluginAssemblyInspector().InspectAsync(
                stream,
                "large.dll",
                PluginAssemblyInspector.MaxAssemblyBytes + 1,
                CancellationToken.None));

        Assert.Equal(AssemblyInspectionValidationCodes.TooLarge, error.Code);
        Assert.Equal(0, stream.ReadCount);
    }

    [Fact]
    public async Task Inspect_tolerates_a_referenced_dependency_missing_from_fixture_directory()
    {
        Assert.False(File.Exists(FixturePath("FixtureDependency.dll")));

        var result = await InspectAsync(FixturePath("MissingDependencyAssembly.dll"));

        Assert.Equal(["MissingDependencyAssembly.Plugin"],
            result.Plugins.Select(plugin => plugin.TypeName));
    }

    [Fact]
    public async Task Inspect_never_runs_static_initializer()
    {
        var marker = Path.Combine(AppContext.BaseDirectory,
            StaticInitializerMarkerFileName);
        File.Delete(marker);

        _ = await InspectAsync(FixturePath("MixedRegistrationAssembly.dll"));

        Assert.False(File.Exists(marker));
    }

    [Fact]
    public void Application_maps_bounded_multipart_analyze_endpoint_and_registers_inspector()
    {
        using var factory = new PluginRegistrationApplicationFactory();
        _ = factory.Server;

        var endpoint = Assert.Single(factory.Services
            .GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>(),
            candidate =>
                candidate.RoutePattern.RawText ==
                    "/api/plugin-registration/assemblies/analyze"
                && candidate.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods
                    .Contains("POST", StringComparer.OrdinalIgnoreCase) == true);

        var requestLimit = Assert.IsAssignableFrom<IRequestSizeLimitMetadata>(
            endpoint.Metadata.GetMetadata<IRequestSizeLimitMetadata>());
        Assert.NotNull(requestLimit.MaxRequestBodySize);
        Assert.InRange(requestLimit.MaxRequestBodySize.Value,
            PluginAssemblyInspector.MaxAssemblyBytes,
            PluginAssemblyInspector.MaxAssemblyBytes + (128 * 1024));
        Assert.IsType<PluginAssemblyInspector>(
            factory.Services.GetRequiredService<IPluginAssemblyInspector>());
    }

    [Fact]
    public async Task Analyze_endpoint_rejects_unexpected_multipart_form_values()
    {
        using var factory = new PluginRegistrationApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Local-Secret", "test-secret");
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "test-token");
        client.DefaultRequestHeaders.Add("X-Environment-Url", "https://example.crm.dynamics.com");

        using var content = new MultipartFormDataContent();
        await using var fixture = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));
        content.Add(new StreamContent(fixture), "assembly", "MixedRegistrationAssembly.dll");
        content.Add(new StringContent("unexpected"), "extra");

        var response = await client.PostAsync(
            "/api/plugin-registration/assemblies/analyze", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<AssemblyInspectionErrorDto>();
        Assert.NotNull(error);
        Assert.Equal(AssemblyInspectionValidationCodes.FileRequired, error.Code);
    }

    [Fact]
    public async Task Analyze_endpoint_accepts_exactly_one_assembly_file()
    {
        using var factory = new PluginRegistrationApplicationFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Local-Secret", "test-secret");
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "test-token");
        client.DefaultRequestHeaders.Add("X-Environment-Url", "https://example.crm.dynamics.com");

        using var content = new MultipartFormDataContent();
        await using var fixture = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));
        content.Add(new StreamContent(fixture), "assembly", "MixedRegistrationAssembly.dll");

        var response = await client.PostAsync(
            "/api/plugin-registration/assemblies/analyze", content);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<AssemblyInspectionDto> InspectAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        return await new PluginAssemblyInspector().InspectAsync(
            stream, Path.GetFileName(path), stream.Length, CancellationToken.None);
    }

    private static string FixturePath(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);

    private sealed class ThrowOnReadStream : Stream
    {
        public int ReadCount { get; private set; }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            ReadCount++;
            throw new InvalidOperationException("The stream must not be read.");
        }

        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) =>
            throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) =>
            throw new NotSupportedException();
    }

    private sealed class PluginRegistrationApplicationFactory :
        WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("port", "0");
            builder.UseSetting("secret", "test-secret");
        }
    }
}
