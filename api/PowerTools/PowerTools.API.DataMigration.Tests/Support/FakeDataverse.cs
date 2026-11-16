using System.Reflection;
using System.ServiceModel;
using System.Xml.Linq;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.DataMigration;

namespace PowerTools.API.DataMigration.Tests.Support;

/// <summary>
/// One table of one Dataverse environment, in memory. It answers the requests the Data Migration tool sends:
/// table metadata, aggregate counts, paged lists, id lookups ("in" conditions) and ExecuteMultiple writes.
/// It does not evaluate user filters.
/// </summary>
public sealed class FakeDataverse
{
    private readonly List<Entity> _rows = [];

    public FakeDataverse(string table, string primaryId, string? primaryName)
    {
        Table = table;
        PrimaryId = primaryId;
        PrimaryName = primaryName;
    }

    public string Table { get; }
    public string PrimaryId { get; }
    public string? PrimaryName { get; }

    /// <summary>Writes to these ids fail with <see cref="RecordFaultMessage"/>.</summary>
    public HashSet<Guid> FailingIds { get; } = [];
    public string RecordFaultMessage { get; set; } = "Record rejected.";

    /// <summary>Aggregate counts fail, as they do past 50,000 records.</summary>
    public bool AggregateCountFails { get; set; }

    /// <summary>Every request fails with this error.</summary>
    public Exception? FailEverything { get; set; }

    /// <summary>Retrieves whose FetchXml matches fail with an error.</summary>
    public Func<XElement, bool>? FailRetrieveWhen { get; set; }

    /// <summary>Every FetchXml query received, in order.</summary>
    public List<string> Fetches { get; } = [];

    /// <summary>Every write request received inside ExecuteMultiple, in order.</summary>
    public List<OrganizationRequest> Writes { get; } = [];

    public IReadOnlyList<Entity> Rows => _rows;

    public Entity Row(Guid id) => _rows.Single(r => r.Id == id);

    public bool Has(Guid id) => _rows.Any(r => r.Id == id);

    public FakeDataverse Add(Guid id, string? name = null, params (string Attribute, object? Value)[] values)
    {
        var row = new Entity(Table, id) { [PrimaryId] = id };
        if (PrimaryName is not null && name is not null) row[PrimaryName] = name;
        foreach (var (attribute, value) in values) row[attribute] = value;
        _rows.Add(row);
        return this;
    }

    public FakeDataverse AddMany(int count, Func<int, Guid>? id = null)
    {
        for (var i = 0; i < count; i++) Add(id?.Invoke(i) ?? Guid.NewGuid(), $"Record {i}");
        return this;
    }

