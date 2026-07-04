using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Utils;

namespace PowerTools.API.Tools.Metadata;

public static class MetadataEndpoints
{
    public static IEndpointRouteBuilder MapMetadataEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/metadata")
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
                .OrderBy(e => e.DisplayName?.UserLocalizedLabel?.Label ?? e.LogicalName)
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
                    .OrderBy(a => a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName)
                    .Select(a => new
                    {
                        logicalName = a.LogicalName,
                        displayName = a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
                        attributeType = a.AttributeType?.ToString() ?? "Unknown",
                        isPrimaryId = a.IsPrimaryId == true,
                        isCustomAttribute = a.IsCustomAttribute == true,
                        requiredLevel = a.RequiredLevel?.Value.ToString() ?? "None",
                        isValidForCreate = a.IsValidForCreate == true,
                        isValidForUpdate = a.IsValidForUpdate == true,
                        targets = GetTargets(a),
                        optionSet = GetOptions(a),
                        format = GetFormat(a)
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

    private static string[]? GetTargets(AttributeMetadata a) =>
        a is LookupAttributeMetadata lookup ? lookup.Targets : null;

    private static object[]? GetOptions(AttributeMetadata a)
    {
        OptionSetMetadataBase? optionSet = a switch
        {
            PicklistAttributeMetadata p => p.OptionSet,
            StateAttributeMetadata s    => s.OptionSet,
            StatusAttributeMetadata st  => st.OptionSet,
            BooleanAttributeMetadata b  => null, // handled separately below
            _                           => null
        };

        if (optionSet is OptionSetMetadata osm)
        {
            return osm.Options
                .Select(o => (object)new
                {
                    value = o.Value,
                    label = o.Label?.UserLocalizedLabel?.Label ?? o.Value?.ToString() ?? ""
                })
                .ToArray();
        }

        if (a is BooleanAttributeMetadata b2)
        {
            return
            [
                new { value = 1, label = b2.OptionSet?.TrueOption?.Label?.UserLocalizedLabel?.Label ?? "Yes" },
                new { value = 0, label = b2.OptionSet?.FalseOption?.Label?.UserLocalizedLabel?.Label ?? "No" }
            ];
        }

        return null;
    }

    private static string? GetFormat(AttributeMetadata a) => a switch
    {
        StringAttributeMetadata s  => s.Format?.ToString(),
        MemoAttributeMetadata   _  => "TextArea",
        DateTimeAttributeMetadata d => d.Format?.ToString(),
        _                          => null
    };
}
