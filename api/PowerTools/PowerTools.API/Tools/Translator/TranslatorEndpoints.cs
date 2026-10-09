using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Translator;

public static class TranslatorEndpoints
{
    public static IEndpointRouteBuilder MapTranslatorEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/translator")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/languages", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetLanguagesAsync(ct)));

        group.MapGet("/tables", async (Guid? solutionId, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetTablesAsync(solutionId, ct)));

        group.MapGet("/solutions", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetSolutionsAsync(ct)));

        group.MapGet("/publishers", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetPublishersAsync(ct)));

        group.MapPost("/labels/query", async (
            LabelQueryBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).QueryLabelsAsync(body, ct)));

        group.MapPost("/labels/apply", async (
            ApplyBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            ITranslatorJobStore store,
            CancellationToken ct) =>
        {
            var prepared = await Service(ctx, factory).PrepareApplyAsync(body, ct);
            if (prepared.Problem is not null) return ToHttp(prepared);

            var jobId = store.Save(prepared.Value!, ctx.GetDataverseConnectionContext());
            return Results.Ok(new ApplyStartedResponse(jobId));
        });

        group.MapGet("/jobs/{jobId:guid}", (Guid jobId, ITranslatorJobStore store) =>
            store.Get(jobId) is { } job ? Results.Ok(job.ToDto()) : Results.NotFound());

        group.MapPost("/publish", async (
            PublishBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            ITranslatorDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).PublishAsync(body, ct)));

        return app;
    }

    private static TranslatorService Service(
        HttpContext ctx,
        DataverseClientFactory factory,
        ITranslatorDelay? delay = null) =>
        new(new DataverseTranslatorClient(ctx.CreateDataverseClient(factory)), delay);

    private static IResult ToHttp<T>(TranslatorResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
