namespace PowerTools.API.Tools.PluginRegistration.Dtos;

public sealed record AssemblyInspectionDto(
    string FileName,
    long Size,
    string Sha256,
    AssemblyIdentityInspectionDto Identity,
    string? TargetFramework,
    string RuntimeVersion,
    IReadOnlyList<AssemblyInspectionDiagnosticDto> Diagnostics,
    IReadOnlyList<PluginTypeInspectionDto> Plugins,
    IReadOnlyList<WorkflowActivityInspectionDto> WorkflowActivities);

public sealed record AssemblyIdentityInspectionDto(
    string Name,
    string Version,
    string Culture,
    string PublicKeyToken);

public sealed record PluginTypeInspectionDto(string TypeName);

public sealed record WorkflowActivityInspectionDto(
    string TypeName,
    IReadOnlyList<WorkflowArgumentInspectionDto> Arguments);

public sealed record WorkflowArgumentInspectionDto(
    string PropertyName,
    string Name,
    string TypeName,
    WorkflowArgumentDirection Direction,
    bool IsRequired,
    string? ReferenceTarget);

public sealed record AssemblyInspectionDiagnosticDto(
    string Code,
    string Message,
    AssemblyInspectionDiagnosticSeverity Severity);

public enum AssemblyInspectionDiagnosticSeverity
{
    Warning,
    Error
}

public sealed record AssemblyInspectionErrorDto(string Code, string Message);
