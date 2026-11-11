using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.AttributeExplorer;
using PowerTools.API.Tools.Fetch;

namespace PowerTools.API.Tools.CommunityToolApi;

/// <summary>
/// Generic Dataverse operations for community tools. Carries no permission logic and does not
/// know which tool called; the desktop shell checks permissions before calling.
/// </summary>
public sealed partial class CommunityToolService(ICommunityToolClient client)
{
    public const int DefaultPageSize = 500;
    public const int MaxPageSize = 5000;
    public const int MaxBatchOperations = 200;

    /// <summary>Messages that can carry other requests past the host's permission check.</summary>
    private static readonly HashSet<string> WrapperMessages = new(["ExecuteMultiple", "ExecuteTransaction", "ExecuteAsync"], StringComparer.OrdinalIgnoreCase);

    // ── Data ─────────────────────────────────────────────────────────────────

    public Task<CommunityToolResult<DataRecordDto>> RetrieveAsync(RetrieveRecordRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var table = RequiredTable(request.Table);
            var id = RequiredId(request.Id, "id");
            if (request.Columns is not { Count: > 0 } columns)
                throw new CommunityToolValueException("columns must list at least one column");
            if (columns.Any(string.IsNullOrWhiteSpace))
                throw new CommunityToolValueException("columns must not contain empty names.");

            var entity = await client.RetrieveAsync(table, id, new ColumnSet(columns.Select(column => column.Trim()).ToArray()), cancellationToken);
            return ToRecord(entity);
        });

    public Task<CommunityToolResult<FetchPageDto>> FetchAsync(FetchRecordsRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var page = request.Page ?? 1;
            if (page < 1)
                throw new CommunityToolValueException("page must be 1 or greater.");
            var pageSize = request.PageSize ?? DefaultPageSize;
            if (pageSize < 1)
                throw new CommunityToolValueException("pageSize must be 1 or greater.");
            pageSize = Math.Min(pageSize, MaxPageSize);

            var doc = ParseFetchXml(request.FetchXml);
            // A query with "top" cannot be combined with paging attributes.
            var fetchXml = doc.Root!.Attribute("top") is null
                ? FetchXmlPaging.Apply(doc, page, pageSize, request.PagingCookie)
                : doc.Root.ToString(SaveOptions.DisableFormatting);

            var result = await client.RetrieveMultipleAsync(fetchXml, cancellationToken);
            return new FetchPageDto(
                result.Entities.Select(ToRecord).ToList(),
                result.MoreRecords,
                result.MoreRecords ? result.PagingCookie : null,
                page);
        });

    public Task<CommunityToolResult<CreatedRecordDto>> CreateAsync(CreateRecordRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var entity = CommunityToolValueCodec.DecodeEntity(RequiredTable(request.Table), null, request.Values, "values");
            var id = await client.CreateAsync(entity, cancellationToken);
            return new CreatedRecordDto(CommunityToolValueCodec.Id(id));
        });

    public Task<CommunityToolResult<EmptyResultDto>> UpdateAsync(UpdateRecordRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var entity = CommunityToolValueCodec.DecodeEntity(
                RequiredTable(request.Table),
                RequiredId(request.Id, "id"),
                request.Values,
                "values");
            await client.UpdateAsync(entity, cancellationToken);
            return new EmptyResultDto();
        });

    public Task<CommunityToolResult<EmptyResultDto>> DeleteAsync(DeleteRecordRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            await client.DeleteAsync(RequiredTable(request.Table), RequiredId(request.Id, "id"), cancellationToken);
            return new EmptyResultDto();
        });

    public Task<CommunityToolResult<EmptyResultDto>> AssociateAsync(RelateRecordsRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var (table, id, relationship, related) = Relate(request);
            await client.AssociateAsync(table, id, relationship, related, cancellationToken);
            return new EmptyResultDto();
        });

    public Task<CommunityToolResult<EmptyResultDto>> DisassociateAsync(RelateRecordsRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            var (table, id, relationship, related) = Relate(request);
            await client.DisassociateAsync(table, id, relationship, related, cancellationToken);
            return new EmptyResultDto();
        });

    public Task<CommunityToolResult<ExecuteResultDto>> ExecuteAsync(ExecuteMessageRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            if (request.Message is not { } message || !MessageName().IsMatch(message))
                throw new CommunityToolValueException("message must be a Dataverse message name, such as WhoAmI.");

            if (WrapperMessages.Contains(message))
                throw new CommunityToolValueException($"{message} cannot be run by a community tool.");

            var organizationRequest = new OrganizationRequest(message);
            foreach (var (key, value) in request.Parameters ?? new Dictionary<string, JsonElement>())
                organizationRequest.Parameters[key] = CommunityToolValueCodec.Decode(value, $"parameters.{key}");

            var response = await client.ExecuteAsync(organizationRequest, cancellationToken);
            var results = (response.Results ?? new ParameterCollection())
                .ToDictionary(result => result.Key, result => CommunityToolValueCodec.Encode(result.Value));
            return new ExecuteResultDto(results);
        });

    public Task<CommunityToolResult<BatchResultDto>> BatchAsync(BatchRequest request, CancellationToken cancellationToken) =>
        Run(async () =>
        {
            if (request.Operations is not { Count: > 0 } operations)
                throw new CommunityToolValueException("operations must list at least one operation.");
            if (operations.Count > MaxBatchOperations)
                throw new CommunityToolValueException($"operations must list at most {MaxBatchOperations} operations.");

            var batch = new ExecuteMultipleRequest
            {
                Settings = new ExecuteMultipleSettings
                {
                    ContinueOnError = request.ContinueOnError,
                    ReturnResponses = true,
                },
                Requests = [],
            };
            for (var index = 0; index < operations.Count; index++)
                batch.Requests.Add(BatchOperation(operations[index], $"operations[{index}]"));

            var response = (ExecuteMultipleResponse)await client.ExecuteAsync(batch, cancellationToken);
            var items = response.Responses.ToDictionary(item => item.RequestIndex);
            var results = Enumerable.Range(0, operations.Count)
                .Select(index => items.TryGetValue(index, out var item)
                    ? BatchItem(item)
                    : new BatchItemResultDto(false, Error: CommunityToolFaults.NotRun()))
                .ToList();
            return new BatchResultDto(results);
        });

    // ── Metadata ─────────────────────────────────────────────────────────────

    public Task<CommunityToolResult<IReadOnlyList<TableInfoDto>>> GetTablesAsync(CancellationToken cancellationToken) =>
        Run<IReadOnlyList<TableInfoDto>>(
            async () => AttributeExplorerMapper.Tables(await client.RetrieveAllTablesAsync(cancellationToken))
                .Select(ToTableInfo)
                .ToList(),
            metadata: true);

    public Task<CommunityToolResult<TableInfoDto>> GetTableAsync(string table, CancellationToken cancellationToken) =>
        Run(
            async () => ToTableInfo(AttributeExplorerMapper.Table(
                await client.RetrieveTableAsync(RequiredTable(table), EntityFilters.Entity, cancellationToken))),
            metadata: true);

    public Task<CommunityToolResult<IReadOnlyList<ColumnInfoDto>>> GetColumnsAsync(string table, CancellationToken cancellationToken) =>
        Run<IReadOnlyList<ColumnInfoDto>>(
            async () =>
            {
                var metadata = await client.RetrieveTableAsync(RequiredTable(table), EntityFilters.Attributes, cancellationToken);
                return AttributeExplorerMapper.Attributes(metadata)
                    .Select(column => new ColumnInfoDto(
                        column.LogicalName,
                        column.DisplayName,
                        ColumnType(column),
                        column.IsCustom,
                        column.RequiredLevel,
                        column.Targets ?? []))
                    .ToList();
            },
            metadata: true);

    public Task<CommunityToolResult<IReadOnlyList<RelationshipInfoDto>>> GetRelationshipsAsync(string table, CancellationToken cancellationToken) =>
        Run<IReadOnlyList<RelationshipInfoDto>>(
            async () =>
            {
                var name = RequiredTable(table);
                var metadata = await client.RetrieveTableAsync(name, EntityFilters.Relationships, cancellationToken);
                var oneToMany = (metadata.OneToManyRelationships ?? [])
                    .OrderBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
                    .Select(relationship => OneToMany(relationship, "1:N"));
                var manyToOne = (metadata.ManyToOneRelationships ?? [])
                    .OrderBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
                    .Select(relationship => OneToMany(relationship, "N:1"));
                var manyToMany = (metadata.ManyToManyRelationships ?? [])
                    .OrderBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
                    .Select(relationship => ManyToMany(relationship, name));
                return oneToMany.Concat(manyToOne).Concat(manyToMany).ToList();
            },
            metadata: true);

    public Task<CommunityToolResult<IReadOnlyList<ChoiceDto>>> GetChoicesAsync(string table, string column, CancellationToken cancellationToken) =>
        Run<IReadOnlyList<ChoiceDto>>(
            async () =>
            {
                if (string.IsNullOrWhiteSpace(column))
                    throw new CommunityToolValueException("column is required.");

                var attribute = await client.RetrieveColumnAsync(RequiredTable(table), column.Trim(), cancellationToken);
                return attribute switch
                {
                    EnumAttributeMetadata choice => (choice.OptionSet?.Options ?? [])
                        .Where(option => option.Value is not null)
                        .Select(option => Choice(option.Value!.Value, option.Label))
                        .ToList(),
                    BooleanAttributeMetadata boolean =>
                    [
                        Choice(1, boolean.OptionSet?.TrueOption?.Label),
                        Choice(0, boolean.OptionSet?.FalseOption?.Label),
                    ],
                    _ => throw new CommunityToolValueException($"Column \"{column}\" is not a choice column."),
                };
            },
            metadata: true);

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static async Task<CommunityToolResult<T>> Run<T>(Func<Task<T>> action, bool metadata = false)
    {
        try
        {
            return CommunityToolResult<T>.Ok(await action());
        }
        catch (CommunityToolValueException ex)
        {
            return CommunityToolResult<T>.Fail(CommunityToolFaults.InvalidRequest(ex.Message));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return CommunityToolResult<T>.Fail(CommunityToolFaults.From(ex, metadata));
        }
    }

    private static DataRecordDto ToRecord(Entity entity) =>
        new(
            entity.LogicalName,
            CommunityToolValueCodec.Id(entity.Id),
            CommunityToolValueCodec.EncodeAttributes(entity),
            entity.FormattedValues.ToDictionary(value => value.Key, value => value.Value));

    private static string RequiredTable(string? table) =>
        string.IsNullOrWhiteSpace(table)
            ? throw new CommunityToolValueException("table is required.")
            : table.Trim();

    private static Guid RequiredId(string? id, string name) =>
        Guid.TryParse(id, out var value) && value != Guid.Empty
            ? value
            : throw new CommunityToolValueException($"{name} must be a GUID.");

    private static XDocument ParseFetchXml(string? fetchXml)
    {
        if (string.IsNullOrWhiteSpace(fetchXml))
            throw new CommunityToolValueException("fetchXml is required.");

        XDocument doc;
        try
        {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
            using var reader = XmlReader.Create(new StringReader(fetchXml), settings);
            doc = XDocument.Load(reader);
        }
        catch (XmlException ex)
        {
            throw new CommunityToolValueException($"Invalid FetchXML: {ex.Message}");
        }

        if (doc.Root?.Name.LocalName != "fetch")
            throw new CommunityToolValueException("Root element must be <fetch>.");
        if (doc.Root.Element("entity") is null)
            throw new CommunityToolValueException("<fetch> must contain an <entity> element.");
        return doc;
    }

    private static (string Table, Guid Id, Relationship Relationship, EntityReferenceCollection Related) Relate(RelateRecordsRequest request)
    {
        var table = RequiredTable(request.Table);
        var id = RequiredId(request.Id, "id");
        if (string.IsNullOrWhiteSpace(request.Relationship))
            throw new CommunityToolValueException("relationship is required.");
        if (request.Related is not { Count: > 0 } related)
            throw new CommunityToolValueException("related must list at least one record.");

        var references = new EntityReferenceCollection();
        for (var index = 0; index < related.Count; index++)
        {
            var item = related[index];
            if (string.IsNullOrWhiteSpace(item.LogicalName))
                throw new CommunityToolValueException($"related[{index}].logicalName is required.");
            references.Add(new EntityReference(item.LogicalName.Trim(), RequiredId(item.Id, $"related[{index}].id")));
        }

        return (table, id, new Relationship(request.Relationship.Trim()), references);
    }

    private static OrganizationRequest BatchOperation(BatchOperationDto operation, string path)
    {
        try
        {
            var table = RequiredTable(operation.Table);
            return operation.Op switch
            {
                "create" => new CreateRequest
                {
                    Target = CommunityToolValueCodec.DecodeEntity(table, null, operation.Values, $"{path}.values"),
                },
                "update" => new UpdateRequest
                {
                    Target = CommunityToolValueCodec.DecodeEntity(table, RequiredId(operation.Id, "id"), operation.Values, $"{path}.values"),
                },
                "delete" => new DeleteRequest { Target = new EntityReference(table, RequiredId(operation.Id, "id")) },
                _ => throw new CommunityToolValueException("op must be create, update, or delete."),
            };
        }
        catch (CommunityToolValueException ex) when (!ex.Message.StartsWith(path, StringComparison.Ordinal))
        {
            throw new CommunityToolValueException($"{path}: {ex.Message}");
        }
    }

    private static BatchItemResultDto BatchItem(ExecuteMultipleResponseItem item)
    {
        if (item.Fault is not null)
            return new BatchItemResultDto(false, Error: CommunityToolFaults.FromItemFault(item.Fault));

        return item.Response is CreateResponse created
            ? new BatchItemResultDto(true, CommunityToolValueCodec.Id(created.id))
            : new BatchItemResultDto(true);
    }

    private static TableInfoDto ToTableInfo(TableDto table) =>
        new(
            table.LogicalName,
            table.DisplayName,
            table.EntitySetName,
            table.PrimaryIdAttribute,
            table.PrimaryNameAttribute,
            table.IsCustom);

    /// <summary>The attribute type name without its "Type" suffix, such as "String" or "MultiSelectPicklist".</summary>
    private static string ColumnType(AttributeDto column) =>
        column.AttributeTypeName is { Length: > 0 } name
            ? name.EndsWith("Type", StringComparison.Ordinal) && name.Length > 4 ? name[..^4] : name
            : column.AttributeType;

    private static RelationshipInfoDto OneToMany(OneToManyRelationshipMetadata relationship, string kind) =>
        new(
            relationship.SchemaName ?? "",
            kind,
            relationship.ReferencedEntity,
            relationship.ReferencingEntity,
            relationship.ReferencingAttribute);

    /// <summary>N:N has no referencing column; the requested table is reported as the referencing side.</summary>
    private static RelationshipInfoDto ManyToMany(ManyToManyRelationshipMetadata relationship, string table)
    {
        var (self, other) = string.Equals(relationship.Entity2LogicalName, table, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(relationship.Entity1LogicalName, table, StringComparison.OrdinalIgnoreCase)
                ? (relationship.Entity2LogicalName, relationship.Entity1LogicalName)
                : (relationship.Entity1LogicalName, relationship.Entity2LogicalName);
        return new RelationshipInfoDto(relationship.SchemaName ?? "", "N:N", other, self, null);
    }

    private static ChoiceDto Choice(int value, Label? label) =>
        new(value, AttributeExplorerMapper.LabelText(label) ?? value.ToString(CultureInfo.InvariantCulture));

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_]{0,199}$")]
    private static partial Regex MessageName();
}
