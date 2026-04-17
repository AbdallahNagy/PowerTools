using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

public record PreviewRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter = null,
    int PageSize = 50,
    string? PagingCookie = null,
    int Page = 1);

public static class PreviewEndpoints
{
    public static IEndpointRouteBuilder MapPreviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/migration")
            .RequireAuthorization()
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapPost("/preview", async (
            PreviewRequest req,
            HttpContext ctx,
            DataverseClientFactory factory) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            try
            {
                var fetchXml = BuildFetchXml(req);
                var result = await svc.RetrieveMultipleAsync(new FetchExpression(fetchXml));

                var records = result.Entities.Select(e =>
                {
                    var dict = new Dictionary<string, object?> { ["id"] = e.Id.ToString() };
                    foreach (var attr in req.Attributes)
                        dict[attr] = e.Contains(attr) ? FormatValue(e[attr]) : null;
                    return dict;
                }).ToList();

                return Results.Ok(new
                {
                    records,
                    pagingCookie = result.PagingCookie,
                    moreRecords = result.MoreRecords,
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

    private static string BuildFetchXml(PreviewRequest req)
    {
        var cookie = req.PagingCookie is not null
            ? $" paging-cookie=\"{System.Security.SecurityElement.Escape(req.PagingCookie)}\""
            : "";

        var attrs = string.Join("", req.Attributes.Select(a => $"<attribute name=\"{a}\" />"));
        var filter = string.IsNullOrWhiteSpace(req.FetchXmlFilter) ? "" : req.FetchXmlFilter;

        return $"<fetch page=\"{req.Page}\" count=\"{req.PageSize}\"{cookie}>" +
               $"<entity name=\"{req.EntityLogicalName}\">{attrs}{filter}</entity></fetch>";
    }

    private static object? FormatValue(object val) => val switch
    {
        Microsoft.Xrm.Sdk.EntityReference er => er.Name ?? er.Id.ToString(),
        Microsoft.Xrm.Sdk.OptionSetValue osv => osv.Value.ToString(),
        Microsoft.Xrm.Sdk.Money money => money.Value.ToString("F2"),
        _ => val?.ToString()
    };
}
