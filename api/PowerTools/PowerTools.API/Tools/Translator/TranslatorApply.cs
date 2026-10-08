using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Translator;

/// <summary>One write request and the label rows it carries.</summary>
public sealed class WriteUnit(OrganizationRequest request, IReadOnlyList<ApplyRowDto> rows)
{
    public OrganizationRequest Request { get; } = request;
    public IReadOnlyList<ApplyRowDto> Rows { get; } = rows;
    public List<string> PublishTables { get; } = [];
    public List<string> PublishOptionSets { get; } = [];
}

/// <summary>Rows that could not become a request, with the reason.</summary>
public sealed record PlannedFailure(IReadOnlyList<ApplyRowDto> Rows, string Outcome, string Message);

public sealed record ApplyPlan(IReadOnlyList<WriteUnit> Units, IReadOnlyList<PlannedFailure> Failures);

/// <summary>
/// Turns changed labels into Dataverse writes. Each write starts from a fresh read that includes
/// unpublished changes, changes only labels, and keeps <c>MergeLabels = true</c>.
/// </summary>
public sealed class TranslatorApply(ITranslatorClient client, ITranslatorDelay delay)
{
    public async Task RunAsync(TranslatorJob job, CancellationToken cancellationToken)
    {
        job.MarkRunning();
        foreach (var rejected in job.Prepared.Rejected)
            job.Record([rejected]);

        var plan = await PlanAsync(job.Prepared.Rows, cancellationToken);
        foreach (var failure in plan.Failures)
            job.Record(Results(failure.Rows, failure.Outcome, failure.Message));

        var published = new List<WriteUnit>();
        foreach (var chunk in plan.Units.Chunk(job.Prepared.BatchSize))
        {
            var succeeded = await ExecuteAsync(job, chunk, retriedTimeout: false, cancellationToken);
            published.AddRange(succeeded);
        }

        var targets = Targets(
            published.SelectMany(unit => unit.PublishTables),
            published.SelectMany(unit => unit.PublishOptionSets));
        job.StartPublish(targets);
        if (targets.Count == 0)
        {
            job.FinishPublish(PublishStatuses.NotNeeded, null);
            return;
        }

        try
        {
            await PublishWithRetryAsync(client, delay, targets, cancellationToken);
            job.FinishPublish(PublishStatuses.Succeeded, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            job.FinishPublish(PublishStatuses.Failed, TranslatorFaults.RowMessage(ex));
        }
    }

    /// <summary>Sends one batch. Returns the units that were written.</summary>
    private async Task<List<WriteUnit>> ExecuteAsync(
        TranslatorJob job,
        IReadOnlyList<WriteUnit> units,
        bool retriedTimeout,
        CancellationToken cancellationToken)
    {
        var pending = units.ToList();
        var written = new List<WriteUnit>();
        for (var attempt = 0; pending.Count > 0; attempt++)
        {
            IReadOnlyDictionary<int, Exception> faults;
            try
            {
                faults = await client.ExecuteBatchAsync(pending.Select(unit => unit.Request).ToList(), cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || TranslatorFaults.IsTimeout(ex, cancellationToken))
            {
                if (TranslatorFaults.IsTimeout(ex, cancellationToken) && !retriedTimeout)
                {
                    // An unknown part of the batch may be saved. The writes are idempotent, so resend once in smaller batches.
                    job.Log("warn", $"A batch of {pending.Count} writes timed out. Retrying in smaller batches.");
                    var half = Math.Max(1, (pending.Count + 1) / 2);
                    foreach (var smaller in pending.Chunk(half))
                        written.AddRange(await ExecuteAsync(job, smaller, retriedTimeout: true, cancellationToken));
                    return written;
                }

                if (TranslatorFaults.IsCustomizationLock(ex) && attempt < TranslatorLimits.MaxLockRetries)
                {
                    job.Log("warn", "Another customization is running in this environment. Waiting before retrying.");
                    await delay.WaitAsync(LockDelay(attempt), cancellationToken);
                    continue;
                }

                var message = TranslatorFaults.IsTimeout(ex, cancellationToken)
                    ? "The request timed out. Some of these labels may have been saved. Apply them again to make sure."
                    : TranslatorFaults.RowMessage(ex);
                foreach (var unit in pending)
                    job.Record(Results(unit.Rows, ApplyOutcomes.Failed, message));
                return written;
            }

            var retry = new List<WriteUnit>();
            for (var index = 0; index < pending.Count; index++)
            {
                var unit = pending[index];
                if (!faults.TryGetValue(index, out var fault))
                {
                    job.Record(Results(unit.Rows, ApplyOutcomes.Succeeded, null));
                    written.Add(unit);
                }
                else if (TranslatorFaults.IsCustomizationLock(fault) && attempt < TranslatorLimits.MaxLockRetries)
                {
                    retry.Add(unit);
                }
                else
                {
                    var outcome = TranslatorFaults.IsDoesNotExist(fault) ? ApplyOutcomes.Skipped : ApplyOutcomes.Failed;
                    job.Record(Results(unit.Rows, outcome, TranslatorFaults.RowMessage(fault)));
                }
            }

            pending = retry;
            if (pending.Count > 0)
            {
                job.Log("warn", "Another customization is running in this environment. Waiting before retrying.");
                await delay.WaitAsync(LockDelay(attempt), cancellationToken);
            }
        }

        return written;
    }

    public static async Task PublishWithRetryAsync(
        ITranslatorClient client,
        ITranslatorDelay delay,
        PublishTargetsDto targets,
        CancellationToken cancellationToken)
    {
        var xml = TranslatorRequests.PublishXml(targets);
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await client.PublishAsync(xml, cancellationToken);
                return;
            }
            catch (Exception ex) when (
                ex is not OperationCanceledException &&
                TranslatorFaults.IsCustomizationLock(ex) &&
                attempt < TranslatorLimits.MaxLockRetries)
            {
                await delay.WaitAsync(LockDelay(attempt), cancellationToken);
            }
        }
    }

