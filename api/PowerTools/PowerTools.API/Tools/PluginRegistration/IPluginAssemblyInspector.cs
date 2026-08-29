using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

public interface IPluginAssemblyInspector
{
    Task<AssemblyInspectionDto> InspectAsync(
        Stream assembly,
        string fileName,
        long length,
        CancellationToken cancellationToken);
}

public static class AssemblyInspectionValidationCodes
{
    public const string Empty = "assembly_empty";
    public const string TooLarge = "assembly_too_large";
    public const string InvalidPe = "assembly_invalid_pe";
    public const string NotManaged = "assembly_not_managed";
    public const string MissingAssemblyMetadata = "assembly_metadata_missing";
    public const string Unsigned = "assembly_unsigned";
    public const string FileRequired = "assembly_file_required";
    public const string InspectionFailed = "assembly_inspection_failed";
}

public sealed class AssemblyInspectionValidationException(
    string code,
    string message) : Exception(message)
{
    public string Code { get; } = code;
}
