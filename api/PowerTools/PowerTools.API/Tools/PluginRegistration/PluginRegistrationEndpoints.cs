using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationEndpoints
{
    private const long MultipartRequestOverheadBytes = 64 * 1024;

    public static IEndpointRouteBuilder MapPluginRegistrationEndpoints(
        this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/plugin-registration")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/catalog", async (
            HttpContext ctx,
            DataverseClientFactory clientFactory,
            IPluginRegistrationGatewayFactory gatewayFactory,
            PluginRegistrationCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var dataverseClient = ctx.CreateDataverseClient(clientFactory);
            var gateway = gatewayFactory.Create(dataverseClient);
            var catalog = await catalogService.RetrieveCatalogAsync(
                gateway,
                cancellationToken);
            return Results.Ok(catalog);
        }).WithName("GetPluginRegistrationCatalog");

        group.MapPost("/assemblies/analyze", AnalyzeAssemblyAsync)
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(
                PluginAssemblyInspector.MaxAssemblyBytes
                + MultipartRequestOverheadBytes))
            .WithMetadata(new RequestFormLimitsAttribute
            {
                MultipartBodyLengthLimit =
                    PluginAssemblyInspector.MaxAssemblyBytes
                    + MultipartRequestOverheadBytes,
                MemoryBufferThreshold = (int)PluginAssemblyInspector.MaxAssemblyBytes
            })
            .WithName("AnalyzePluginAssembly");

        group.MapPost("/assemblies/register/preflight", (HttpContext context, IPluginRegistrationGatewayFactory gatewayFactory, DataverseClientFactory clientFactory, ICurrentConnection connection, CancellationToken cancellationToken) =>
            CreateAssemblyPreflightAsync(context, gatewayFactory, clientFactory, connection, CreateMutationService(context), null, cancellationToken))
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes, MemoryBufferThreshold = (int)PluginAssemblyInspector.MaxAssemblyBytes })
            .WithName("PreflightRegisterPluginAssembly");

        group.MapPost("/assemblies/{assemblyId:guid}/update/preflight", (Guid assemblyId, HttpContext context, IPluginRegistrationGatewayFactory gatewayFactory, DataverseClientFactory clientFactory, ICurrentConnection connection, CancellationToken cancellationToken) =>
            CreateAssemblyPreflightAsync(context, gatewayFactory, clientFactory, connection, CreateMutationService(context), assemblyId, cancellationToken))
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes, MemoryBufferThreshold = (int)PluginAssemblyInspector.MaxAssemblyBytes })
            .WithName("PreflightUpdatePluginAssembly");

        group.MapPost("/assemblies/register/execute", (HttpContext context, IPluginRegistrationGatewayFactory gatewayFactory, DataverseClientFactory clientFactory, ICurrentConnection connection, CancellationToken cancellationToken) =>
            ExecuteAssemblyMutationAsync(context, gatewayFactory, clientFactory, connection, CreateMutationService(context), null, cancellationToken))
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes, MemoryBufferThreshold = (int)PluginAssemblyInspector.MaxAssemblyBytes })
            .WithName("ExecuteRegisterPluginAssembly");

        group.MapPost("/assemblies/{assemblyId:guid}/update/execute", (Guid assemblyId, HttpContext context, IPluginRegistrationGatewayFactory gatewayFactory, DataverseClientFactory clientFactory, ICurrentConnection connection, CancellationToken cancellationToken) =>
            ExecuteAssemblyMutationAsync(context, gatewayFactory, clientFactory, connection, CreateMutationService(context), assemblyId, cancellationToken))
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PluginAssemblyInspector.MaxAssemblyBytes + MultipartRequestOverheadBytes, MemoryBufferThreshold = (int)PluginAssemblyInspector.MaxAssemblyBytes })
            .WithName("ExecuteUpdatePluginAssembly");

        return app;
    }

    private static async Task<IResult> AnalyzeAssemblyAsync(
        HttpRequest request,
        IPluginAssemblyInspector inspector,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!request.HasFormContentType)
                return ValidationError(
                    AssemblyInspectionValidationCodes.FileRequired,
                    "Upload one assembly file in the multipart 'assembly' field.");

            var form = await request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("assembly");
            if (file is null || form.Files.Count != 1 || form.Count != 0)
            {
                return ValidationError(
                    AssemblyInspectionValidationCodes.FileRequired,
                    "Upload one assembly file in the multipart 'assembly' field.");
            }

            if (file.Length > PluginAssemblyInspector.MaxAssemblyBytes)
            {
                return Results.Json(
                    new AssemblyInspectionErrorDto(
                        AssemblyInspectionValidationCodes.TooLarge,
                        $"The assembly exceeds the {PluginAssemblyInspector.MaxAssemblyBytes}-byte limit."),
                    statusCode: StatusCodes.Status413PayloadTooLarge);
            }

            var copyBuffer = new byte[64 * 1024];
            using var requestContent = new MemoryStream(
                (int)Math.Min(file.Length, PluginAssemblyInspector.MaxAssemblyBytes));
            try
            {
                await using var uploaded = file.OpenReadStream();
                long copied = 0;
                while (true)
                {
                    var read = await uploaded.ReadAsync(
                        copyBuffer.AsMemory(), cancellationToken);
                    if (read == 0)
                        break;

                    copied += read;
                    if (copied > PluginAssemblyInspector.MaxAssemblyBytes)
                    {
                        return Results.Json(
                            new AssemblyInspectionErrorDto(
                                AssemblyInspectionValidationCodes.TooLarge,
                                $"The assembly exceeds the {PluginAssemblyInspector.MaxAssemblyBytes}-byte limit."),
                            statusCode: StatusCodes.Status413PayloadTooLarge);
                    }

                    await requestContent.WriteAsync(
                        copyBuffer.AsMemory(0, read), cancellationToken);
                }

                requestContent.Position = 0;
                var result = await inspector.InspectAsync(
                    requestContent,
                    file.FileName,
                    copied,
                    cancellationToken);
                return Results.Ok(result);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(copyBuffer);
                if (requestContent.TryGetBuffer(out var contentBuffer))
                {
                    CryptographicOperations.ZeroMemory(
                        contentBuffer.AsSpan(0, (int)requestContent.Length));
                }
            }
        }
        catch (AssemblyInspectionValidationException error)
        {
            return ValidationError(error.Code, error.Message);
        }
        catch (InvalidDataException)
        {
            return Results.Json(
                new AssemblyInspectionErrorDto(
                    AssemblyInspectionValidationCodes.TooLarge,
                    "The multipart request exceeds the allowed size."),
                statusCode: StatusCodes.Status413PayloadTooLarge);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            return ValidationError(
                AssemblyInspectionValidationCodes.InspectionFailed,
                "The assembly could not be inspected safely.");
        }
    }

    private static IResult ValidationError(string code, string message) =>
        Results.BadRequest(new AssemblyInspectionErrorDto(code, message));

    private static async Task<IResult> CreateAssemblyPreflightAsync(
        HttpContext context,
        IPluginRegistrationGatewayFactory gatewayFactory,
        DataverseClientFactory clientFactory,
        ICurrentConnection connection,
        PluginAssemblyMutationService mutations,
        Guid? routeAssemblyId,
        CancellationToken cancellationToken)
    {
        try
        {
            var upload = await ReadAssemblyMutationFormAsync(context.Request, routeAssemblyId, false, cancellationToken);
            try
            {
                await using var content = new MemoryStream(upload.Content, writable: false);
                var gateway = gatewayFactory.Create(context.CreateDataverseClient(clientFactory));
                var preflight = await mutations.CreatePreflightAsync(gateway, connection.EnvironmentUrl,
                    upload.Draft, content, upload.Content.Length, Capabilities(connection), cancellationToken);
                return Results.Ok(preflight);
            }
            finally { upload.ZeroContent(); }
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            var problem = PluginRegistrationProblem.FromException(error, connection.EnvironmentUrl, "assembly");
            return Results.Json(problem.Problem, statusCode: problem.StatusCode);
        }
    }

    private static async Task<IResult> ExecuteAssemblyMutationAsync(
        HttpContext context,
        IPluginRegistrationGatewayFactory gatewayFactory,
        DataverseClientFactory clientFactory,
        ICurrentConnection connection,
        PluginAssemblyMutationService mutations,
        Guid? routeAssemblyId,
        CancellationToken cancellationToken)
    {
        try
        {
            var upload = await ReadAssemblyMutationFormAsync(context.Request, routeAssemblyId, true, cancellationToken);
            try
            {
                await using var content = new MemoryStream(upload.Content, writable: false);
                var gateway = gatewayFactory.Create(context.CreateDataverseClient(clientFactory));
                var result = await mutations.ExecuteAsync(gateway, connection.EnvironmentUrl, upload.PlanToken!,
                    upload.Draft, content, upload.Content.Length, Capabilities(connection), cancellationToken);
                return Results.Ok(result);
            }
            finally { upload.ZeroContent(); }
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            var problem = PluginRegistrationProblem.FromException(error, connection.EnvironmentUrl, "assembly");
            return Results.Json(problem.Problem, statusCode: problem.StatusCode);
        }
    }

    private static async Task<AssemblyMutationUpload> ReadAssemblyMutationFormAsync(
        HttpRequest request,
        Guid? routeAssemblyId,
        bool requiresPlanToken,
        CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType) throw new ArgumentException("A multipart assembly form is required.");
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("assembly");
        var json = form["draft"].FirstOrDefault();
        var token = form["planToken"].FirstOrDefault();
        if (file is null || form.Files.Count != 1 || form.Count != (requiresPlanToken ? 2 : 1) || string.IsNullOrWhiteSpace(json)
            || (requiresPlanToken && string.IsNullOrWhiteSpace(token)))
            throw new ArgumentException("The assembly, draft, and plan token are required.");
        if (file.Length <= 0 || file.Length > PluginAssemblyInspector.MaxAssemblyBytes)
            throw new ArgumentException("The assembly size is not valid.");
        var draft = JsonSerializer.Deserialize<AssemblyMutationDraftDto>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new ArgumentException("The assembly draft is not valid.");
        if (draft.AssemblyId != routeAssemblyId) throw new ArgumentException("The draft target does not match the route.");
        var content = new byte[file.Length];
        try
        {
            await using var stream = file.OpenReadStream();
            var offset = 0;
            while (offset < content.Length)
            {
                var read = await stream.ReadAsync(content.AsMemory(offset), cancellationToken);
                if (read == 0) throw new InvalidDataException("The assembly upload ended unexpectedly.");
                offset += read;
            }
            return new AssemblyMutationUpload(draft with { FileName = file.FileName }, token, content);
        }
        catch
        {
            CryptographicOperations.ZeroMemory(content);
            throw;
        }
    }

    private static IReadOnlyDictionary<string, bool> Capabilities(ICurrentConnection connection) =>
        new Dictionary<string, bool>
        {
            ["onPremisesAssemblyOptions"] = connection.Context is OnPremisesConnectionContext
        };

    private static PluginAssemblyMutationService CreateMutationService(HttpContext context) => new(
        context.RequestServices.GetRequiredService<IPluginAssemblyInspector>(),
        context.RequestServices.GetRequiredService<PluginRegistrationPreflightService>(),
        context.RequestServices.GetRequiredService<PluginRegistrationCatalogService>());

    private sealed record AssemblyMutationUpload(
        AssemblyMutationDraftDto Draft,
        string? PlanToken,
        byte[] Content)
    {
        public void ZeroContent() => CryptographicOperations.ZeroMemory(Content);
    }
}
