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

public sealed record ColumnAddedDto(Guid Id, string Column);

public sealed record ViewListItemDto(Guid Id, string Name, bool IsDefault, IReadOnlyList<string> Columns);
