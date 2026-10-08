using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Translator;

/// <summary>Languages, label queries, apply preparation, and publish for one request.</summary>
public sealed class TranslatorService(ITranslatorClient client, ITranslatorDelay? delay = null)
{
    private readonly ITranslatorDelay _delay = delay ?? new TranslatorDelay();

    public async Task<TranslatorResult<LanguagesResponse>> GetLanguagesAsync(CancellationToken cancellationToken)
    {
        try
        {
            return TranslatorResult<LanguagesResponse>.Ok(await LoadLanguagesAsync(cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<LanguagesResponse>.Fail(TranslatorFaults.From(ex));
        }
    }

    public async Task<LanguagesResponse> LoadLanguagesAsync(CancellationToken cancellationToken)
    {
        var baseLcid = await client.RetrieveBaseLanguageAsync(cancellationToken);
        var provisioned = await client.RetrieveProvisionedLanguagesAsync(cancellationToken);
        var lcids = provisioned.Append(baseLcid).Where(lcid => lcid > 0).Distinct().ToList();

        IReadOnlyDictionary<int, string> names;
        try
        {
            names = await client.RetrieveLanguageNamesAsync(lcids, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // languagelocale may be missing (for example on some on-premises versions). Fall back to numbers.
            names = new Dictionary<int, string>();
        }

        var languages = lcids
            .Select(lcid => new LanguageDto(lcid, names.TryGetValue(lcid, out var name) ? name : $"LCID {lcid}"))
            .OrderBy(language => language.Lcid == baseLcid ? 0 : 1)
            .ThenBy(language => language.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(language => language.Lcid)
            .ToList();
        return new LanguagesResponse(baseLcid, languages);
    }

    public async Task<TranslatorResult<LabelQueryResponse>> QueryLabelsAsync(
        LabelQueryBody body,
        CancellationToken cancellationToken)
    {
        var kinds = (body.Kinds ?? []).Where(kind => !string.IsNullOrWhiteSpace(kind)).Distinct().ToList();
        if (kinds.Count == 0)
            return TranslatorResult<LabelQueryResponse>.Fail(TranslatorFaults.Invalid("Choose at least one kind of label."));
        var unknown = kinds.FirstOrDefault(kind => !LabelKinds.All.Contains(kind));
        if (unknown is not null)
            return TranslatorResult<LabelQueryResponse>.Fail(TranslatorFaults.Invalid($"Unknown label kind \"{unknown}\"."));

        var tables = (body.Tables ?? [])
            .Where(table => !string.IsNullOrWhiteSpace(table))
            .Select(table => table.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();
        if (tables.Count == 0 && kinds.Any(LabelKinds.TableScoped.Contains))
            return TranslatorResult<LabelQueryResponse>.Fail(TranslatorFaults.Invalid("Choose at least one table."));

        var properties = (body.Properties ?? "both").Trim().ToLowerInvariant();
        if (properties is not ("both" or "names" or "descriptions"))
            return TranslatorResult<LabelQueryResponse>.Fail(
                TranslatorFaults.Invalid("Properties must be names, descriptions, or both."));

        try
        {
            var languages = await LoadLanguagesAsync(cancellationToken);
            var provisioned = languages.Languages.Select(language => language.Lcid).ToHashSet();
            var lcids = (body.Lcids is { Length: > 0 } requested ? requested.Where(provisioned.Contains) : provisioned)
                .Distinct()
                .ToList();
            if (lcids.Count == 0)
                return TranslatorResult<LabelQueryResponse>.Fail(
                    TranslatorFaults.Invalid("None of the requested languages are provisioned."));

            var rows = new List<LabelRowDto>();
            await AddMetadataRowsAsync(rows, tables, kinds, lcids, languages.BaseLcid, cancellationToken);
            if (kinds.Contains(LabelKinds.GlobalChoice))
            {
                var optionSets = await client.RetrieveAllOptionSetsAsync(cancellationToken);
                rows.AddRange(TranslatorMapper.GlobalChoiceRows(optionSets, lcids, languages.BaseLcid));
            }

            if (kinds.Contains(LabelKinds.View))
                rows.AddRange(await RecordRowsAsync(LabelKinds.View, tables, lcids, languages.BaseLcid, cancellationToken));
            if (kinds.Contains(LabelKinds.Chart))
                rows.AddRange(await RecordRowsAsync(LabelKinds.Chart, tables, lcids, languages.BaseLcid, cancellationToken));

            var filtered = properties switch
            {
                "names" => rows.Where(row => !LabelProperties.IsDescription(row.Key.Property)),
                "descriptions" => rows.Where(row => LabelProperties.IsDescription(row.Key.Property)),
                _ => rows,
            };
            return TranslatorResult<LabelQueryResponse>.Ok(new LabelQueryResponse(filtered.ToList()));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<LabelQueryResponse>.Fail(TranslatorFaults.From(ex));
        }
    }

    private async Task AddMetadataRowsAsync(
        List<LabelRowDto> rows,
        IReadOnlyList<string> tables,
        IReadOnlyCollection<string> kinds,
        IReadOnlyList<int> lcids,
        int baseLcid,
        CancellationToken cancellationToken)
    {
        var wantsTable = kinds.Contains(LabelKinds.Table);
        var wantsAttributes = kinds.Contains(LabelKinds.Column) || kinds.Contains(LabelKinds.Choice) ||
                              kinds.Contains(LabelKinds.Boolean);
        var wantsRelationships = kinds.Contains(LabelKinds.Relationship);
        if (!wantsTable && !wantsAttributes && !wantsRelationships) return;

        for (var start = 0; start < tables.Count; start += TranslatorRequests.MetadataChunkSize)
        {
            var chunk = tables.Skip(start).Take(TranslatorRequests.MetadataChunkSize).ToList();
            var request = TranslatorRequests.Metadata(chunk, lcids, wantsAttributes, wantsRelationships);
            var metadata = await client.RetrieveMetadataAsync(request, cancellationToken);
            foreach (var table in metadata.OrderBy(table => chunk.IndexOf(table.LogicalName)))
            {
                if (wantsTable) rows.AddRange(TranslatorMapper.TableRows(table, lcids, baseLcid));
                if (kinds.Contains(LabelKinds.Column)) rows.AddRange(TranslatorMapper.ColumnRows(table, lcids, baseLcid));
                if (kinds.Contains(LabelKinds.Choice)) rows.AddRange(TranslatorMapper.ChoiceRows(table, lcids, baseLcid));
                if (kinds.Contains(LabelKinds.Boolean)) rows.AddRange(TranslatorMapper.BooleanRows(table, lcids, baseLcid));
                if (wantsRelationships) rows.AddRange(TranslatorMapper.RelationshipRows(table, lcids));
            }
        }
    }

    private async Task<IEnumerable<LabelRowDto>> RecordRowsAsync(
        string kind,
        IReadOnlyCollection<string> tables,
        IReadOnlyCollection<int> lcids,
        int baseLcid,
        CancellationToken cancellationToken)
    {
        var view = kind == LabelKinds.View;
        var entityName = view ? "savedquery" : "savedqueryvisualization";
        var tableAttribute = view ? "returnedtypecode" : "primaryentitytypecode";
        var records = await client.RetrieveAllPagesAsync(
            view ? TranslatorRequests.Views(tables) : TranslatorRequests.Charts(tables),
            cancellationToken);
        if (records.Count == 0) return [];

        var targets = records
            .SelectMany(record => new[]
            {
                new LocLabelTarget(entityName, record.Id, LabelProperties.RecordName),
                new LocLabelTarget(entityName, record.Id, LabelProperties.RecordDescription),
            })
            .ToList();
        var labels = await client.RetrieveLocLabelsAsync(targets, includeUnpublished: false, cancellationToken);
        var failed = labels.FirstOrDefault(result => result.Error is not null && !TranslatorFaults.IsDoesNotExist(result.Error));
        if (failed?.Error is not null) throw failed.Error;

        var rows = new List<LabelRowDto>();
        for (var i = 0; i < records.Count; i++)
        {
            var record = records[i];
            var name = labels[i * 2];
            var description = labels[i * 2 + 1];
            if (name.Error is not null) continue;
            var table = TableOf(record, tableAttribute);
            rows.AddRange(TranslatorMapper.RecordRows(kind, table, record, name.Label, description.Label, lcids, baseLcid));
        }

        return rows;
    }

    private static string TableOf(Entity record, string attribute) =>
        (record.Attributes.TryGetValue(attribute, out var value) ? value?.ToString() : null)?.ToLowerInvariant() ?? "";

    /// <summary>
    /// Checks a write before any of it reaches Dataverse. Malformed keys reject the request; empty values and
    /// languages that are not provisioned fail only those labels.
    /// </summary>
    public async Task<TranslatorResult<PreparedApply>> PrepareApplyAsync(ApplyBody body, CancellationToken cancellationToken)
    {
        var rows = body.Rows ?? [];
        if (rows.Count == 0)
            return TranslatorResult<PreparedApply>.Fail(TranslatorFaults.Invalid("Choose at least one label to change."));

        foreach (var row in rows)
        {
            var problem = TranslatorValidation.KeyProblem(row.Key);
            if (problem is not null) return TranslatorResult<PreparedApply>.Fail(TranslatorFaults.Invalid(problem));
            if (row.Labels.Count == 0)
                return TranslatorResult<PreparedApply>.Fail(TranslatorFaults.Invalid("Each row needs at least one label."));
        }

        LanguagesResponse languages;
        try
        {
            languages = await LoadLanguagesAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<PreparedApply>.Fail(TranslatorFaults.From(ex));
        }

        var provisioned = languages.Languages.Select(language => language.Lcid).ToHashSet();
        var valid = new List<ApplyRowDto>();
        var rejected = new List<ApplyResultDto>();
        foreach (var row in rows)
        {
            var keep = new Dictionary<int, string>();
            foreach (var (lcid, value) in row.Labels)
            {
                var message = TranslatorValidation.ValueProblem(row.Key, lcid, value, languages.BaseLcid, provisioned);
                if (message is null) keep[lcid] = value;
                else rejected.Add(new ApplyResultDto { Key = row.Key, Lcids = [lcid], Outcome = ApplyOutcomes.Failed, Message = message });
            }

            if (keep.Count > 0) valid.Add(new ApplyRowDto { Key = row.Key, Labels = keep });
        }

        var batchSize = Math.Clamp(body.BatchSize ?? TranslatorLimits.DefaultBatchSize, TranslatorLimits.MinBatchSize, TranslatorLimits.MaxBatchSize);
        return TranslatorResult<PreparedApply>.Ok(new PreparedApply(valid, rejected, batchSize));
    }

    public async Task<TranslatorResult<PublishResponse>> PublishAsync(PublishBody body, CancellationToken cancellationToken)
    {
        var targets = TranslatorApply.Targets(body.Tables ?? [], body.OptionSets ?? []);
        if (targets.Count == 0)
            return TranslatorResult<PublishResponse>.Fail(TranslatorFaults.Invalid("Choose at least one table or choice to publish."));

        try
        {
            await TranslatorApply.PublishWithRetryAsync(client, _delay, targets, cancellationToken);
            return TranslatorResult<PublishResponse>.Ok(new PublishResponse(PublishStatuses.Succeeded, targets.Count, null));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<PublishResponse>.Fail(TranslatorFaults.From(ex));
        }
    }
}

public sealed record PreparedApply(IReadOnlyList<ApplyRowDto> Rows, IReadOnlyList<ApplyResultDto> Rejected, int BatchSize);

public static class TranslatorLimits
{
    public const int DefaultBatchSize = 10;
    public const int MinBatchSize = 10;
    /// <summary>Metadata writes take a customization lock and time out easily. 50 is a judgment, not a documented limit.</summary>
    public const int MaxBatchSize = 50;
    public const int MaxLockRetries = 3;
    public static readonly TimeSpan LockRetryDelay = TimeSpan.FromSeconds(5);
}

public static class TranslatorValidation
{
    public const string BaseRequiredMessage = "The base language label is required.";
    public const string ClearNotSupportedMessage =
        "Removing a translation is not supported yet. Enter a value or restore the original text.";

    /// <summary>Names that Dataverse requires in the base language.</summary>
    public static bool IsName(string property) =>
        property is LabelProperties.DisplayName or LabelProperties.DisplayCollectionName or LabelProperties.Label
            or LabelProperties.RecordName;

    public static string? ValueProblem(LabelKeyDto key, int lcid, string? value, int baseLcid, IReadOnlySet<int> provisioned)
    {
        if (!provisioned.Contains(lcid)) return $"Language {lcid} is not provisioned in this environment.";
        if (!string.IsNullOrWhiteSpace(value)) return null;
        // How an empty label behaves under MergeLabels is unverified, so clearing is not offered in this version.
        return lcid == baseLcid && IsName(key.Property) ? BaseRequiredMessage : ClearNotSupportedMessage;
    }

    public static string? KeyProblem(LabelKeyDto? key)
    {
        if (key is null) return "A row has no key.";
        string[] allowed;
        switch (key.Kind)
        {
            case LabelKinds.Table:
                if (Missing(key.Table)) return "A table row has no table.";
                allowed = [LabelProperties.DisplayName, LabelProperties.DisplayCollectionName, LabelProperties.Description];
                break;
            case LabelKinds.Column:
                if (Missing(key.Table) || Missing(key.Column)) return "A column row has no table or column.";
                allowed = [LabelProperties.DisplayName, LabelProperties.Description];
                break;
            case LabelKinds.Choice:
                if (Missing(key.Table) || Missing(key.Column) || key.Value is null)
                    return "A choice row has no table, column, or value.";
                allowed = [LabelProperties.Label, LabelProperties.Description];
                break;
            case LabelKinds.Boolean:
                if (Missing(key.Table) || Missing(key.Column) || key.Value is not (0 or 1))
                    return "A Yes/No row has no table, column, or 0/1 value.";
                allowed = [LabelProperties.Label];
                break;
            case LabelKinds.Relationship:
                if (Missing(key.Table) || Missing(key.Relationship) || key.Side is not (null or 1 or 2))
                    return "A relationship row has no table or relationship.";
                allowed = [LabelProperties.Label];
                break;
            case LabelKinds.GlobalChoice:
                if (Missing(key.OptionSet)) return "A global choice row has no choice name.";
                allowed = key.Value is null
                    ? [LabelProperties.DisplayName, LabelProperties.Description]
                    : [LabelProperties.Label, LabelProperties.Description];
                break;
            case LabelKinds.View:
            case LabelKinds.Chart:
                if (Missing(key.Table) || key.RecordId is null || key.RecordId == Guid.Empty)
                    return $"A {key.Kind} row has no table or record id.";
                allowed = [LabelProperties.RecordName, LabelProperties.RecordDescription];
                break;
            default:
                return $"Unknown label kind \"{key.Kind}\".";
        }

        return allowed.Contains(key.Property, StringComparer.Ordinal)
            ? null
            : $"\"{key.Property}\" is not a label of a {key.Kind}.";

        static bool Missing(string? value) => string.IsNullOrWhiteSpace(value);
    }
}

public interface ITranslatorDelay
{
    Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken);
}

public sealed class TranslatorDelay : ITranslatorDelay
{
    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken) =>
        delay <= TimeSpan.Zero ? Task.CompletedTask : Task.Delay(delay, cancellationToken);
}