    private static TimeSpan LockDelay(int attempt) =>
        TimeSpan.FromTicks(TranslatorLimits.LockRetryDelay.Ticks * (1L << Math.Min(attempt, 4)));

    public static PublishTargetsDto Targets(IEnumerable<string> tables, IEnumerable<string> optionSets) =>
        new()
        {
            Tables = Clean(tables),
            OptionSets = Clean(optionSets),
        };

    private static List<string> Clean(IEnumerable<string> names) =>
        names
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static IEnumerable<ApplyResultDto> Results(IEnumerable<ApplyRowDto> rows, string outcome, string? message) =>
        rows.Select(row => new ApplyResultDto
        {
            Key = row.Key,
            Lcids = row.Labels.Keys.Order().ToArray(),
            Outcome = outcome,
            Message = message,
        });

    // ── Planning ─────────────────────────────────────────────────────────────

    public async Task<ApplyPlan> PlanAsync(IReadOnlyList<ApplyRowDto> rows, CancellationToken cancellationToken)
    {
        var units = new List<WriteUnit>();
        var failures = new List<PlannedFailure>();

        var tableKinds = new HashSet<string>
        {
            LabelKinds.Table, LabelKinds.Column, LabelKinds.Choice, LabelKinds.Boolean, LabelKinds.Relationship,
        };
        foreach (var group in rows.Where(row => tableKinds.Contains(row.Key.Kind))
                     .GroupBy(row => row.Key.Table!.Trim().ToLowerInvariant()))
        {
            await PlanTableAsync(group.Key, group.ToList(), units, failures, cancellationToken);
        }

        foreach (var group in rows.Where(row => row.Key.Kind == LabelKinds.GlobalChoice)
                     .GroupBy(row => row.Key.OptionSet!.Trim(), StringComparer.OrdinalIgnoreCase))
        {
            await PlanOptionSetAsync(group.Key, group.ToList(), units, failures, cancellationToken);
        }

        var records = rows.Where(row => row.Key.Kind is LabelKinds.View or LabelKinds.Chart).ToList();
        if (records.Count > 0) await PlanRecordsAsync(records, units, failures, cancellationToken);

        return new ApplyPlan(units, failures);
    }

