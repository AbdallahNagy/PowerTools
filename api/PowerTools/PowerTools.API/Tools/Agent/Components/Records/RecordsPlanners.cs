using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Kernel;
using PowerTools.API.Tools.CommunityToolApi;

namespace PowerTools.API.Tools.Agent.Components.Records;

/// <summary>Turns the record references and values of a spec into SDK objects, with errors that name the field.</summary>
internal static class RecordValues
{
    public const int MaxOperations = 100;

    public static Guid? IdOf(string? id, string path) =>
        id is null ? null : Guid.TryParse(id, out var parsed) ? parsed : throw Invalid($"{path}.id must be a GUID.");

    public static KeyAttributeCollection? KeyOf(Dictionary<string, JsonElement>? key, string path)
    {
        if (key is null || key.Count == 0) return null;
        var keys = new KeyAttributeCollection();
        foreach (var (column, value) in key) keys[column.ToLowerInvariant()] = Decode(value, $"{path}.key.{column}");
        return keys;
    }

    public static EntityReference Reference(string table, string? id, Dictionary<string, JsonElement>? key, string path)
    {
        var name = Table(table, path);
        if (IdOf(id, path) is { } guid) return new EntityReference(name, guid);
        if (KeyOf(key, path) is { } keys) return new EntityReference(name, keys);
        throw Invalid($"{path} needs id or key.");
    }

    public static Entity Entity(RecordOperation op, string path, bool needsTarget)
    {
        var table = Table(op.Table, path);
        Entity entity;
        if (IdOf(op.Id, path) is { } id) entity = new Entity(table, id);
        else if (KeyOf(op.Key, path) is { } keys) entity = new Entity(table, keys);
        else if (needsTarget) throw Invalid($"{path} needs id or key.");
        else entity = new Entity(table);
        foreach (var (column, value) in op.Values ?? []) entity[column.ToLowerInvariant()] = Decode(value, $"{path}.values.{column}");
        return entity;
    }

    public static string Table(string table, string path) =>
        string.IsNullOrWhiteSpace(table) ? throw Invalid($"{path}.table is required.") : table.Trim().ToLowerInvariant();

    /// <summary>How a record is named in a step: "account 0000…" or "account (key accountnumber=A1)".</summary>
    public static string Name(string table, string? id, Dictionary<string, JsonElement>? key) =>
        id is not null ? $"{table.ToLowerInvariant()} {id}"
        : key is { Count: > 0 } ? $"{table.ToLowerInvariant()} ({string.Join(", ", key.Select(k => $"{k.Key}={k.Value.GetRawText()}"))})"
        : table.ToLowerInvariant();

    private static object? Decode(JsonElement value, string path)
    {
        try
        {
            return CommunityToolValueCodec.Decode(value, path);
        }
        catch (CommunityToolValueException ex)
        {
            throw Invalid(ex.Message);
        }
    }

    public static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

/// <summary>
/// Plans records_write: one step per operation, or one transaction step for allOrNothing. Records are data, so the
/// plan does not compare with the environment; it shows exactly which values each operation writes.
/// </summary>
public sealed class RecordsWritePlanner : IComponentPlanner<RecordsWriteSpec>
{
    public const string Family = "records_write";

    /// <summary>Writes are not idempotent, so verification has nothing to compare: it plans no operations.</summary>
    public static RecordsWriteSpec ForVerification(RecordsWriteSpec spec) => new() { Operations = [] };

    public Task<Plan> PlanAsync(RecordsWriteSpec spec, PlanContext context, CancellationToken ct)
    {
        var operations = spec.Operations ?? [];
        if (operations.Count == 0) return Task.FromResult(Plan.Empty);
        if (operations.Count > RecordValues.MaxOperations)
            throw RecordValues.Invalid($"operations lists {operations.Count}; at most {RecordValues.MaxOperations} run in one call.");

        var steps = new List<PlanStep>();
        var locks = new List<string>();
        for (var i = 0; i < operations.Count; i++)
        {
            var op = operations[i];
            var path = $"operations[{i}]";
            var (name, request) = Build(op, path);
            if (RecordValues.IdOf(op.Id, path) is { } id) locks.Add(Locks.RecordKey(id));
            steps.Add(new PlanStep
            {
                Op = Name(op.Op),
                Target = name,
                Detail = Detail(op),
                Request = request,
                SolutionAware = false,
            });
        }

        if (spec.AllOrNothing != true) return Task.FromResult(new Plan(steps, lockKeys: locks));

        var transaction = new ExecuteTransactionRequest { Requests = [], ReturnResponses = true };
        foreach (var step in steps) transaction.Requests.Add(step.Request!);
        var all = new PlanStep
        {
            Op = "transaction",
            Target = $"{steps.Count} operation{(steps.Count == 1 ? "" : "s")}",
            Detail = string.Join("\n", steps.Select(s => $"{s.Op} {s.Target}: {s.Detail}")),
            Request = transaction,
            SolutionAware = false,
        };
        return Task.FromResult(new Plan([all], lockKeys: locks));
    }

