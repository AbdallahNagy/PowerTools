using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.RecycleBin;

public sealed record RecycleBinResult<T>(T? Value, RecycleBinProblem? Problem)
{
    public static RecycleBinResult<T> Ok(T value) => new(value, null);

    public static RecycleBinResult<T> Fail(RecycleBinProblem problem) => new(default, problem);
}

/// <summary>What an audit-log restore sends to Create, and the old state to put back afterwards.</summary>
public sealed record AuditCreatePlan(Entity Record, int? OldState, int? OldStatus);

/// <summary>
/// Finds deleted records and restores them, from the native Dataverse recycle bin (online only) or,
/// when the bin is off for a table, by recreating the record from its Delete audit entry.
/// </summary>
public sealed partial class RecycleBinService(IRecycleBinClient client, IRecycleBinDelay delay, bool online)
{
    public const string RestoreMessage = "Restore";
    public const int MaxRestoreItems = 100;
    public const int DefaultPageSize = 100;
    public const int MaxAttempts = 4;

    /// <summary>Tables that hold solution components; recreating them through Create bypasses solution layering.</summary>
    public static readonly IReadOnlySet<string> SolutionComponentTables = new HashSet<string>(StringComparer.Ordinal)
    {
        "workflow", "webresource", "savedquery", "systemform", "savedqueryvisualization", "sitemap", "appmodule",
        "pluginassembly", "plugintype", "sdkmessageprocessingstep", "sdkmessageprocessingstepimage", "role",
        "connectionreference", "environmentvariabledefinition", "environmentvariablevalue", "canvasapp",
        "customapi", "customapirequestparameter", "customapiresponseproperty", "solution", "solutioncomponent",
        "publisher", "activityparty",
    };

    /// <summary>Tables whose inactive states need their own message (CloseIncident, WinOpportunity and similar).</summary>
    public static readonly IReadOnlySet<string> SpecialStateTables = new HashSet<string>(StringComparer.Ordinal)
    {
        "incident", "opportunity", "quote", "salesorder", "invoice",
    };

    [GeneratedRegex("^[a-z][a-z0-9_]{0,127}$")]
    private static partial Regex LogicalNamePattern();

    // ── Status ───────────────────────────────────────────────────────────────

    public async Task<RecycleBinResult<StatusResponse>> GetStatusAsync(CancellationToken cancellationToken)
    {
        var bin = await BinStatusAsync(cancellationToken);
        var audit = await AuditStatusAsync(cancellationToken);
        return RecycleBinResult<StatusResponse>.Ok(new StatusResponse(bin, audit));
    }

