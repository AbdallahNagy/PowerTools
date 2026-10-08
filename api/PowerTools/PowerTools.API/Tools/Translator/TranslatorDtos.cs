namespace PowerTools.API.Tools.Translator;

/// <summary>Component kinds the Translator grid reads and writes.</summary>
public static class LabelKinds
{
    public const string Table = "table";
    public const string Column = "column";
    public const string Choice = "choice";
    public const string GlobalChoice = "globalChoice";
    public const string Boolean = "boolean";
    public const string Relationship = "relationship";
    public const string View = "view";
    public const string Chart = "chart";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Table, Column, Choice, GlobalChoice, Boolean, Relationship, View, Chart,
    };

    /// <summary>Kinds that belong to a table and need table logical names in a query.</summary>
    public static readonly IReadOnlySet<string> TableScoped = new HashSet<string>(StringComparer.Ordinal)
    {
        Table, Column, Choice, Boolean, Relationship, View, Chart,
    };
}

/// <summary>Which label of a component a row holds.</summary>
public static class LabelProperties
{
    public const string DisplayName = "DisplayName";
    public const string DisplayCollectionName = "DisplayCollectionName";
    public const string Description = "Description";
    public const string Label = "Label";
    /// <summary>savedquery / savedqueryvisualization <c>name</c>.</summary>
    public const string RecordName = "name";
    /// <summary>savedquery / savedqueryvisualization <c>description</c>.</summary>
    public const string RecordDescription = "description";

    public static bool IsDescription(string property) =>
        property is Description or RecordDescription;
}

public sealed record LanguageDto(int Lcid, string Name);

public sealed record LanguagesResponse(int BaseLcid, IReadOnlyList<LanguageDto> Languages);

/// <summary>Identifies one label of one component. Only the fields the kind needs are set.</summary>
public sealed class LabelKeyDto
{
    public string Kind { get; set; } = "";
    public string? Table { get; set; }
    public string? Column { get; set; }
    public string? OptionSet { get; set; }
    public int? Value { get; set; }
    public Guid? RecordId { get; set; }
    public string? Relationship { get; set; }
    /// <summary>N:N relationships only: 1 for the first table's menu, 2 for the second.</summary>
    public int? Side { get; set; }
    public string Property { get; set; } = "";
}

public sealed class LabelRowDto
{
    public LabelKeyDto Key { get; set; } = new();
    /// <summary>The component's name in the base language, for display.</summary>
    public string Component { get; set; } = "";
    /// <summary>Logical or schema name shown under the component name.</summary>
    public string? ComponentName { get; set; }
    /// <summary>Extra identifying text, such as 1:N / N:N or a view type.</summary>
    public string? Detail { get; set; }
    /// <summary>Global Yes/No sets only: the option rows are True and False.</summary>
    public bool BooleanSet { get; set; }
    /// <summary>Set when the row cannot be edited, with the reason.</summary>
    public string? ReadOnlyReason { get; set; }
    /// <summary>Label text per LCID. Languages with no label are left out.</summary>
    public Dictionary<int, string> Labels { get; set; } = [];
}

public sealed class LabelQueryBody
{
    public string[]? Tables { get; set; }
    public string[]? Kinds { get; set; }
    public int[]? Lcids { get; set; }
    /// <summary>names, descriptions, or both (default).</summary>
    public string? Properties { get; set; }
}

public sealed record LabelQueryResponse(IReadOnlyList<LabelRowDto> Rows);

public sealed class ApplyRowDto
{
    public LabelKeyDto Key { get; set; } = new();
    /// <summary>Only the changed languages.</summary>
    public Dictionary<int, string> Labels { get; set; } = [];
}

public sealed class ApplyBody
{
    public List<ApplyRowDto>? Rows { get; set; }
    public int? BatchSize { get; set; }
}

public sealed record ApplyStartedResponse(Guid JobId);

public static class ApplyOutcomes
{
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
    public const string Skipped = "skipped";
}

public sealed class ApplyResultDto
{
    public LabelKeyDto Key { get; set; } = new();
    public int[] Lcids { get; set; } = [];
    public string Outcome { get; set; } = ApplyOutcomes.Succeeded;
    public string? Message { get; set; }
}

public static class PublishStatuses
{
    public const string Pending = "pending";
    public const string Running = "running";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
    public const string NotNeeded = "notNeeded";
}

public sealed class PublishTargetsDto
{
    public List<string> Tables { get; set; } = [];
    public List<string> OptionSets { get; set; } = [];

    public int Count => Tables.Count + OptionSets.Count;
}

public sealed class PublishResultDto
{
    public string Status { get; set; } = PublishStatuses.Pending;
    public PublishTargetsDto Targets { get; set; } = new();
    public string? Message { get; set; }
}

public sealed record JobLogDto(string Level, string Message);

public sealed class TranslatorJobDto
{
    /// <summary>queued, running, completed, or failed.</summary>
    public string Status { get; set; } = "queued";
    /// <summary>updating, publishing, or done.</summary>
    public string Phase { get; set; } = "updating";
    /// <summary>Counts are in labels: one row key and one language.</summary>
    public int Processed { get; set; }
    public int Total { get; set; }
    public int Succeeded { get; set; }
    public int Failed { get; set; }
    public int Skipped { get; set; }
    public List<ApplyResultDto> Results { get; set; } = [];
    public PublishResultDto Publish { get; set; } = new();
    public List<JobLogDto> Log { get; set; } = [];
}

public sealed class PublishBody
{
    public string[]? Tables { get; set; }
    public string[]? OptionSets { get; set; }
}

public sealed record PublishResponse(string Status, int Count, string? Message);
