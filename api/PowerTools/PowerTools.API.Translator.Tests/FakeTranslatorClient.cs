using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Translator;

namespace PowerTools.API.Translator.Tests;

/// <summary>A fake Dataverse surface. Records every request; no network.</summary>
public sealed class FakeTranslatorClient : ITranslatorClient
{
    public int BaseLcid { get; set; } = 1033;
    public List<int> Provisioned { get; } = [1033, 1036];
    public Dictionary<int, string> LanguageNames { get; } = new() { [1033] = "English", [1036] = "French" };
    public Exception? LanguageNamesError { get; set; }

    public Dictionary<string, EntityMetadata> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<OptionSetMetadataBase> OptionSets { get; } = [];
    public List<Entity> Views { get; } = [];
    public List<Entity> Charts { get; } = [];
    public Dictionary<(Guid, string), Label> LocLabels { get; } = [];
    /// <summary>Rows for other tables (solution, publisher, solutioncomponent), filtered by simple conditions.</summary>
    public Dictionary<string, List<Entity>> Records { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<Entity> Created { get; } = [];
    public Exception? CreateError { get; set; }

    public List<RetrieveMetadataChangesRequest> MetadataRequests { get; } = [];
    public List<QueryExpression> Queries { get; } = [];
    public List<(IReadOnlyList<LocLabelTarget> Targets, bool IncludeUnpublished)> LocLabelReads { get; } = [];
    public List<(string Table, EntityFilters Filters)> TableReads { get; } = [];
    public List<string> OptionSetReads { get; } = [];
    public List<IReadOnlyList<OrganizationRequest>> Batches { get; } = [];
    public List<string> Published { get; } = [];

    /// <summary>Per-request faults: return a fault for a request, or null to succeed.</summary>
    public Func<OrganizationRequest, int, Exception?> FaultFor { get; set; } = (_, _) => null;
    /// <summary>Throw for a whole batch, by call number (0-based).</summary>
    public Func<int, IReadOnlyList<OrganizationRequest>, Exception?> BatchError { get; set; } = (_, _) => null;
    public Queue<Exception> PublishErrors { get; } = new();

    private int _attempts;

    public Task<int> RetrieveBaseLanguageAsync(CancellationToken cancellationToken) => Task.FromResult(BaseLcid);

    public Task<IReadOnlyList<int>> RetrieveProvisionedLanguagesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<int>>(Provisioned);

    public Task<IReadOnlyDictionary<int, string>> RetrieveLanguageNamesAsync(
        IReadOnlyCollection<int> lcids,
        CancellationToken cancellationToken)
    {
        if (LanguageNamesError is not null) throw LanguageNamesError;
        return Task.FromResult<IReadOnlyDictionary<int, string>>(
            LanguageNames.Where(pair => lcids.Contains(pair.Key)).ToDictionary());
    }

    public Task<IReadOnlyList<EntityMetadata>> RetrieveMetadataAsync(
        RetrieveMetadataChangesRequest request,
        CancellationToken cancellationToken)
    {
        MetadataRequests.Add(request);
        var condition = request.Query.Criteria?.Conditions.FirstOrDefault(item => item.PropertyName == "LogicalName");
        if (condition is null) return Task.FromResult<IReadOnlyList<EntityMetadata>>(Tables.Values.ToList());
        var names = (string[])condition.Value;
        return Task.FromResult<IReadOnlyList<EntityMetadata>>(
            names.Where(Tables.ContainsKey).Select(name => Tables[name]).ToList());
    }

    public Task<IReadOnlyList<OptionSetMetadataBase>> RetrieveAllOptionSetsAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<OptionSetMetadataBase>>(OptionSets);

    public Task<IReadOnlyList<Entity>> RetrieveAllPagesAsync(QueryExpression query, CancellationToken cancellationToken)
    {
        Queries.Add(query);
        if (query.EntityName == "savedquery") return Task.FromResult<IReadOnlyList<Entity>>(Views);
        if (query.EntityName == "savedqueryvisualization") return Task.FromResult<IReadOnlyList<Entity>>(Charts);
        var rows = Records.TryGetValue(query.EntityName, out var list) ? list : [];
        return Task.FromResult<IReadOnlyList<Entity>>(rows.Where(row => query.Criteria.Conditions.All(item => Matches(row, item))).ToList());
    }

    public Task<IReadOnlyList<LocLabelResult>> RetrieveLocLabelsAsync(
        IReadOnlyList<LocLabelTarget> targets,
        bool includeUnpublished,
        CancellationToken cancellationToken)
    {
        LocLabelReads.Add((targets, includeUnpublished));
        return Task.FromResult<IReadOnlyList<LocLabelResult>>(targets
            .Select(target => LocLabels.TryGetValue((target.RecordId, target.AttributeName), out var label)
                ? new LocLabelResult(label, null)
                : new LocLabelResult(null, Fault(TranslatorFaults.ObjectDoesNotExist, "Record does not exist.")))
            .ToList());
    }

    public Task<EntityMetadata> RetrieveTableAsync(string logicalName, EntityFilters filters, CancellationToken cancellationToken)
    {
        TableReads.Add((logicalName, filters));
        return Tables.TryGetValue(logicalName, out var table)
            ? Task.FromResult(table)
            : throw Fault(TranslatorFaults.ObjectDoesNotExist, $"Could not find entity '{logicalName}'.");
    }

    public Task<OptionSetMetadataBase> RetrieveOptionSetAsync(string name, CancellationToken cancellationToken)
    {
        OptionSetReads.Add(name);
        var optionSet = OptionSets.FirstOrDefault(item => item.Name == name);
        return optionSet is not null
            ? Task.FromResult(optionSet)
            : throw Fault(TranslatorFaults.ObjectDoesNotExist, $"Could not find option set '{name}'.");
    }

    public Task<IReadOnlyDictionary<int, Exception>> ExecuteBatchAsync(
        IReadOnlyList<OrganizationRequest> requests,
        CancellationToken cancellationToken)
    {
        var call = Batches.Count;
        Batches.Add(requests);
        var whole = BatchError(call, requests);
        if (whole is not null) throw whole;

        var faults = new Dictionary<int, Exception>();
        for (var i = 0; i < requests.Count; i++)
        {
            var fault = FaultFor(requests[i], _attempts++);
            if (fault is not null) faults[i] = fault;
        }

        return Task.FromResult<IReadOnlyDictionary<int, Exception>>(faults);
    }

    public Task PublishAsync(string parameterXml, CancellationToken cancellationToken)
    {
        Published.Add(parameterXml);
        if (PublishErrors.TryDequeue(out var error)) throw error;
        return Task.CompletedTask;
    }

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken)
    {
        Created.Add(entity);
        if (CreateError is not null) throw CreateError;
        return Task.FromResult(Guid.NewGuid());
    }

