namespace PowerTools.API.Tools.DataMigration.Dtos;

public record PreviewRequest(
    string EntityLogicalName,
    string? FetchXmlFilter = null,
    int PageSize = 50,
    string? PagingCookie = null,
    int Page = 1);

public record RecordCountRequest(
    string EntityLogicalName,
    string? FetchXmlFilter = null);

public record ExistingRecordsRequest(
    string EntityLogicalName,
    List<Guid> Ids);
