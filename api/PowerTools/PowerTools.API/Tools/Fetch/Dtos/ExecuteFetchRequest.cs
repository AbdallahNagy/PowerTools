namespace PowerTools.API.Tools.Fetch.Dtos;

public record ExecuteFetchRequest(
    string FetchXml,
    int Page = 1,
    int PageSize = 50,
    string? PagingCookie = null);
