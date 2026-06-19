namespace PowerTools.API.Tools.DataMigration.Dtos;

public record PreviewRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter = null,
    int PageSize = 50,
    string? PagingCookie = null,
    int Page = 1);