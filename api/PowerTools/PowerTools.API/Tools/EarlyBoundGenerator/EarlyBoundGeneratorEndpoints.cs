using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

public static class EarlyBoundGeneratorEndpoints
{
    public static IEndpointRouteBuilder MapEarlyBoundGeneratorEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/early-bound-generator")
            .AddEndpointFilter<DataverseContextFilter>();

        // Every table logical name, including intersect and private tables that pac also generates.
        // The renderer expands wildcards and checks names against this list.
        group.MapGet("/tables", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            Results.Ok(new TableNamesResponse(await ReadTableNamesAsync(ctx.CreateDataverseClient(factory), ct))));

        group.MapGet("/folder", (string? path) =>
        {
            if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
                return Problem("invalid", "The output folder must be a full path.", StatusCodes.Status400BadRequest);
            return Results.Ok(EarlyBoundGeneratorFolder.Inspect(path));
        });

        group.MapPost("/jobs", async (
            GenerationSettingsDto body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IEarlyBoundGeneratorJobStore store,
            CancellationToken ct) =>
        {
            var settings = EarlyBoundGeneratorValidation.Normalize(body);
            var problems = EarlyBoundGeneratorValidation.Validate(settings);
            if (problems.Count > 0)
            {
                return Results.Json(
                    new { code = "invalid", message = problems[0].Message, problems },
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (settings.EntityNamesFilter.Count > 0)
            {
                var known = await ReadTableNamesAsync(ctx.CreateDataverseClient(factory), ct);
                var unknown = EarlyBoundGeneratorValidation.UnknownTables(settings.EntityNamesFilter, known);
                if (unknown.Count > 0)
                {
                    var message = $"These tables were not found in the environment: {string.Join(", ", unknown)}.";
                    return Results.Json(
                        new
                        {
                            code = "invalid",
                            message,
                            problems = new[] { new ValidationProblemDto("entityNamesFilter", message) },
                        },
                        statusCode: StatusCodes.Status400BadRequest);
                }
            }

            var job = store.TryEnqueue(settings, ctx.GetDataverseConnectionContext());
            return job is null
                ? Problem(
                    "busy",
                    "Another generation is running. Wait for it to finish, then select Generate again.",
                    StatusCodes.Status409Conflict)
                : Results.Ok(new JobStartedResponse(job.Id));
        });

        group.MapGet("/jobs/{jobId:guid}", (Guid jobId, IEarlyBoundGeneratorJobStore store) =>
            store.Get(jobId) is { } job ? Results.Ok(job.ToDto()) : Results.NotFound());

        return app;
    }

    public static async Task<IReadOnlyList<string>> ReadTableNamesAsync(
        IOrganizationServiceAsync2 service,
        CancellationToken ct)
    {
        var response = (RetrieveAllEntitiesResponse)await service.ExecuteAsync(
            new RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity, RetrieveAsIfPublished = false },
            ct);

        return response.EntityMetadata
            .Select(entity => entity.LogicalName)
            .Where(name => !string.IsNullOrEmpty(name))
            .Order(StringComparer.Ordinal)
            .ToList();
    }

    private static IResult Problem(string code, string message, int status) =>
        Results.Json(new { code, message }, statusCode: status);
}
