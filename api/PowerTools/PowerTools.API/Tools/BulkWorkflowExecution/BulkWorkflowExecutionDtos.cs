namespace PowerTools.API.Tools.BulkWorkflowExecution;

public sealed class WorkflowRowDto
{
    public required string Id { get; init; }
    public string Name { get; init; } = "";
    public string PrimaryEntity { get; init; } = "";
    /// <summary>"background" or "realtime".</summary>
    public string Mode { get; init; } = "background";
    /// <summary>"owner" or "callingUser".</summary>
    public string RunAs { get; init; } = "owner";
    /// <summary>"user", "businessUnit", "parentChildBusinessUnits", "organization" or "".</summary>
    public string Scope { get; init; } = "";
    public bool IsManaged { get; init; }
    public bool AsyncAutoDelete { get; init; }
}

public sealed class WorkflowsResponse
{
    public List<WorkflowRowDto> Workflows { get; init; } = [];
}

public sealed class ViewRowDto
{
    public required string Id { get; init; }
    public string Name { get; init; } = "";
    /// <summary>"system" or "personal".</summary>
    public string Kind { get; init; } = "system";
    public string FetchXml { get; init; } = "";
}

public sealed class ViewsResponse
{
    public List<ViewRowDto> Views { get; init; } = [];
}

public sealed class CountBody
{
    public string? WorkflowId { get; init; }
    public string? FetchXml { get; init; }
}

public sealed class CountResponse
{
    public int Count { get; init; }
    public string Entity { get; init; } = "";
}

public sealed class StartRunBody
{
    public string? WorkflowId { get; init; }
    public string? FetchXml { get; init; }
    public int? BatchSize { get; init; }
    public int? DelaySeconds { get; init; }
}

public sealed class RunErrorDto
{
    public string RecordId { get; init; } = "";
    public string Message { get; init; } = "";
}

public sealed class RunDto
{
    public string Status { get; init; } = "";
    public int Total { get; init; }
    public int Processed { get; init; }
    public int Succeeded { get; init; }
    public int Failed { get; init; }
    public List<RunErrorDto> Errors { get; init; } = [];
    public bool ErrorsCapped { get; init; }
    public string StartedAt { get; init; } = "";
    public int? EstimatedSecondsRemaining { get; init; }
    public string? Message { get; init; }
}

/// <summary>Everything a run needs once validation has passed.</summary>
public sealed class PreparedRun
{
    public required Guid WorkflowId { get; init; }
    public required IdQuery Query { get; init; }
    public required int PageSize { get; init; }
    public required int BatchSize { get; init; }
    public required int DelaySeconds { get; init; }
}
