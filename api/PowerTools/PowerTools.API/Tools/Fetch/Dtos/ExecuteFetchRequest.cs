namespace PowerTools.API.Tools.Fetch.Dtos;

public record ExecuteFetchRequest(
    string FetchXml,
    int Page = 1,
    int PageSize = 50,
    string? PagingCookie = null,
    bool ReturnTotalRecordCount = false,
    // FetchXML Builder leaves this false so paging stays injected.
    // FetchXML Tester sets it so the query runs unchanged.
    bool PreserveFetchXml = false,
    // builder keeps the FetchXML Builder cell shape.
    // formatted and raw are the tester's whole-grid modes.
    string? ValueMode = "builder");
