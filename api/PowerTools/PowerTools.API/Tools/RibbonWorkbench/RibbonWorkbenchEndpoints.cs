using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.RibbonWorkbench;

public static class RibbonWorkbenchEndpoints
{
    public static IEndpointRouteBuilder MapRibbonWorkbenchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ribbon-workbench")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/solutions", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetSolutionsAsync(ct)));

        group.MapPost("/load", async (LoadBody body, HttpContext ctx, DataverseClientFactory factory, IRibbonDelay delay, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).LoadAsync(body, ct)));

        group.MapGet("/base-ribbon", async (string? entity, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).GetBaseRibbonAsync(entity, ct)));

        group.MapPost("/validate", async (DiffsBody body, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            ToHttp(await Service(ctx, factory).ValidateAsync(body, ct)));

        group.MapPost("/publish", async (
            PublishBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRibbonPublishJobStore store,
            CancellationToken ct) =>
        {
            if (body.Diffs is not { Count: > 0 } diffs)
                return ToHttp(RibbonResult<object>.Fail(RibbonWorkbenchFaults.Invalid("There are no changes to publish.")));

            var checkedDiffs = await Service(ctx, factory).ValidateAsync(
                new DiffsBody { SolutionUniqueName = body.SolutionUniqueName, Diffs = diffs },
                ct);
            if (checkedDiffs.Problem is not null) return ToHttp(checkedDiffs);
            if (checkedDiffs.Value!.Problems.Any(problem => problem.Severity == ProblemSeverities.Error))
            {
                return Results.Json(
                    new
                    {
                        code = RibbonWorkbenchFaults.ValidationCode,
                        message = "Fix the problems found, then publish again.",
                        problems = checkedDiffs.Value.Problems,
                    },
                    statusCode: StatusCodes.Status422UnprocessableEntity);
            }

            var prepared = new PreparedPublish(
                body.SolutionUniqueName!.Trim(),
                diffs,
                body.BaseHashes ?? []);
            var jobId = store.Save(prepared, ctx.GetDataverseConnectionContext());
            return Results.Ok(new PublishStartedResponse(jobId));
        });

        group.MapGet("/jobs/{jobId:guid}", (Guid jobId, IRibbonPublishJobStore store) =>
            store.Get(jobId) is { } job ? Results.Ok(job.ToDto()) : Results.NotFound());

        group.MapPost("/publish-again", async (
            PublishTargetsDto targets,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            if (targets.Entities.Count == 0 && !targets.ApplicationRibbon)
                return ToHttp(RibbonResult<object>.Fail(RibbonWorkbenchFaults.Invalid("There is nothing to publish.")));
            try
            {
                var client = new DataverseRibbonWorkbenchClient(ctx.CreateDataverseClient(factory));
                await client.PublishAsync(RibbonRequests.PublishXml(targets), ct);
                return Results.Ok(new PublishAgainResponse(PublishJobStatuses.Succeeded));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return ToHttp(RibbonResult<object>.Fail(RibbonWorkbenchFaults.From(ex)));
            }
        });

        return app;
    }

    private static RibbonWorkbenchService Service(HttpContext ctx, DataverseClientFactory factory, IRibbonDelay? delay = null) =>
        new(
            new DataverseRibbonWorkbenchClient(ctx.CreateDataverseClient(factory)),
            delay,
            ctx.GetDataverseConnectionContext() is OnlineConnectionContext);

    private static IResult ToHttp<T>(RibbonResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