    private static bool Matches(Entity row, ConditionExpression condition)
    {
        var value = Normalize(row.Attributes.TryGetValue(condition.AttributeName, out var raw) ? raw : null);
        var values = condition.Values.Select(Normalize).ToList();
        var found = values.Any(item => Equals(item, value));
        return condition.Operator switch
        {
            ConditionOperator.Equal or ConditionOperator.In => found,
            ConditionOperator.NotEqual or ConditionOperator.NotIn => !found,
            _ => true,
        };
    }

    private static object? Normalize(object? value) => value switch
    {
        OptionSetValue option => option.Value,
        EntityReference reference => reference.Id,
        string text => text.ToLowerInvariant(),
        _ => value,
    };

    public static FaultException<OrganizationServiceFault> Fault(int code, string message)
    {
        var fault = new OrganizationServiceFault { ErrorCode = code, Message = message };
        return new FaultException<OrganizationServiceFault>(fault, message);
    }
}

public sealed class NoDelay : ITranslatorDelay
{
    public List<TimeSpan> Waits { get; } = [];

    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        Waits.Add(delay);
        return Task.CompletedTask;
    }
}

internal static class Builders
{
    public static Label Text(params (int Lcid, string Text)[] labels)
    {
        var label = new Label();
        foreach (var (lcid, text) in labels) label.LocalizedLabels.Add(new LocalizedLabel(text, lcid));
        return label;
    }

    public static Label En(string text) => Text((1033, text));

    public static EntityMetadata Table(string logicalName, string display, bool customizable = true, bool renameable = true)
    {
        var table = new EntityMetadata
        {
            LogicalName = logicalName,
            SchemaName = logicalName,
            DisplayName = Text((1033, display), (1036, display + " FR")),
            DisplayCollectionName = Text((1033, display + "s")),
            Description = new Label(),
            IsCustomizable = new BooleanManagedProperty(customizable),
            IsRenameable = new BooleanManagedProperty(renameable),
        };
        return table;
    }

    public static T Attribute<T>(T attribute, string logicalName, string? display, string? attributeOf = null)
        where T : AttributeMetadata
    {
        attribute.LogicalName = logicalName;
        attribute.SchemaName = logicalName;
        attribute.DisplayName = display is null ? new Label() : En(display);
        attribute.Description = new Label();
        attribute.IsCustomizable = new BooleanManagedProperty(true);
        attribute.IsRenameable = new BooleanManagedProperty(true);
        if (attributeOf is not null) SetInternal(attribute, nameof(AttributeMetadata.AttributeOf), attributeOf);
        return attribute;
    }

    public static OptionSetMetadata LocalOptions(params (int Value, string Label)[] options)
    {
        var set = new OptionSetMetadata { IsGlobal = false };
        foreach (var (value, label) in options)
            set.Options.Add(new OptionMetadata(En(label), value) { Description = new Label() });
        return set;
    }

    public static void SetAttributes(this EntityMetadata table, params AttributeMetadata[] attributes) =>
        SetInternal(table, nameof(EntityMetadata.Attributes), attributes);

    public static void SetOneToMany(this EntityMetadata table, params OneToManyRelationshipMetadata[] relationships) =>
        SetInternal(table, nameof(EntityMetadata.OneToManyRelationships), relationships);

    public static void SetManyToMany(this EntityMetadata table, params ManyToManyRelationshipMetadata[] relationships) =>
        SetInternal(table, nameof(EntityMetadata.ManyToManyRelationships), relationships);

    public static void SetInternal(object target, string property, object? value)
    {
        for (var type = target.GetType(); type is not null; type = type.BaseType)
        {
            var info = type.GetProperty(
                property,
                System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.DeclaredOnly);
            if (info?.SetMethod is not null)
            {
                info.SetValue(target, value);
                return;
            }
        }

        throw new InvalidOperationException($"No settable property {property} on {target.GetType().Name}.");
    }
}