    private static (string Name, OrganizationRequest Request) Build(RecordOperation op, string path)
    {
        var name = RecordValues.Name(op.Table, op.Id, op.Key);
        switch (op.Op)
        {
            case RecordOp.Create:
                if (op.Key is { Count: > 0 }) throw RecordValues.Invalid($"{path}: create takes values (and optionally id), not key; use upsert to match by key.");
                return (name, new CreateRequest { Target = RecordValues.Entity(op, path, needsTarget: false) });
            case RecordOp.Update:
                if (op.Values is not { Count: > 0 }) throw RecordValues.Invalid($"{path}: update needs values.");
                return (name, new UpdateRequest { Target = RecordValues.Entity(op, path, needsTarget: true) });
            case RecordOp.Upsert:
                if (op.Values is not { Count: > 0 }) throw RecordValues.Invalid($"{path}: upsert needs values.");
                return (name, new UpsertRequest { Target = RecordValues.Entity(op, path, needsTarget: true) });
            case RecordOp.Associate:
                if (string.IsNullOrWhiteSpace(op.Relationship)) throw RecordValues.Invalid($"{path}: associate needs relationship.");
                if (op.Related is not { Count: > 0 }) throw RecordValues.Invalid($"{path}: associate needs related records.");
                var related = new EntityReferenceCollection();
                for (var r = 0; r < op.Related.Count; r++)
                    related.Add(RecordValues.Reference(op.Related[r].Table, op.Related[r].Id, op.Related[r].Key, $"{path}.related[{r}]"));
                return (name, new AssociateRequest
                {
                    Target = RecordValues.Reference(op.Table, op.Id, op.Key, path),
                    Relationship = new Relationship(op.Relationship.Trim()),
                    RelatedEntities = related,
                });
            default:
                throw RecordValues.Invalid($"{path}.op is not known.");
        }
    }

    private static string Name(RecordOp op) => op switch
    {
        RecordOp.Create => "create",
        RecordOp.Update => "update",
        RecordOp.Upsert => "upsert",
        _ => "associate",
    };

    /// <summary>Every value the operation writes, so the approved hash covers them.</summary>
    private static string Detail(RecordOperation op) => op.Op == RecordOp.Associate
        ? $"{op.Relationship}: {string.Join(", ", (op.Related ?? []).Select(r => RecordValues.Name(r.Table, r.Id, r.Key)))}"
        : JsonSerializer.Serialize(op.Values ?? []);
}

/// <summary>
/// Plans records_delete: reads each record (by id, key, or a FetchXML query) and lists one destructive step per record
/// with its primary name, so the dialog shows what goes. A record already gone is skipped.
/// </summary>
public sealed class RecordsDeletePlanner : IComponentPlanner<RecordsDeleteSpec>
{
    public const string Family = "records_delete";
    public const int MaxQueryCount = 1000;

    /// <summary>A removed link cannot be read back cheaply, so verification checks only the deletes.</summary>
    public static RecordsDeleteSpec ForVerification(RecordsDeleteSpec spec) =>
        new() { Records = spec.Records, Query = spec.Query };

