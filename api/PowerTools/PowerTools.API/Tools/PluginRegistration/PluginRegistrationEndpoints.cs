using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationEndpoints
{
    public static IEndpointRouteBuilder MapPluginRegistrationEndpoints(
        this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/plugin-registration")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/capabilities", (CapabilitiesService capabilities) =>
            Results.Ok(capabilities.Get()));

        group.MapGet("/catalog", async (CatalogService catalog, CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await catalog.GetAsync(ct))));

        group.MapGet("/step-options", async (StepOptionsService options, CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await options.GetAsync(ct))));

        group.MapPost("/steps", async (StepDraftDto draft, StepService steps, CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await steps.CreateAsync(draft, ct))));

        group.MapPost("/steps/{id:guid}/update", async (
            Guid id,
            StepDraftDto draft,
            StepService steps,
            CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await steps.UpdateAsync(id, draft, ct))));

        group.MapPost("/steps/{id:guid}/enable", async (
            Guid id,
            StepService steps,
            CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await steps.SetEnabledAsync(id, true, ct))));

        group.MapPost("/steps/{id:guid}/disable", async (
            Guid id,
            StepService steps,
            CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await steps.SetEnabledAsync(id, false, ct))));

        group.MapPost("/images", async (ImageDraftDto draft, ImageService images, CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await images.CreateAsync(draft, ct))));

        group.MapPost("/images/{id:guid}/update", async (
            Guid id,
            ImageDraftDto draft,
            ImageService images,
            CancellationToken ct) =>
            await ExecuteAsync(async () => Results.Ok(await images.UpdateAsync(id, draft, ct))));

        group.MapPost("/assemblies/analyze", async (
            HttpRequest request,
            AssemblyService assemblies,
            CancellationToken ct) =>
            await ExecuteAsync(async () =>
            {
                var file = RequireAssembly(request);
                await using var stream = file.OpenReadStream();
                return Results.Ok(await assemblies.AnalyzeAsync(
                    stream,
                    file.FileName,
                    file.Length,
                    ct));
            }))
            .DisableAntiforgery();

        group.MapPost("/assemblies", async (
            HttpRequest request,
            AssemblyService assemblies,
            CapabilitiesService capabilities,
            CancellationToken ct) =>
            await ExecuteAsync(async () =>
            {
                var file = RequireAssembly(request);
                await using var stream = file.OpenReadStream();
                return Results.Ok(await assemblies.RegisterAsync(
                    stream,
                    file.FileName,
                    file.Length,
                    new AssemblyRegisterRequest(
                        ParseFormInt(request, "isolationMode"),
                        ParseFormInt(request, "sourceType")),
                    capabilities.Get(),
                    ct));
            }))
            .DisableAntiforgery();

        group.MapPost("/assemblies/{id:guid}/update", async (
            Guid id,
            HttpRequest request,
            AssemblyService assemblies,
            CancellationToken ct) =>
            await ExecuteAsync(async () =>
            {
                var file = RequireAssembly(request);
                await using var stream = file.OpenReadStream();
                return Results.Ok(await assemblies.UpdateAsync(
                    id,
                    stream,
                    file.FileName,
                    file.Length,
                    ct));
            }))
            .DisableAntiforgery();

        return app;
    }

    private static IFormFile RequireAssembly(HttpRequest request)
    {
        var file = request.Form.Files.GetFile("assembly");
        if (file is null || file.Length <= 0)
        {
            throw RegistrationException.Validation([
                new RegistrationProblem(
                    "assembly",
                    AssemblyInspectionValidationCodes.FileRequired,
                    "An assembly file is required."),
            ]);
        }

        return file;
    }

    private static int ParseFormInt(HttpRequest request, string field)
    {
        var raw = request.Form[field].ToString();
        if (!int.TryParse(raw, out var value))
        {
            throw RegistrationException.Validation([
                new RegistrationProblem(field, "required", $"{field} is required."),
            ]);
        }

        return value;
    }

    internal static async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (RegistrationException ex)
        {
            return Results.Json(ex.Problem, statusCode: ex.StatusCode);
        }
        catch (AssemblyInspectionValidationException ex)
        {
            return Results.Json(
                new ProblemResponse(
                    ex.Code,
                    ex.Message,
                    [new RegistrationProblem("assembly", ex.Code, ex.Message)]),
                statusCode: StatusCodes.Status400BadRequest);
        }
        catch (Exception ex)
        {
            return Results.Json(
                new ProblemResponse(
                    "dataverse_error",
                    DataverseErrorFormatter.Format(ex),
                    Array.Empty<RegistrationProblem>()),
                statusCode: StatusCodes.Status502BadGateway);
        }
    }
}
