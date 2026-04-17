using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Filters;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

public static class MetadataEndpoints
{
    public static IEndpointRouteBuilder MapMetadataEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/migration")
            .RequireAuthorization()
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/entities", async (HttpContext ctx, DataverseClientFactory factory) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            var request = new RetrieveAllEntitiesRequest
            {
                EntityFilters = EntityFilters.Entity,
                RetrieveAsIfPublished = false
            };

            var response = (RetrieveAllEntitiesResponse)await svc.ExecuteAsync(request);

            var entities = response.EntityMetadata
                .Where(e => e.IsIntersect == false && e.IsPrivate == false)
                .OrderBy(e => e.LogicalName)
                .Select(e => new
                {
                    logicalName = e.LogicalName,
                    displayName = e.DisplayName?.UserLocalizedLabel?.Label ?? e.LogicalName,
                    primaryIdAttribute = e.PrimaryIdAttribute,
                    primaryNameAttribute = e.PrimaryNameAttribute,
                    isCustom = e.IsCustomEntity == true
                });

            return Results.Ok(entities);
        });

        group.MapGet("/entities/{logicalName}/attributes", async (
            string logicalName,
            HttpContext ctx,
            DataverseClientFactory factory) =>
        {
            var svc = ctx.CreateDataverseClient(factory);

            var request = new RetrieveEntityRequest
            {
                LogicalName = logicalName,
                EntityFilters = EntityFilters.Attributes,
                RetrieveAsIfPublished = false
            };

            try
            {
                var response = (RetrieveEntityResponse)await svc.ExecuteAsync(request);
                var attrs = response.EntityMetadata.Attributes
                    .Where(a => a.AttributeOf is null)
                    .OrderBy(a => a.LogicalName)
                    .Select(a => new
                    {
                        logicalName = a.LogicalName,
                        displayName = a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
                        attributeType = a.AttributeType?.ToString() ?? "Unknown",
                        isPrimaryId = a.IsPrimaryId == true,
                        isCustomAttribute = a.IsCustomAttribute == true,
                        requiredLevel = a.RequiredLevel?.Value.ToString() ?? "None",
                        isValidForCreate = a.IsValidForCreate == true,
                        isValidForUpdate = a.IsValidForUpdate == true
                    });

                return Results.Ok(attrs);
            }
            catch (Exception ex)
            {
                return Results.BadRequest(DataverseErrorFormatter.Format(ex));
            }
        });

        return app;
    }
}