    public IOrganizationServiceAsync2 AsService() => ServiceProxy.Create(this);

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken ct)
    {
        ThrowIfFailing();
        var fetchXml = ((FetchExpression)query).Query;
        Fetches.Add(fetchXml);
        var fetch = XElement.Parse(fetchXml);
        if (FailRetrieveWhen?.Invoke(fetch) == true) throw Fault("Retrieve failed.");

        if ((string?)fetch.Attribute("aggregate") == "true")
        {
            if (AggregateCountFails) throw Fault("AggregateQueryRecordLimit exceeded.");
            var counted = new Entity(Table) { [DataMigrationFetchXml.CountAlias] = new AliasedValue(Table, PrimaryId, _rows.Count) };
            return Task.FromResult(new EntityCollection([counted]));
        }

        var columns = fetch.Descendants("attribute").Select(a => (string)a.Attribute("name")!).ToList();
        var lookup = fetch.Descendants("condition").FirstOrDefault(c => (string?)c.Attribute("operator") == "in");
        if (lookup is not null)
        {
            var ids = lookup.Elements("value").Select(v => Guid.Parse(v.Value)).ToHashSet();
            return Task.FromResult(new EntityCollection(_rows.Where(r => ids.Contains(r.Id)).Select(r => Project(r, columns)).ToList()));
        }

        var page = (int?)fetch.Attribute("page") ?? 1;
        var size = (int?)fetch.Attribute("count") ?? 5000;
        var slice = _rows.Skip((page - 1) * size).Take(size).Select(r => Project(r, columns)).ToList();
        return Task.FromResult(new EntityCollection(slice)
        {
            MoreRecords = _rows.Count > page * size,
            PagingCookie = $"<cookie page=\"{page}\" />",
        });
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken ct)
    {
        ThrowIfFailing();
        return Task.FromResult(request switch
        {
            RetrieveEntityRequest => Metadata(),
            ExecuteMultipleRequest multiple => ExecuteMultiple(multiple),
            _ => throw new NotSupportedException(request.GetType().Name),
        });
    }

    private void ThrowIfFailing()
    {
        if (FailEverything is not null) throw FailEverything;
    }

    private OrganizationResponse Metadata()
    {
        var metadata = new EntityMetadata { LogicalName = Table };
        SetProperty(metadata, nameof(EntityMetadata.PrimaryIdAttribute), PrimaryId);
        SetProperty(metadata, nameof(EntityMetadata.PrimaryNameAttribute), PrimaryName);
        var response = new RetrieveEntityResponse();
        response.Results["EntityMetadata"] = metadata;
        return response;
    }

    private ExecuteMultipleResponse ExecuteMultiple(ExecuteMultipleRequest multiple)
    {
        var items = new ExecuteMultipleResponseItemCollection();
        for (var i = 0; i < multiple.Requests.Count; i++)
        {
            var request = multiple.Requests[i];
            Writes.Add(request);
            var error = Apply(request);
            items.Add(new ExecuteMultipleResponseItem
            {
                RequestIndex = i,
                Fault = error is null ? null : new OrganizationServiceFault { Message = error },
            });
        }

        var response = new ExecuteMultipleResponse();
        response.Results["Responses"] = items;
        response.Results["IsFaulted"] = items.Any(item => item.Fault is not null);
        return response;
    }

    private string? Apply(OrganizationRequest request)
    {
        switch (request)
        {
            case CreateRequest create:
                if (FailingIds.Contains(create.Target.Id)) return RecordFaultMessage;
                if (Has(create.Target.Id)) return "A record with the same id already exists.";
                var row = new Entity(Table, create.Target.Id) { [PrimaryId] = create.Target.Id };
                Copy(create.Target, row);
                _rows.Add(row);
                return null;
            case UpdateRequest update:
                if (FailingIds.Contains(update.Target.Id)) return RecordFaultMessage;
                if (!Has(update.Target.Id)) return "Record does not exist.";
                Copy(update.Target, Row(update.Target.Id));
                return null;
            case DeleteRequest delete:
                if (FailingIds.Contains(delete.Target.Id)) return RecordFaultMessage;
                return _rows.RemoveAll(r => r.Id == delete.Target.Id) == 1 ? null : "Record does not exist.";
            case ExecuteTransactionRequest transaction:
                var before = _rows.Select(Clone).ToList();
                foreach (var inner in transaction.Requests)
                {
                    var error = Apply(inner);
                    if (error is null) continue;
                    _rows.Clear();
                    _rows.AddRange(before);
                    return error;
                }
                return null;
            default:
                return $"Unsupported request {request.GetType().Name}.";
        }
    }

    private static Entity Clone(Entity row)
    {
        var copy = new Entity(row.LogicalName, row.Id);
        Copy(row, copy);
        return copy;
    }

    private static void Copy(Entity from, Entity to)
    {
        foreach (var attribute in from.Attributes) to[attribute.Key] = attribute.Value;
    }

    private static Entity Project(Entity row, IReadOnlyCollection<string> columns)
    {
        var copy = new Entity(row.LogicalName, row.Id);
        foreach (var column in columns)
        {
            if (row.Contains(column)) copy[column] = row[column];
        }
        return copy;
    }

    private static FaultException<OrganizationServiceFault> Fault(string message) =>
        new(new OrganizationServiceFault { Message = message }, message);

    private static void SetProperty(object target, string name, object? value) =>
        target.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!
            .SetValue(target, value);

    /// <summary>Routes every RetrieveMultiple and Execute overload of the SDK client to the fake.</summary>
    public class ServiceProxy : DispatchProxy
    {
        private FakeDataverse _fake = null!;

        public static IOrganizationServiceAsync2 Create(FakeDataverse fake)
        {
            var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, ServiceProxy>();
            ((ServiceProxy)(object)proxy)._fake = fake;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            var ct = args?.OfType<CancellationToken>().FirstOrDefault() ?? default;
            return method!.Name switch
            {
                "RetrieveMultipleAsync" => _fake.RetrieveMultipleAsync((QueryBase)args![0]!, ct),
                "ExecuteAsync" => _fake.ExecuteAsync((OrganizationRequest)args![0]!, ct),
                "RetrieveMultiple" => _fake.RetrieveMultipleAsync((QueryBase)args![0]!, ct).GetAwaiter().GetResult(),
                "Execute" => _fake.ExecuteAsync((OrganizationRequest)args![0]!, ct).GetAwaiter().GetResult(),
                _ => throw new NotSupportedException(method.Name),
            };
        }
    }
}
