using System.ComponentModel;
using System.Text.Json.Serialization;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Solutions;

[JsonConverter(typeof(JsonStringEnumConverter<ImportMode>))]
public enum ImportMode
{
    /// <summary>Import over what is installed. Components the new version no longer has are kept.</summary>
    [JsonStringEnumMemberName("update")] Update,

    /// <summary>Managed only: import as a holding solution, then delete the old version and what it no longer has.</summary>
    [JsonStringEnumMemberName("upgrade")] Upgrade,

    /// <summary>Managed only: import as a holding solution (name_Upgrade) and stop, so the upgrade can be applied later.</summary>
    [JsonStringEnumMemberName("stage")] Stage,
}

[Description("A solution .zip to import. Importing the version that is already installed changes nothing unless force is set.")]
public sealed class SolutionImportSpec : IApplySpec
{
    [Description("Absolute path of the solution .zip on this computer.")]
    public required string Path { get; init; }

    [Description("update (default): import over the installed version. upgrade (managed): also delete components the new version no longer has. stage (managed): import as a holding solution only.")]
    public ImportMode? Mode { get; init; }

    [Description("Overwrite unmanaged customizations of the same components. Default false.")]
    public bool? OverwriteUnmanagedCustomizations { get; init; }

    [Description("Turn on the solution's workflows after the import. Default true.")]
    public bool? PublishWorkflows { get; init; }

    [Description("Import even when the same version is already installed.")]
    public bool? Force { get; init; }

    [Description("Environment variable values for the target: schema name → value.")]
    public Dictionary<string, string>? EnvironmentVariables { get; init; }

    [Description("Connections for connection references: logical name → connection id. Online only.")]
    public Dictionary<string, string>? ConnectionReferences { get; init; }

    /// <summary>An import is not made into a solution; the file is one.</summary>
    string? IApplySpec.Solution => null;
}