    private async Task<SourceStatusDto> BinStatusAsync(CancellationToken cancellationToken)
    {
        if (!online)
            return new(SourceStates.Unavailable, "The recycle bin is available only in Dataverse online.", null);

        try
        {
            var rows = await client.RetrieveMultipleAsync(RecycleBinQueries.OrganizationConfig(), cancellationToken);
            var row = rows.Entities.FirstOrDefault();
            if (row is null)
                return new(SourceStates.Disabled, null, null);
            var days = row.GetAttributeValue<int?>("cleanupintervalindays");
            return new(SourceStates.Enabled, null, days is > 0 ? days : null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (RecycleBinFaults.IsPrivilegeDenied(ex))
                return new(SourceStates.Unavailable, "You do not have permission to read the recycle bin settings.", null);
            if (RecycleBinFaults.IsMissingTable(ex))
                return new(SourceStates.Unavailable, "The recycle bin is not available in this environment.", null);
            return new(SourceStates.Unavailable, RecycleBinFaults.From(ex).Message, null);
        }
    }

    private async Task<SourceStatusDto> AuditStatusAsync(CancellationToken cancellationToken)
    {
        Entity? org;
        try
        {
            org = await OrganizationAsync(true, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException && !RecycleBinFaults.IsPrivilegeDenied(ex))
        {
            // auditretentionperiodv2 does not exist on older on-premises versions.
            try
            {
                org = await OrganizationAsync(false, cancellationToken);
            }
            catch (Exception inner) when (inner is not OperationCanceledException)
            {
                return AuditUnavailable(inner);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return AuditUnavailable(ex);
        }

        if (org is null || org.GetAttributeValue<bool?>("isauditenabled") != true)
            return new(SourceStates.Disabled, null, null);
        var retention = org.GetAttributeValue<int?>("auditretentionperiodv2");
        return new(SourceStates.Enabled, null, retention is > 0 ? retention : null);
    }

    private static SourceStatusDto AuditUnavailable(Exception ex) =>
        RecycleBinFaults.IsPrivilegeDenied(ex)
            ? new(SourceStates.Unavailable, "You do not have permission to read the audit settings.", null)
            : new(SourceStates.Unavailable, RecycleBinFaults.From(ex).Message, null);

    private async Task<Entity?> OrganizationAsync(bool withRetention, CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveMultipleAsync(RecycleBinQueries.OrganizationAudit(withRetention), cancellationToken);
        return rows.Entities.FirstOrDefault();
    }

    // ── Tables ───────────────────────────────────────────────────────────────

    public async Task<RecycleBinResult<TablesResponse>> GetTablesAsync(string? source, CancellationToken cancellationToken)
    {
        if (source is not null && !RecycleBinSources.IsKnown(source))
            return Fail<TablesResponse>(RecycleBinFaults.BadRequest("UnknownSource", "Source must be bin or audit."));

        EntityMetadata[] metadata;
        try
        {
            var response = (RetrieveAllEntitiesResponse)await client.ExecuteAsync(
                new RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity, RetrieveAsIfPublished = false },
                cancellationToken);
            metadata = response.EntityMetadata;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<TablesResponse>(RecycleBinFaults.From(ex));
        }

        var audit = await AuditStatusAsync(cancellationToken);
        var auditOn = audit.State == SourceStates.Enabled;
        var ready = await ReadyTablesAsync(cancellationToken);

        var tables = metadata
            .Where(table => !string.IsNullOrEmpty(table.LogicalName) && !string.IsNullOrEmpty(table.PrimaryIdAttribute))
            .Select(table =>
            {
                var binEnabled = ready.TryGetValue(table.LogicalName, out var retention);
                var auditEnabled = auditOn && table.IsAuditEnabled?.Value == true && CanRestoreFromAudit(table);
                return new TableDto(
                    table.LogicalName,
                    DisplayName(table),
                    table.PrimaryIdAttribute,
                    string.IsNullOrEmpty(table.PrimaryNameAttribute) ? null : table.PrimaryNameAttribute,
                    binEnabled,
                    auditEnabled,
                    table.IsActivity == true,
                    binEnabled ? retention : null);
            })
            .Where(table => source switch
            {
                RecycleBinSources.Bin => table.BinEnabled,
                RecycleBinSources.Audit => table.AuditEnabled,
                _ => table.BinEnabled || table.AuditEnabled,
            })
            .OrderBy(table => table.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(table => table.LogicalName, StringComparer.Ordinal)
            .ToList();

        return RecycleBinResult<TablesResponse>.Ok(new TablesResponse(tables));
    }

    /// <summary>Tables ready in the recycle bin, with their effective retention in days. Empty when unknown.</summary>
    private async Task<Dictionary<string, int?>> ReadyTablesAsync(CancellationToken cancellationToken)
    {
        var ready = new Dictionary<string, int?>(StringComparer.Ordinal);
        if (!online)
            return ready;

        try
        {
            var org = await client.RetrieveMultipleAsync(RecycleBinQueries.OrganizationConfig(), cancellationToken);
            var orgRow = org.Entities.FirstOrDefault();
            if (orgRow is null)
                return ready;
            var orgDays = orgRow.GetAttributeValue<int?>("cleanupintervalindays");

            var rows = await client.RetrieveMultipleAsync(RecycleBinQueries.ReadyTables(), cancellationToken);
            foreach (var row in rows.Entities)
            {
                if (row.GetAttributeValue<AliasedValue>("table.logicalname")?.Value is not string name)
                    continue;
                if (name == RecycleBinQueries.OrganizationConfigName)
                    continue;
                var days = row.GetAttributeValue<int?>("cleanupintervalindays");
                ready[name] = days is > 0 ? days : orgDays is > 0 ? orgDays : null;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Privilege or availability problems mean "unknown"; /status reports why.
            ready.Clear();
        }

        return ready;
    }

    public static bool CanRestoreFromAudit(EntityMetadata table) =>
        table.IsIntersect != true
        && table.IsSolutionAware != true
        && table.IsPrivate != true
        && !SolutionComponentTables.Contains(table.LogicalName)
        && table.TableType is not ("Virtual" or "Elastic");

    public static string DisplayName(EntityMetadata table) =>
        table.DisplayName?.UserLocalizedLabel?.Label is { Length: > 0 } label
            ? label
            : table.DisplayName?.LocalizedLabels?.FirstOrDefault(item => !string.IsNullOrEmpty(item.Label))?.Label
              ?? table.LogicalName;

    // ── Users ────────────────────────────────────────────────────────────────

    public async Task<RecycleBinResult<UsersResponse>> GetUsersAsync(string? search, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await client.RetrieveMultipleAsync(RecycleBinQueries.Users(search), cancellationToken);
            var users = rows.Entities
                .Select(row => new UserDto(
                    row.Id.ToString("D"),
                    row.GetAttributeValue<string>("fullname") ?? row.Id.ToString("D"),
                    row.GetAttributeValue<bool?>("isdisabled") == true))
                .ToList();
            var top = string.IsNullOrWhiteSpace(search) ? RecycleBinQueries.MaxUsers : RecycleBinQueries.UserSearchTop;
            return RecycleBinResult<UsersResponse>.Ok(new UsersResponse(users, rows.MoreRecords || users.Count >= top));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<UsersResponse>(RecycleBinFaults.From(ex));
        }
    }

    // ── Deleted records ──────────────────────────────────────────────────────

    public async Task<RecycleBinResult<DeletedResponse>> GetDeletedAsync(DeletedBody? body, CancellationToken cancellationToken)
    {
        if (body is null || !RecycleBinSources.IsKnown(body.Source))
            return Fail<DeletedResponse>(RecycleBinFaults.BadRequest("UnknownSource", "Source must be bin or audit."));
        if (!IsLogicalName(body.Table))
            return Fail<DeletedResponse>(RecycleBinFaults.BadRequest("TableRequired", "Choose a table."));
        if (body.Source == RecycleBinSources.Bin && !online)
            return Fail<DeletedResponse>(BinUnavailable());

        var pageSize = Math.Clamp(body.PageSize ?? DefaultPageSize, 1, RecycleBinQueries.MaxPageSize);
        var page = Math.Max(body.Page ?? 1, 1);
        var table = body.Table!;

        DateTime from = default, to = default;
        Guid? userId = null;
        if (body.Source == RecycleBinSources.Audit)
        {
            if (!TryUtc(body.FromUtc, out from) || !TryUtc(body.ToUtc, out to))
                return Fail<DeletedResponse>(RecycleBinFaults.BadRequest("DatesRequired", "Choose a valid date range."));
            if (to <= from)
                return Fail<DeletedResponse>(RecycleBinFaults.BadRequest("DatesOutOfOrder", "To must be on or after From."));
            if (!string.IsNullOrWhiteSpace(body.DeletedByUserId))
            {
                if (!Guid.TryParse(body.DeletedByUserId, out var parsed))
                    return Fail<DeletedResponse>(RecycleBinFaults.BadRequest("InvalidUser", "The user id is not valid."));
                userId = parsed;
            }
        }

        try
        {
            var metadata = await TableMetadataAsync(table, EntityFilters.Entity, cancellationToken);
            return body.Source == RecycleBinSources.Bin
                ? RecycleBinResult<DeletedResponse>.Ok(
                    await BinPageAsync(metadata, pageSize, page, body.PagingCookie, cancellationToken))
                : RecycleBinResult<DeletedResponse>.Ok(
                    await AuditPageAsync(metadata, from, to, userId, pageSize, page, body.PagingCookie, cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<DeletedResponse>(RecycleBinFaults.From(ex));
        }
    }

    private async Task<DeletedResponse> BinPageAsync(
        EntityMetadata table,
        int pageSize,
        int page,
        string? pagingCookie,
        CancellationToken cancellationToken)
    {
        var primaryName = string.IsNullOrEmpty(table.PrimaryNameAttribute) ? null : table.PrimaryNameAttribute;
        var rows = await client.RetrieveMultipleAsync(
            RecycleBinQueries.BinPage(table.LogicalName, table.PrimaryIdAttribute, primaryName, pageSize, page, pagingCookie),
            cancellationToken);

        var ids = rows.Entities.Select(row => RecordId(row, table.PrimaryIdAttribute)).ToList();
        var deletions = table.IsAuditEnabled?.Value == true
            ? await DeletionsAsync(table.LogicalName, ids, cancellationToken)
            : new Dictionary<Guid, Entity>();

        var records = rows.Entities.Select((row, index) =>
        {
            var id = ids[index];
            deletions.TryGetValue(id, out var audit);
            var (userId, user, callingId, calling) = Users(audit);
            return new DeletedRecordDto(
                id.ToString("D"),
                id.ToString("D"),
                table.LogicalName,
                primaryName is null ? null : row.GetAttributeValue<string>(primaryName),
                audit?.GetAttributeValue<DateTime?>("createdon") is { } on ? RecycleBinQueries.Utc(on) : null,
                userId,
                user,
                callingId,
                calling,
                null,
                true);
        }).ToList();

        return new DeletedResponse(records, rows.PagingCookie, rows.MoreRecords, page);
    }

    /// <summary>
    /// The newest Delete audit entry for each recycle bin record, when the table is audited. A bin row's own
    /// modifiedon/modifiedby are the last update, not the deletion, so they are never used for this.
    /// </summary>
    private async Task<Dictionary<Guid, Entity>> DeletionsAsync(
        string table,
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken)
    {
        var deletions = new Dictionary<Guid, Entity>();
        if (ids.Count == 0)
            return deletions;
        try
        {
            var rows = await client.RetrieveMultipleAsync(RecycleBinQueries.AuditDeletesFor(table, ids), cancellationToken);
            foreach (var row in rows.Entities)
            {
                if (row.GetAttributeValue<EntityReference>("objectid") is { } reference)
                    deletions.TryAdd(reference.Id, row);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Audit read is optional here; without it the bin row has no deletion date or user.
            deletions.Clear();
        }

        return deletions;
    }

    private async Task<DeletedResponse> AuditPageAsync(
        EntityMetadata table,
        DateTime from,
        DateTime to,
        Guid? userId,
        int pageSize,
        int page,
        string? pagingCookie,
        CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveMultipleAsync(
            RecycleBinQueries.AuditDeletes(table.LogicalName, from, to, userId, pageSize, page, pagingCookie),
            cancellationToken);
        var details = await AuditDetailsAsync(rows.Entities.Select(row => row.Id).ToList(), cancellationToken);
        var primaryName = string.IsNullOrEmpty(table.PrimaryNameAttribute) ? null : table.PrimaryNameAttribute;

        var records = rows.Entities.Select((row, index) =>
        {
            var oldValue = details[index];
            var recordId = row.GetAttributeValue<EntityReference>("objectid")?.Id ?? oldValue?.Id ?? Guid.Empty;
            var (deletedById, deletedBy, callingId, calling) = Users(row);
            return new DeletedRecordDto(
                row.Id.ToString("D"),
                recordId.ToString("D"),
                table.LogicalName,
                primaryName is null ? null : oldValue?.GetAttributeValue<string>(primaryName),
                row.GetAttributeValue<DateTime?>("createdon") is { } on ? RecycleBinQueries.Utc(on) : null,
                deletedById,
                deletedBy,
                callingId,
                calling,
                row.Id.ToString("D"),
                oldValue is { Attributes.Count: > 0 });
        }).ToList();

        return new DeletedResponse(records, rows.PagingCookie, rows.MoreRecords, page);
    }

    /// <summary>One ExecuteMultiple of RetrieveAuditDetails for a page. A failed entry yields null.</summary>
    private async Task<Entity?[]> AuditDetailsAsync(IReadOnlyList<Guid> auditIds, CancellationToken cancellationToken)
    {
        var values = new Entity?[auditIds.Count];
        if (auditIds.Count == 0)
            return values;

        var request = new ExecuteMultipleRequest
        {
            Settings = new ExecuteMultipleSettings { ContinueOnError = true, ReturnResponses = true },
            Requests = [],
        };
        foreach (var id in auditIds)
            request.Requests.Add(new RetrieveAuditDetailsRequest { AuditId = id });

        var response = (ExecuteMultipleResponse)await WithRetryAsync(
            () => client.ExecuteAsync(request, cancellationToken),
            cancellationToken);
        foreach (var item in response.Responses)
        {
            if (item.Fault is null && item.Response is RetrieveAuditDetailsResponse details
                && item.RequestIndex >= 0 && item.RequestIndex < values.Length)
                values[item.RequestIndex] = OldValue(details.AuditDetail);
        }

        return values;
    }

    private static Entity? OldValue(AuditDetail? detail) => (detail as AttributeAuditDetail)?.OldValue;

    private static (string? Id, string? Name, string? CallingId, string? CallingName) Users(Entity? audit)
    {
        var user = audit?.GetAttributeValue<EntityReference>("userid");
        var calling = audit?.GetAttributeValue<EntityReference>("callinguserid");
        var showCalling = calling is not null && calling.Id != Guid.Empty && calling.Id != user?.Id;
        return (
            user?.Id.ToString("D"),
            user is null ? null : user.Name ?? user.Id.ToString("D"),
            showCalling ? calling!.Id.ToString("D") : null,
            showCalling ? calling!.Name ?? calling.Id.ToString("D") : null);
    }

    // ── Record details ───────────────────────────────────────────────────────

    public async Task<RecycleBinResult<RecordResponse>> GetRecordAsync(
        string table,
        string id,
        string? source,
        string? auditId,
        CancellationToken cancellationToken)
    {
        if (!RecycleBinSources.IsKnown(source))
            return Fail<RecordResponse>(RecycleBinFaults.BadRequest("UnknownSource", "Source must be bin or audit."));
        if (!IsLogicalName(table) || !Guid.TryParse(id, out var recordId))
            return Fail<RecordResponse>(RecycleBinFaults.BadRequest("InvalidRecord", "The table or record id is not valid."));

        try
        {
            if (source == RecycleBinSources.Bin)
            {
                if (!online)
                    return Fail<RecordResponse>(BinUnavailable());
                var metadata = await TableMetadataAsync(table, EntityFilters.Entity, cancellationToken);
                var rows = await client.RetrieveMultipleAsync(
                    RecycleBinQueries.BinRecord(table, metadata.PrimaryIdAttribute, recordId),
                    cancellationToken);
                var row = rows.Entities.FirstOrDefault();
                if (row is null)
                {
                    return Fail<RecordResponse>(new RecycleBinProblem(
                        StatusCodes.Status404NotFound,
                        RecycleBinFaults.NotInBinCode,
                        "This record is no longer in the recycle bin."));
                }

                return RecycleBinResult<RecordResponse>.Ok(new RecordResponse(RecycleBinValues.ToFields(row)));
            }

            if (!Guid.TryParse(auditId, out var audit))
                return Fail<RecordResponse>(RecycleBinFaults.BadRequest("AuditIdRequired", "The audit entry id is missing."));
            var details = (RetrieveAuditDetailsResponse)await client.ExecuteAsync(
                new RetrieveAuditDetailsRequest { AuditId = audit },
                cancellationToken);
            var oldValue = OldValue(details.AuditDetail);
            return RecycleBinResult<RecordResponse>.Ok(
                new RecordResponse(oldValue is null ? [] : RecycleBinValues.ToFields(oldValue)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<RecordResponse>(RecycleBinFaults.From(ex));
        }
    }

    // ── Restore ──────────────────────────────────────────────────────────────

    public async Task<RecycleBinResult<RestoreResponse>> RestoreAsync(RestoreBody? body, CancellationToken cancellationToken)
    {
        if (body is null || !RecycleBinSources.IsKnown(body.Source))
            return Fail<RestoreResponse>(RecycleBinFaults.BadRequest("UnknownSource", "Source must be bin or audit."));
        var items = body.Items ?? [];
        if (items.Count == 0)
            return Fail<RestoreResponse>(RecycleBinFaults.BadRequest("NoItems", "Choose at least one record."));
        if (items.Count > MaxRestoreItems)
        {
            return Fail<RestoreResponse>(RecycleBinFaults.BadRequest(
                "TooManyItems",
                $"Send at most {MaxRestoreItems} records per request."));
        }
        if (body.Source == RecycleBinSources.Bin && !online)
            return Fail<RestoreResponse>(BinUnavailable());

        foreach (var item in items)
        {
            if (!IsLogicalName(item.Table) || !Guid.TryParse(item.RecordId, out _)
                || (body.Source == RecycleBinSources.Audit && !Guid.TryParse(item.AuditId, out _)))
            {
                return Fail<RestoreResponse>(RecycleBinFaults.BadRequest(
                    "InvalidItem",
                    "Each record needs a table, a record id and, for the audit log, an audit entry id."));
            }
        }

        var results = body.Source == RecycleBinSources.Bin
            ? await RestoreFromBinAsync(items, cancellationToken)
            : await RestoreFromAuditAsync(items, cancellationToken);
        return RecycleBinResult<RestoreResponse>.Ok(new RestoreResponse(results));
    }

    /// <summary>One Restore per record, in the order given. A failure never stops the rest.</summary>
    private async Task<List<RestoreResultDto>> RestoreFromBinAsync(
        IReadOnlyList<RestoreItem> items,
        CancellationToken cancellationToken)
    {
        var results = new List<RestoreResultDto>(items.Count);
        foreach (var item in items)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var id = Guid.Parse(item.RecordId!);
            try
            {
                var request = new OrganizationRequest(RestoreMessage)
                {
                    Parameters = { ["Target"] = new Entity(item.Table!, id) },
                };
                await WithRetryAsync(() => client.ExecuteAsync(request, cancellationToken), cancellationToken);
                results.Add(Restored(item, null));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                results.Add(Failed(item, RecycleBinFaults.ForRestore(ex, RecycleBinSources.Bin)));
            }
        }

        return results;
    }

    private async Task<List<RestoreResultDto>> RestoreFromAuditAsync(
        IReadOnlyList<RestoreItem> items,
        CancellationToken cancellationToken)
    {
        var results = new List<RestoreResultDto>(items.Count);
        var metadata = new Dictionary<string, EntityMetadata?>(StringComparer.Ordinal);
        var metadataErrors = new Dictionary<string, RestoreFault>(StringComparer.Ordinal);
        var ready = await ReadyTablesAsync(cancellationToken);

        foreach (var item in items)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var table = item.Table!;
            var id = Guid.Parse(item.RecordId!);

            if (!metadata.ContainsKey(table) && !metadataErrors.ContainsKey(table))
            {
                try
                {
                    metadata[table] = await TableMetadataAsync(table, EntityFilters.Attributes, cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    metadataErrors[table] = RecycleBinFaults.ForRestore(ex, RecycleBinSources.Audit);
                }
            }

            if (metadataErrors.TryGetValue(table, out var metadataError))
            {
                results.Add(Failed(item, metadataError));
                continue;
            }

            var tableMetadata = metadata[table]!;
            if (!CanRestoreFromAudit(tableMetadata))
            {
                results.Add(Failed(item, new RestoreFault(
                    RecycleBinFaults.NotRestorableTableCode,
                    "Records of this table cannot be recreated from the audit log.")));
                continue;
            }

            try
            {
                if (ready.ContainsKey(table) && await InBinAsync(tableMetadata, id, cancellationToken))
                {
                    results.Add(new RestoreResultDto(
                        table,
                        id.ToString("D"),
                        item.AuditId,
                        RestoreStatuses.Skipped,
                        RecycleBinFaults.InRecycleBinCode,
                        "This record is in the recycle bin. Restore it from there so every field comes back.",
                        null));
                    continue;
                }

                var details = (RetrieveAuditDetailsResponse)await WithRetryAsync(
                    () => client.ExecuteAsync(new RetrieveAuditDetailsRequest { AuditId = Guid.Parse(item.AuditId!) }, cancellationToken),
                    cancellationToken);
                var oldValue = OldValue(details.AuditDetail);
                if (oldValue is null || oldValue.Attributes.Count == 0)
                {
                    results.Add(Failed(item, new RestoreFault(
                        RecycleBinFaults.NoValuesCode,
                        "The audit log holds no field values for this record, so it cannot be restored.")));
                    continue;
                }

                var plan = PlanAuditCreate(tableMetadata, id, oldValue);
                await WithRetryAsync(
                    () => client.ExecuteAsync(new CreateRequest { Target = plan.Record }, cancellationToken),
                    cancellationToken);

                var warnings = new List<string>();
                if (tableMetadata.IsActivity == true)
                    warnings.Add("Activity parties such as To, From and attendees are not restored.");
                var stateWarning = await RestoreStateAsync(tableMetadata, id, plan, cancellationToken);
                if (stateWarning is not null)
                    warnings.Add(stateWarning);
                results.Add(Restored(item, warnings.Count == 0 ? null : string.Join(" ", warnings)));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                results.Add(Failed(item, RecycleBinFaults.ForRestore(ex, RecycleBinSources.Audit)));
            }
        }

        return results;
    }

    private async Task<bool> InBinAsync(EntityMetadata table, Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await client.RetrieveMultipleAsync(
                RecycleBinQueries.BinContains(table.LogicalName, table.PrimaryIdAttribute, id),
                cancellationToken);
            return rows.Entities.Count > 0;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return false;
        }
    }

    /// <summary>Puts back an inactive state after Create. Returns a warning when the record stays active.</summary>
    private async Task<string?> RestoreStateAsync(
        EntityMetadata table,
        Guid id,
        AuditCreatePlan plan,
        CancellationToken cancellationToken)
    {
        if (plan.OldState is not int state || state == 0)
            return null;
        if (SpecialStateTables.Contains(table.LogicalName))
            return "The record was restored as active. Close it in the app to match its old status.";

        try
        {
            var update = new Entity(table.LogicalName, id) { ["statecode"] = new OptionSetValue(state) };
            if (plan.OldStatus is int status)
                update["statuscode"] = new OptionSetValue(status);
            await WithRetryAsync(
                () => client.ExecuteAsync(new UpdateRequest { Target = update }, cancellationToken),
                cancellationToken);
            return null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return $"The record was restored as active because its old status could not be set: {RecycleBinFaults.ForRestore(ex, RecycleBinSources.Audit).Message}";
        }
    }

    /// <summary>
    /// Builds the Create for an audit-log restore: keeps the original id, keeps only attributes valid for
    /// create, maps createdon to overriddencreatedon, and holds back an inactive state for a follow-up Update.
    /// </summary>
    public static AuditCreatePlan PlanAuditCreate(EntityMetadata table, Guid id, Entity oldValue)
    {
        var attributes = (table.Attributes ?? [])
            .Where(attribute => !string.IsNullOrEmpty(attribute.LogicalName))
            .ToDictionary(attribute => attribute.LogicalName, StringComparer.Ordinal);
        bool ValidForCreate(string name) =>
            attributes.TryGetValue(name, out var attribute) && attribute.IsValidForCreate == true;

        var oldState = oldValue.GetAttributeValue<OptionSetValue>("statecode")?.Value;
        var oldStatus = oldValue.GetAttributeValue<OptionSetValue>("statuscode")?.Value;
        var record = new Entity(table.LogicalName, id);

        foreach (var (name, value) in oldValue.Attributes)
        {
            if (value is null || name == table.PrimaryIdAttribute || name is "statecode" or "statuscode")
                continue;
            if (name == "createdon")
            {
                if (ValidForCreate("overriddencreatedon"))
                    record["overriddencreatedon"] = value;
                continue;
            }
            if (ValidForCreate(name))
                record[name] = value;
        }

        // An active record keeps its own active status reason; an inactive one is set after Create.
        if (oldState is null or 0 && oldStatus is int activeStatus && ValidForCreate("statuscode"))
            record["statuscode"] = new OptionSetValue(activeStatus);

        return new AuditCreatePlan(record, oldState, oldStatus);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<EntityMetadata> TableMetadataAsync(string table, EntityFilters filters, CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityResponse)await client.ExecuteAsync(
            new RetrieveEntityRequest { LogicalName = table, EntityFilters = filters, RetrieveAsIfPublished = false },
            cancellationToken);
        return response.EntityMetadata;
    }

    /// <summary>Retries after service protection faults, waiting for Retry-After, instead of failing the record.</summary>
    private async Task<T> WithRetryAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await action();
            }
            catch (Exception ex) when (attempt < MaxAttempts && RecycleBinFaults.IsServiceProtection(ex))
            {
                var wait = RecycleBinFaults.RetryAfter(ex) ?? TimeSpan.FromSeconds(5 * attempt);
                await delay.WaitAsync(wait, cancellationToken);
            }
        }
    }

    private static Guid RecordId(Entity row, string primaryId) =>
        row.Id != Guid.Empty ? row.Id : row.GetAttributeValue<Guid?>(primaryId) ?? Guid.Empty;

    private static bool IsLogicalName(string? value) => value is not null && LogicalNamePattern().IsMatch(value);

    private static bool TryUtc(string? value, out DateTime utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;
        if (!DateTime.TryParse(
                value,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                out var parsed))
            return false;
        utc = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return true;
    }

    private static RecycleBinProblem BinUnavailable() =>
        RecycleBinFaults.BadRequest("BinUnavailable", "The recycle bin is available only in Dataverse online.");

    private static RestoreResultDto Restored(RestoreItem item, string? warning) =>
        new(item.Table!, item.RecordId!, item.AuditId, RestoreStatuses.Restored, null, null, warning);

    private static RestoreResultDto Failed(RestoreItem item, RestoreFault fault) =>
        new(item.Table!, item.RecordId!, item.AuditId, RestoreStatuses.Failed, fault.Code, fault.Message, null);

    private static RecycleBinResult<T> Fail<T>(RecycleBinProblem problem) => RecycleBinResult<T>.Fail(problem);
}
