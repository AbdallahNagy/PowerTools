using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.EarlyBound;

public static class EarlyBoundEndpoints
{
    public const int MaxTables = 500;

    public static IEndpointRouteBuilder MapEarlyBoundEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/early-bound")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/tables", async (HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
        {
            try
            {
                var tables = await EarlyBoundMetadata.TablesAsync(ctx.CreateDataverseClient(factory), ct);
                return Results.Ok(new EarlyBoundTablesResponse(tables));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Problem(DataverseErrorFormatter.Format(ex));
            }
        });

        group.MapPost("/generate", async (
            EarlyBoundGenerateRequest body,
            HttpContext ctx,
            DataverseClientFactory factory,
            CancellationToken ct) =>
        {
            var ns = string.IsNullOrWhiteSpace(body.Namespace)
                ? EarlyBoundCodeWriter.DefaultNamespace
                : body.Namespace.Trim();
            if (!EarlyBoundCodeWriter.IsValidNamespace(ns))
                return Problem("Enter a valid C# namespace, for example Contoso.Model.");

            var names = (body.Tables ?? [])
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name.Trim().ToLowerInvariant())
                .Distinct()
                .ToList();
            if (names.Count == 0)
                return Problem("Select at least one table.");
            if (names.Count > MaxTables)
                return Problem($"Select {MaxTables} tables or fewer.");

            try
            {
                var tables = await EarlyBoundMetadata.TablesWithColumnsAsync(
                    ctx.CreateDataverseClient(factory), names, ct);
                if (tables.Count == 0)
                    return Problem("None of the selected tables were found in this environment.");

                var code = EarlyBoundCodeWriter.Write(ns, tables);
                return Results.Ok(new EarlyBoundGenerateResponse("Entities.cs", code, tables.Count));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Problem(DataverseErrorFormatter.Format(ex));
            }
        });

        return app;
    }

    private static IResult Problem(string message) =>
        Results.BadRequest(new { message });
}
