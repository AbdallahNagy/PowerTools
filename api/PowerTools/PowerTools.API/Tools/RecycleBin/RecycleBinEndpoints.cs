using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.RecycleBin;

public static class RecycleBinEndpoints
{
    public static IEndpointRouteBuilder MapRecycleBinEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/recycle-bin")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/status", async (
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).GetStatusAsync(ct)));

        group.MapGet("/tables", async (
            string? source,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).GetTablesAsync(source, ct)));

        group.MapGet("/users", async (
            string? search,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).GetUsersAsync(search, ct)));

        group.MapPost("/deleted", async (
            DeletedBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).GetDeletedAsync(body, ct)));

        group.MapGet("/records/{table}/{id}", async (
            string table,
            string id,
            string? source,
            string? auditId,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).GetRecordAsync(table, id, source, auditId, ct)));

        group.MapPost("/bin-check", async (
            BinCheckBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).CheckBinAsync(body, ct)));

        group.MapPost("/restore", async (
            RestoreBody body,
            HttpContext ctx,
            DataverseClientFactory factory,
            IRecycleBinDelay delay,
            CancellationToken ct) =>
            ToHttp(await Service(ctx, factory, delay).RestoreAsync(body, ct)));

        return app;
    }

    private static RecycleBinService Service(HttpContext ctx, DataverseClientFactory factory, IRecycleBinDelay delay) =>
        new(
            new DataverseRecycleBinClient(ctx.CreateDataverseClient(factory)),
            delay,
            ctx.GetDataverseConnectionContext() is OnlineConnectionContext);

    private static IResult ToHttp<T>(RecycleBinResult<T> result) =>
        result.Problem is null
            ? Results.Ok(result.Value)
            : Results.Json(
                new { code = result.Problem.Code, message = result.Problem.Message },
                statusCode: result.Problem.Status);
}
