using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.Fetch.Dtos;

namespace PowerTools.API.Tools.Fetch;

public static class FetchEndpoints
{
    public static IEndpointRouteBuilder MapFetchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fetch")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapPost("/execute", async (
            ExecuteFetchRequest req,
            HttpContext ctx,
            DataverseClientFactory factory) =>
        {
            var prepared = FetchXmlPreparation.Prepare(req);
            if (!prepared.IsValid)
                return Results.BadRequest(new { error = prepared.Error });

            var svc = ctx.CreateDataverseClient(factory);

            try
            {
                var result = await svc.RetrieveMultipleAsync(new FetchExpression(prepared.FetchXml));
                var projected = FetchResultProjector.Project(result.Entities, prepared.ValueMode);

                return Results.Ok(new
                {
                    records = projected.Records,
                    columns = projected.Columns,
                    columnTypes = projected.ColumnTypes,
                    moreRecords = result.MoreRecords,
                    pagingCookie = result.PagingCookie,
                    totalEstimate = result.TotalRecordCount >= 0 ? result.TotalRecordCount : (int?)null
                });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = DataverseErrorFormatter.Format(ex) });
            }
        });

        return app;
    }
}
