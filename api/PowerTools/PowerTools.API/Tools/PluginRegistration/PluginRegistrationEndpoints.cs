using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
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

        return app;
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
