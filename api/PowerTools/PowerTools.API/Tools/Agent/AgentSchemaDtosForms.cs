namespace PowerTools.API.Tools.Agent;

public sealed class AddFormColumnBody
{
    public string? Table { get; set; }
    public string? FormId { get; set; }
    public string? Column { get; set; }
    public string? Tab { get; set; }
    public string? Section { get; set; }
    public string? Solution { get; set; }
}

public sealed class AddViewColumnBody
{
    public string? Table { get; set; }
    public string? ViewId { get; set; }
    public string? Column { get; set; }
    public int? Width { get; set; }
    public string? Solution { get; set; }
}

public sealed class RemoveFormColumnBody
{
    public string? Table { get; set; }
    public string? FormId { get; set; }
    public string? Column { get; set; }
    public string? Solution { get; set; }
}

public sealed class RemoveViewColumnBody
{
    public string? Table { get; set; }
    public string? ViewId { get; set; }
    public string? Column { get; set; }
    public string? Solution { get; set; }
}

public sealed record ColumnAddedDto(Guid Id, string Column);

/// <summary><paramref name="RemovedFromQuery"/> is false when the query keeps the column (the view's id or jump column) or never had it.</summary>
public sealed record ViewColumnRemovedDto(Guid Id, string Column, bool RemovedFromQuery);

/// <summary><paramref name="Places"/> names where the column was: "Tab / Section", "header" or "footer".</summary>
public sealed record ColumnRemovedDto(Guid Id, string Column, IReadOnlyList<string> Places);

public sealed record ViewListItemDto(Guid Id, string Name, bool IsDefault, IReadOnlyList<string> Columns);
