using System.Security.Cryptography;
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
                    + MultipartRequestOverheadBytes
            })
            .WithName("AnalyzePluginAssembly");

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
            if (file is null || form.Files.Count != 1)
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
}