    public async Task<Plan> PlanAsync(RecordsDeleteSpec spec, PlanContext context, CancellationToken ct)
    {
        var steps = new List<PlanStep>();
        var warnings = new List<string>();
        var seen = new HashSet<(string, Guid)>();
        var count = (spec.Records?.Count ?? 0) + (spec.Disassociate?.Count ?? 0);
        if (count > RecordValues.MaxOperations)
            throw RecordValues.Invalid($"At most {RecordValues.MaxOperations} records and links in one call; use query for more.");

        void Delete(string table, Guid id, string? name)
        {
            if (!seen.Add((table, id))) return;
            steps.Add(new PlanStep
            {
                Op = "delete",
                Target = $"{table} {id:D}",
                Effect = PlanEffect.Destructive,
                Detail = string.IsNullOrEmpty(name) ? null : name,
                Request = new DeleteRequest { Target = new EntityReference(table, id) },
                SolutionAware = false,
            });
        }

        for (var i = 0; i < (spec.Records?.Count ?? 0); i++)
        {
            var record = spec.Records![i];
            var path = $"records[{i}]";
            var table = RecordValues.Table(record.Table, path);
            var info = await context.Metadata.TableAsync(table, ct) ?? throw RecordValues.Invalid($"{path}: table {table} does not exist.");
            var query = new QueryExpression(table) { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet(info.PrimaryNameAttribute ?? info.PrimaryIdAttribute) };
            if (RecordValues.IdOf(record.Id, path) is { } id) query.Criteria.AddCondition(info.PrimaryIdAttribute, ConditionOperator.Equal, id);
            else if (RecordValues.KeyOf(record.Key, path) is { } keys)
                foreach (var (column, value) in keys) query.Criteria.AddCondition(column, ConditionOperator.Equal, value is EntityReference r ? r.Id : value);
            else throw RecordValues.Invalid($"{path} needs id or key.");

            var rows = (await context.Client.RetrieveMultipleAsync(query, ct)).Entities;
            if (rows.Count == 0)
            {
                warnings.Add($"{RecordValues.Name(table, record.Id, record.Key)} does not exist; nothing to delete.");
                continue;
            }

            if (rows.Count > 1) throw RecordValues.Invalid($"{path}: the key matches more than one record.");
            Delete(table, rows[0].Id, info.PrimaryNameAttribute is { } nameColumn ? rows[0].GetAttributeValue<string>(nameColumn) : null);
        }

        if (spec.Query is { } byQuery)
            await QueryAsync(byQuery, context, steps, Delete, ct);

        for (var i = 0; i < (spec.Disassociate?.Count ?? 0); i++)
        {
            var links = spec.Disassociate![i];
            var path = $"disassociate[{i}]";
            var related = new EntityReferenceCollection();
            for (var r = 0; r < links.Related.Count; r++)
                related.Add(RecordValues.Reference(links.Related[r].Table, links.Related[r].Id, links.Related[r].Key, $"{path}.related[{r}]"));
            var target = RecordValues.Reference(links.Table, links.Id, null, path);
            steps.Add(new PlanStep
            {
                Op = "disassociate",
                Target = $"{target.LogicalName} {target.Id:D}",
                Effect = PlanEffect.Destructive,
                Detail = $"{links.Relationship}: {string.Join(", ", related.Select(r => $"{r.LogicalName} {(r.Id == Guid.Empty ? "(key)" : r.Id.ToString("D"))}"))}",
                Request = new DisassociateRequest { Target = target, Relationship = new Relationship(links.Relationship), RelatedEntities = related },
                SolutionAware = false,
            });
        }

        var locks = seen.Select(s => Locks.RecordKey(s.Item2)).ToList();
        return new Plan(steps, warnings, locks);
    }

    private static async Task QueryAsync(
        RecordsDeleteQuery byQuery, PlanContext context, List<PlanStep> steps, Action<string, Guid, string?> delete, CancellationToken ct)
    {
        if (byQuery.MaxCount is < 1 or > MaxQueryCount) throw RecordValues.Invalid($"query.maxCount must be from 1 to {MaxQueryCount}.");
        XDocument fetch;
        try
        {
            fetch = XDocument.Parse(byQuery.FetchXml);
        }
        catch (System.Xml.XmlException ex)
        {
            throw RecordValues.Invalid($"query.fetchXml is not valid XML: {ex.Message}");
        }

        var root = fetch.Root;
        var entity = root?.Element("entity");
        var table = ((string?)entity?.Attribute("name"))?.ToLowerInvariant();
        if (root?.Name != "fetch" || table is null) throw RecordValues.Invalid("query.fetchXml needs <fetch><entity name=\"…\">.");
        if ((string?)root.Attribute("aggregate") == "true") throw RecordValues.Invalid("query.fetchXml must not aggregate.");
        var info = await context.Metadata.TableAsync(table, ct) ?? throw RecordValues.Invalid($"Table {table} does not exist.");

        // Ask for one more than allowed, so too many matches is noticed without reading them all.
        root.SetAttributeValue("count", byQuery.MaxCount + 1);
        root.SetAttributeValue("page", null);
        root.SetAttributeValue("top", null);
        if (info.PrimaryNameAttribute is { } nameColumn && !entity!.Elements("attribute").Any(a => (string?)a.Attribute("name") == nameColumn))
            entity.AddFirst(new XElement("attribute", new XAttribute("name", nameColumn)));
        var rows = (await context.Client.RetrieveMultipleAsync(new FetchExpression(fetch.ToString(SaveOptions.DisableFormatting)), ct)).Entities;
        if (rows.Count > byQuery.MaxCount)
        {
            steps.Add(PlanStep.Blocked("delete", table,
                $"The query matches more than maxCount ({byQuery.MaxCount}) records. Narrow the query or raise maxCount (at most {MaxQueryCount})."));
            return;
        }

        foreach (var row in rows)
            delete(table, row.Id, info.PrimaryNameAttribute is { } column ? row.GetAttributeValue<string>(column) : null);
    }
}
