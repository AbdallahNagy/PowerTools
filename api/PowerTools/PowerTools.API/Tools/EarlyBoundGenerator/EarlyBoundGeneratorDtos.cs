namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>
/// The options Microsoft's ModelBuilder supports, as sent by the tool. Table names are explicit
/// logical names; the renderer expands wildcards against <c>GET /tables</c> before sending.
/// </summary>
public sealed class GenerationSettingsDto
{
    public string OutputDirectory { get; set; } = "";
    public string Namespace { get; set; } = "";
    public string ServiceContextName { get; set; } = "";
    public string EntityTypesFolder { get; set; } = "Entities";
    public string OptionSetsTypesFolder { get; set; } = "OptionSets";
    public string MessagesTypesFolder { get; set; } = "Messages";
    public List<string> EntityNamesFilter { get; set; } = [];
    public List<string> MessageNamesFilter { get; set; } = [];
    public bool GenerateMessages { get; set; }
    public bool GenerateGlobalOptionSets { get; set; }
    public bool EmitFieldsClasses { get; set; }
    public bool EmitVirtualAttributes { get; set; }
    public bool EmitEntityETC { get; set; }
    public bool SuppressINotifyPattern { get; set; }
    public bool SuppressGeneratedCodeAttribute { get; set; }
}

public sealed record ValidationProblemDto(string Field, string Message);

public sealed record JobStartedResponse(Guid JobId);

public sealed record TableNamesResponse(IReadOnlyList<string> Tables);

public static class GeneratedFileKinds
{
    public const string Table = "Table";
    public const string Choice = "Choice";
    public const string Message = "Message";
    public const string ServiceContext = "Service context";
    public const string Settings = "Settings";
}

public sealed record GeneratedFileDto(string Path, string Kind, string Name, long Bytes);

public static class JobStates
{
    public const string Queued = "queued";
    public const string Running = "running";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
}

public static class JobStages
{
    public const string ReadingMetadata = "readingMetadata";
    public const string WritingCode = "writingCode";
}

/// <summary>Why a run failed, so the renderer can word it plainly.</summary>
public static class FailureKinds
{
    public const string FolderAccess = "folderAccess";
    public const string Folder = "folder";
    public const string Privilege = "privilege";
    public const string Connection = "connection";
    public const string Other = "other";
}

public sealed class EarlyBoundGeneratorJobDto
{
    public string State { get; set; } = JobStates.Queued;
    public string? Stage { get; set; }
    public List<string> Log { get; set; } = [];
    public List<GeneratedFileDto> Files { get; set; } = [];
    public string? Error { get; set; }
    public string? ErrorKind { get; set; }
    public string OutputDirectory { get; set; } = "";
    public long? DurationMs { get; set; }
}

/// <summary>Values read from an existing builderSettings.json. Missing or mistyped keys are null.</summary>
public sealed class LoadedSettingsDto
{
    public string? Namespace { get; set; }
    public string? ServiceContextName { get; set; }
    public string? EntityTypesFolder { get; set; }
    public string? OptionSetsTypesFolder { get; set; }
    public string? MessagesTypesFolder { get; set; }
    public List<string>? EntityNamesFilter { get; set; }
    public List<string>? MessageNamesFilter { get; set; }
    public bool? GenerateSdkMessages { get; set; }
    public bool? GenerateGlobalOptionSets { get; set; }
    public bool? EmitFieldsClasses { get; set; }
    public bool? EmitVirtualAttributes { get; set; }
    public bool? EmitEntityETC { get; set; }
    public bool? SuppressINotifyPattern { get; set; }
    public bool? SuppressGeneratedCodeAttribute { get; set; }
}

public sealed record FolderInfoDto(
    string Path,
    bool Exists,
    bool HasOtherFiles,
    LoadedSettingsDto? Settings,
    string? SettingsError);