    private async Task PlanTableAsync(
        string table,
        IReadOnlyList<ApplyRowDto> rows,
        List<WriteUnit> units,
        List<PlannedFailure> failures,
        CancellationToken cancellationToken)
    {
        var tableRows = rows.Where(row => row.Key.Kind == LabelKinds.Table).ToList();
        var attributeRows = rows.Where(row => row.Key.Kind is LabelKinds.Column or LabelKinds.Choice or LabelKinds.Boolean).ToList();
        var relationshipRows = rows.Where(row => row.Key.Kind == LabelKinds.Relationship).ToList();

        if (tableRows.Count > 0)
        {
            var entity = await ReadAsync(
                () => client.RetrieveTableAsync(table, EntityFilters.Entity, cancellationToken),
                tableRows,
                "This table no longer exists.",
                failures);
            if (entity is not null)
            {
                entity.DisplayName = Merge(entity.DisplayName, tableRows, LabelProperties.DisplayName);
                entity.DisplayCollectionName = Merge(entity.DisplayCollectionName, tableRows, LabelProperties.DisplayCollectionName);
                entity.Description = Merge(entity.Description, tableRows, LabelProperties.Description);
                units.Add(Unit(new UpdateEntityRequest { Entity = entity, MergeLabels = true }, tableRows, table));
            }
        }

        if (attributeRows.Count == 0 && relationshipRows.Count == 0) return;

        var filters = attributeRows.Count > 0 && relationshipRows.Count > 0
            ? EntityFilters.Attributes | EntityFilters.Relationships
            : attributeRows.Count > 0 ? EntityFilters.Attributes : EntityFilters.Relationships;
        var fresh = await ReadAsync(
            () => client.RetrieveTableAsync(table, filters, cancellationToken),
            attributeRows.Concat(relationshipRows).ToList(),
            "This table no longer exists.",
            failures);
        if (fresh is null) return;

        var attributes = (fresh.Attributes ?? []).ToDictionary(
            attribute => attribute.LogicalName,
            StringComparer.OrdinalIgnoreCase);

        foreach (var column in attributeRows.Where(row => row.Key.Kind == LabelKinds.Column)
                     .GroupBy(row => row.Key.Column!, StringComparer.OrdinalIgnoreCase))
        {
            var columnRows = column.ToList();
            if (!attributes.TryGetValue(column.Key, out var attribute))
            {
                failures.Add(new PlannedFailure(columnRows, ApplyOutcomes.Skipped, "This column no longer exists."));
                continue;
            }

            attribute.DisplayName = Merge(attribute.DisplayName, columnRows, LabelProperties.DisplayName);
            attribute.Description = Merge(attribute.Description, columnRows, LabelProperties.Description);
            units.Add(Unit(
                new UpdateAttributeRequest { EntityName = table, Attribute = attribute, MergeLabels = true },
                columnRows,
                table));
        }

        foreach (var option in attributeRows.Where(row => row.Key.Kind is LabelKinds.Choice or LabelKinds.Boolean)
                     .GroupBy(row => (Column: row.Key.Column!.ToLowerInvariant(), Value: row.Key.Value!.Value)))
        {
            var optionRows = option.ToList();
            var unit = OptionUnit(table, attributes.GetValueOrDefault(option.Key.Column), option.Key.Value, optionRows, out var failure);
            if (unit is not null) units.Add(unit);
            if (failure is not null) failures.Add(failure);
        }

        var oneToMany = (fresh.OneToManyRelationships ?? [])
            .Concat(fresh.ManyToOneRelationships ?? [])
            .GroupBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var manyToMany = (fresh.ManyToManyRelationships ?? [])
            .GroupBy(relationship => relationship.SchemaName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        foreach (var relationship in relationshipRows.GroupBy(row => row.Key.Relationship!, StringComparer.OrdinalIgnoreCase))
        {
            var relationshipItems = relationship.ToList();
            if (oneToMany.TryGetValue(relationship.Key, out var oneToManyMetadata))
            {
                var menu = oneToManyMetadata.AssociatedMenuConfiguration ??= new AssociatedMenuConfiguration();
                menu.Label = Merge(menu.Label, relationshipItems, LabelProperties.Label);
                var unit = Unit(
                    new UpdateRelationshipRequest { Relationship = oneToManyMetadata, MergeLabels = true },
                    relationshipItems,
                    oneToManyMetadata.ReferencedEntity,
                    oneToManyMetadata.ReferencingEntity);
                units.Add(unit);
            }
            else if (manyToMany.TryGetValue(relationship.Key, out var manyToManyMetadata))
            {
                var first = relationshipItems.Where(row => row.Key.Side != 2).ToList();
                var second = relationshipItems.Where(row => row.Key.Side == 2).ToList();
                if (first.Count > 0)
                {
                    var menu = manyToManyMetadata.Entity1AssociatedMenuConfiguration ??= new AssociatedMenuConfiguration();
                    menu.Label = Merge(menu.Label, first, LabelProperties.Label);
                }

                if (second.Count > 0)
                {
                    var menu = manyToManyMetadata.Entity2AssociatedMenuConfiguration ??= new AssociatedMenuConfiguration();
                    menu.Label = Merge(menu.Label, second, LabelProperties.Label);
                }

                units.Add(Unit(
                    new UpdateRelationshipRequest { Relationship = manyToManyMetadata, MergeLabels = true },
                    relationshipItems,
                    manyToManyMetadata.Entity1LogicalName,
                    manyToManyMetadata.Entity2LogicalName));
            }
            else
            {
                failures.Add(new PlannedFailure(relationshipItems, ApplyOutcomes.Skipped, "This relationship no longer exists."));
            }
        }
    }

    /// <summary>
    /// One request per option carrying both its label and description. State options use
    /// <c>UpdateStateValue</c>; Status, Picklist, multi-select, and Yes/No use <c>UpdateOptionValue</c>.
    /// </summary>
    public static WriteUnit? OptionUnit(
        string table,
        AttributeMetadata? attribute,
        int value,
        IReadOnlyList<ApplyRowDto> rows,
        out PlannedFailure? failure)
    {
        failure = null;
        OptionMetadata? option = attribute switch
        {
            BooleanAttributeMetadata boolean => value == 1 ? boolean.OptionSet?.TrueOption : boolean.OptionSet?.FalseOption,
            EnumAttributeMetadata list => list.OptionSet?.Options?.FirstOrDefault(item => item.Value == value),
            _ => null,
        };

        if (attribute is null)
        {
            failure = new PlannedFailure(rows, ApplyOutcomes.Skipped, "This column no longer exists.");
            return null;
        }

        var isGlobal = attribute switch
        {
            BooleanAttributeMetadata boolean => boolean.OptionSet?.IsGlobal == true,
            EnumAttributeMetadata list => list.OptionSet?.IsGlobal == true,
            _ => false,
        };
        if (isGlobal)
        {
            failure = new PlannedFailure(rows, ApplyOutcomes.Failed,
                "This column now uses a global choice. Edit its labels under Global choices.");
            return null;
        }

        if (option is null)
        {
            failure = new PlannedFailure(rows, ApplyOutcomes.Skipped, "This option no longer exists.");
            return null;
        }

        var label = Merge(option.Label, rows, LabelProperties.Label);
        var description = Merge(option.Description, rows, LabelProperties.Description);
        OrganizationRequest request = attribute is StateAttributeMetadata
            ? new UpdateStateValueRequest
            {
                EntityLogicalName = table,
                AttributeLogicalName = attribute.LogicalName,
                Value = value,
                Label = label,
                Description = description,
                MergeLabels = true,
            }
            : new UpdateOptionValueRequest
            {
                EntityLogicalName = table,
                AttributeLogicalName = attribute.LogicalName,
                Value = value,
                Label = label,
                Description = description,
                MergeLabels = true,
            };
        return Unit(request, rows, table);
    }

    private async Task PlanOptionSetAsync(
        string name,
        IReadOnlyList<ApplyRowDto> rows,
        List<WriteUnit> units,
        List<PlannedFailure> failures,
        CancellationToken cancellationToken)
    {
        var optionSet = await ReadAsync(
            () => client.RetrieveOptionSetAsync(name, cancellationToken),
            rows,
            "This choice no longer exists.",
            failures);
        if (optionSet is null) return;

        var setRows = rows.Where(row => row.Key.Value is null).ToList();
        if (setRows.Count > 0)
        {
            optionSet.DisplayName = Merge(optionSet.DisplayName, setRows, LabelProperties.DisplayName);
            optionSet.Description = Merge(optionSet.Description, setRows, LabelProperties.Description);
            var unit = Unit(new UpdateOptionSetRequest { OptionSet = optionSet, MergeLabels = true }, setRows);
            unit.PublishOptionSets.Add(optionSet.Name ?? name);
            units.Add(unit);
        }

        foreach (var group in rows.Where(row => row.Key.Value is not null).GroupBy(row => row.Key.Value!.Value))
        {
            var optionRows = group.ToList();
            OptionMetadata? option = optionSet switch
            {
                BooleanOptionSetMetadata boolean => group.Key == 1 ? boolean.TrueOption : group.Key == 0 ? boolean.FalseOption : null,
                OptionSetMetadata list => list.Options?.FirstOrDefault(item => item.Value == group.Key),
                _ => null,
            };
            if (option is null)
            {
                failures.Add(new PlannedFailure(optionRows, ApplyOutcomes.Skipped, "This option no longer exists."));
                continue;
            }

            var unit = Unit(
                new UpdateOptionValueRequest
                {
                    OptionSetName = optionSet.Name ?? name,
                    Value = group.Key,
                    Label = Merge(option.Label, optionRows, LabelProperties.Label),
                    Description = Merge(option.Description, optionRows, LabelProperties.Description),
                    MergeLabels = true,
                },
                optionRows);
            unit.PublishOptionSets.Add(optionSet.Name ?? name);
            units.Add(unit);
        }
    }

    private async Task PlanRecordsAsync(
        IReadOnlyList<ApplyRowDto> rows,
        List<WriteUnit> units,
        List<PlannedFailure> failures,
        CancellationToken cancellationToken)
    {
        var groups = rows
            .GroupBy(row => (row.Key.Kind, Id: row.Key.RecordId!.Value, row.Key.Property))
            .ToList();
        var targets = groups
            .Select(group => new LocLabelTarget(EntityName(group.Key.Kind), group.Key.Id, group.Key.Property))
            .ToList();

        IReadOnlyList<LocLabelResult> current;
        try
        {
            // SetLocLabels replaces the whole list, so read the current labels (including unpublished) first.
            current = await client.RetrieveLocLabelsAsync(targets, includeUnpublished: true, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            failures.Add(new PlannedFailure(rows, ApplyOutcomes.Failed, TranslatorFaults.RowMessage(ex)));
            return;
        }

        for (var i = 0; i < groups.Count; i++)
        {
            var groupRows = groups[i].ToList();
            var read = current[i];
            if (read.Error is not null)
            {
                var skipped = TranslatorFaults.IsDoesNotExist(read.Error);
                failures.Add(new PlannedFailure(
                    groupRows,
                    skipped ? ApplyOutcomes.Skipped : ApplyOutcomes.Failed,
                    skipped
                        ? $"This {(groups[i].Key.Kind == LabelKinds.View ? "view" : "chart")} no longer exists."
                        : TranslatorFaults.RowMessage(read.Error)));
                continue;
            }

            var merged = MergedLocLabels(read.Label, groupRows);
            var request = new SetLocLabelsRequest
            {
                EntityMoniker = new EntityReference(targets[i].EntityName, targets[i].RecordId),
                AttributeName = targets[i].AttributeName,
                Labels = merged,
            };
            units.Add(Unit(request, groupRows, groupRows[0].Key.Table!.Trim().ToLowerInvariant()));
        }
    }

    /// <summary>The full label list for <c>SetLocLabels</c>: current labels with the changed languages replaced.</summary>
    public static LocalizedLabel[] MergedLocLabels(Label? current, IReadOnlyList<ApplyRowDto> rows)
    {
        var byLcid = new SortedDictionary<int, string>();
        foreach (var label in current?.LocalizedLabels ?? [])
        {
            if (label is not null && label.LanguageCode != 0 && label.Label is not null)
                byLcid[label.LanguageCode] = label.Label;
        }

        foreach (var row in rows)
        foreach (var (lcid, value) in row.Labels)
            byLcid[lcid] = value;

        return byLcid.Select(pair => new LocalizedLabel(pair.Value, pair.Key)).ToArray();
    }

    /// <summary>Applies the changed languages of the matching rows to a label and keeps every other language.</summary>
    public static Label? Merge(Label? label, IEnumerable<ApplyRowDto> rows, string property)
    {
        var changes = rows.Where(row => row.Key.Property == property).SelectMany(row => row.Labels).ToList();
        if (changes.Count == 0) return label;

        label ??= new Label();
        foreach (var (lcid, value) in changes)
        {
            var existing = label.LocalizedLabels.FirstOrDefault(item => item.LanguageCode == lcid);
            if (existing is not null) existing.Label = value;
            else label.LocalizedLabels.Add(new LocalizedLabel(value, lcid));

            if (label.UserLocalizedLabel is { } user && user.LanguageCode == lcid)
                user.Label = value;
        }

        return label;
    }

    private static string EntityName(string kind) =>
        kind == LabelKinds.View ? "savedquery" : "savedqueryvisualization";

    private static WriteUnit Unit(OrganizationRequest request, IReadOnlyList<ApplyRowDto> rows, params string?[] tables)
    {
        var unit = new WriteUnit(request, rows);
        unit.PublishTables.AddRange(tables.Where(table => !string.IsNullOrWhiteSpace(table)).Select(table => table!.Trim().ToLowerInvariant()));
        return unit;
    }

    private static async Task<T?> ReadAsync<T>(
        Func<Task<T>> read,
        IReadOnlyList<ApplyRowDto> rows,
        string missingMessage,
        List<PlannedFailure> failures)
        where T : class
    {
        try
        {
            return await read();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            failures.Add(TranslatorFaults.IsDoesNotExist(ex)
                ? new PlannedFailure(rows, ApplyOutcomes.Skipped, missingMessage)
                : new PlannedFailure(rows, ApplyOutcomes.Failed, TranslatorFaults.RowMessage(ex)));
            return null;
        }
    }
}
