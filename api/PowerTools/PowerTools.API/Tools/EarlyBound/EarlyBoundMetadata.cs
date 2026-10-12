using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.EarlyBound;

/// <summary>Reads only the table and column metadata the code writer needs.</summary>
public static class EarlyBoundMetadata
{
    public static async Task<IReadOnlyList<EarlyBoundTableSummary>> TablesAsync(
        IOrganizationServiceAsync2 service,
        CancellationToken cancellationToken)
    {
        var query = new EntityQueryExpression
        {
            Properties = new MetadataPropertiesExpression(
                "LogicalName", "SchemaName", "DisplayName", "IsCustomEntity", "IsPrivate"),
        };
        var entities = await RetrieveAsync(service, query, cancellationToken);
        return entities
            .Where(entity => entity.IsPrivate != true)
            .Select(entity => new EarlyBoundTableSummary(
                entity.LogicalName,
                entity.SchemaName ?? entity.LogicalName,
                Label(entity.DisplayName) ?? entity.LogicalName,
                entity.IsCustomEntity == true))
            .OrderBy(table => table.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static async Task<IReadOnlyList<EarlyBoundTable>> TablesWithColumnsAsync(
        IOrganizationServiceAsync2 service,
        IReadOnlyCollection<string> logicalNames,
        CancellationToken cancellationToken)
    {
        var criteria = new MetadataFilterExpression(LogicalOperator.And);
        criteria.Conditions.Add(new MetadataConditionExpression(
            "LogicalName", MetadataConditionOperator.In, logicalNames.ToArray()));
        var query = new EntityQueryExpression
        {
            Criteria = criteria,
            Properties = new MetadataPropertiesExpression(
                "LogicalName", "SchemaName", "DisplayName", "Attributes"),
            AttributeQuery = new AttributeQueryExpression
            {
                Properties = new MetadataPropertiesExpression(
                    "LogicalName", "SchemaName", "DisplayName", "AttributeType", "AttributeTypeName",
                    "AttributeOf", "IsPrimaryId", "IsValidForCreate", "IsValidForUpdate", "OptionSet"),
            },
        };
        var entities = await RetrieveAsync(service, query, cancellationToken);
        return entities.Select(ToTable).ToList();
    }

    public static EarlyBoundTable ToTable(EntityMetadata entity) => new(
        entity.LogicalName,
        entity.SchemaName ?? entity.LogicalName,
        Label(entity.DisplayName) ?? entity.LogicalName,
        (entity.Attributes ?? [])
            .Select(ToColumn)
            .OfType<EarlyBoundColumn>()
            .ToList());

    /// <summary>Returns null for columns early-bound code leaves out, such as name helper columns.</summary>
    public static EarlyBoundColumn? ToColumn(AttributeMetadata attribute)
    {
        if (!string.IsNullOrEmpty(attribute.AttributeOf)) return null;
        if (string.IsNullOrEmpty(attribute.LogicalName)) return null;

        var kind = Kind(attribute);
        if (kind is null) return null;

        return new EarlyBoundColumn(
            attribute.LogicalName,
            attribute.SchemaName ?? attribute.LogicalName,
            Label(attribute.DisplayName) ?? attribute.LogicalName,
            kind.Value,
            IsPrimaryId: attribute.IsPrimaryId == true,
            IsReadOnly: attribute.IsValidForCreate != true && attribute.IsValidForUpdate != true,
            Options: Options(attribute));
    }

    private static EarlyBoundColumnKind? Kind(AttributeMetadata attribute)
    {
        if (attribute is MultiSelectPicklistAttributeMetadata) return EarlyBoundColumnKind.Choices;
        if (attribute is ImageAttributeMetadata) return EarlyBoundColumnKind.Image;
        if (attribute.AttributeTypeName == AttributeTypeDisplayName.MultiSelectPicklistType)
            return EarlyBoundColumnKind.Choices;

        return attribute.AttributeType switch
        {
            AttributeTypeCode.String or AttributeTypeCode.Memo or AttributeTypeCode.EntityName =>
                EarlyBoundColumnKind.String,
            AttributeTypeCode.Integer => EarlyBoundColumnKind.Integer,
            AttributeTypeCode.BigInt => EarlyBoundColumnKind.BigInt,
            AttributeTypeCode.Decimal => EarlyBoundColumnKind.Decimal,
            AttributeTypeCode.Double => EarlyBoundColumnKind.Double,
            AttributeTypeCode.Money => EarlyBoundColumnKind.Money,
            AttributeTypeCode.Boolean => EarlyBoundColumnKind.Boolean,
            AttributeTypeCode.DateTime => EarlyBoundColumnKind.DateTime,
            AttributeTypeCode.Uniqueidentifier => EarlyBoundColumnKind.Guid,
            AttributeTypeCode.Lookup or AttributeTypeCode.Customer or AttributeTypeCode.Owner =>
                EarlyBoundColumnKind.Lookup,
            AttributeTypeCode.Picklist or AttributeTypeCode.State or AttributeTypeCode.Status =>
                EarlyBoundColumnKind.Choice,
            AttributeTypeCode.PartyList => EarlyBoundColumnKind.PartyList,
            _ => null,
        };
    }

    private static IReadOnlyList<EarlyBoundOption>? Options(AttributeMetadata attribute)
    {
        var options = attribute switch
        {
            EnumAttributeMetadata choice => choice.OptionSet?.Options,
            _ => null,
        };
        return options?
            .Where(option => option.Value.HasValue)
            .Select(option => new EarlyBoundOption(option.Value!.Value, Label(option.Label) ?? ""))
            .ToList();
    }

    private static string? Label(Label? label)
    {
        var text = label?.UserLocalizedLabel?.Label
            ?? label?.LocalizedLabels?.FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.Label))?.Label;
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static async Task<EntityMetadataCollection> RetrieveAsync(
        IOrganizationServiceAsync2 service,
        EntityQueryExpression query,
        CancellationToken cancellationToken)
    {
        var request = new RetrieveMetadataChangesRequest { Query = query };
        var response = (RetrieveMetadataChangesResponse)await service.ExecuteAsync(request, cancellationToken);
        return response.EntityMetadata;
    }
}
