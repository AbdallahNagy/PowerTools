using System.Security;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.Fetch.Dtos;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Fetch;

public static class FetchEndpoints
{
    private const int MaxPageSize = 250;

    public static IEndpointRouteBuilder MapFetchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fetch")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapPost("/execute", async (
            ExecuteFetchRequest req,
            HttpContext ctx,
            DataverseClientFactory factory) =>
        {
            // ── Validate page size ────────────────────────────────────────────
            var pageSize = Math.Clamp(req.PageSize, 1, MaxPageSize);

            // ── Parse & validate FetchXML (XXE-safe) ─────────────────────────
            XDocument doc;
            try
            {
                var settings = new XmlReaderSettings
                {
                    DtdProcessing = DtdProcessing.Prohibit,
                    XmlResolver = null
                };
                using var reader = XmlReader.Create(new StringReader(req.FetchXml), settings);
                doc = XDocument.Load(reader);
            }
            catch (XmlException ex)
            {
                return Results.BadRequest(new { error = $"Invalid FetchXML: {ex.Message}" });
            }

            var fetchEl = doc.Root;
            if (fetchEl?.Name.LocalName != "fetch")
                return Results.BadRequest(new { error = "Root element must be <fetch>" });

            var entityEl = fetchEl.Element("entity");
            if (entityEl is null)
                return Results.BadRequest(new { error = "<fetch> must contain an <entity> element" });

            // ── Inject paging attributes ──────────────────────────────────────
            fetchEl.SetAttributeValue("page", req.Page);
            fetchEl.SetAttributeValue("count", pageSize);

            if (req.PagingCookie is not null)
                fetchEl.SetAttributeValue("paging-cookie", SecurityElement.Escape(req.PagingCookie));

            var finalXml = fetchEl.ToString(SaveOptions.DisableFormatting);

            // ── Execute ───────────────────────────────────────────────────────
            var svc = ctx.CreateDataverseClient(factory);

            try
            {
                var result = await svc.RetrieveMultipleAsync(new FetchExpression(finalXml));

                // Collect the attribute names actually returned across all entities
                var columns = result.Entities
                    .SelectMany(e => e.Attributes.Keys)
                    .Distinct()
                    .OrderBy(k => k)
                    .ToList();

                var records = result.Entities
                    .Select(e =>
                    {
                        var dict = new Dictionary<string, object?> { ["id"] = e.Id.ToString() };
                        foreach (var key in e.Attributes.Keys)
                            dict[key] = DataverseValueFormatter.Format(e[key]);
                        return dict;
                    })
                    .ToList();

                return Results.Ok(new
                {
                    records,
                    columns,
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
