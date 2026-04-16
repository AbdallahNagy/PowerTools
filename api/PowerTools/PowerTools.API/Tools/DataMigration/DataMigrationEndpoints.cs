using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

public static class DataMigrationEndpoints
{
    public static IEndpointRouteBuilder MapDataMigrationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .RequireAuthorization()
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/accounts", async (HttpContext ctx, DataverseClientFactory factory) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            var query = new QueryExpression("account")
            {
                ColumnSet = new ColumnSet("name", "emailaddress1"),
                TopCount = 10
            };

            var results = await svc.RetrieveMultipleAsync(query);
            var accounts = results.Entities.Select(e => new
            {
                Id = e.Id,
                Name = e.GetAttributeValue<string>("name"),
                Email = e.GetAttributeValue<string>("emailaddress1")
            });

            return Results.Ok(accounts);
        }).WithName("GetAccounts");

        return app;
    }
}
