using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Validation;

public static class AssemblyDraftValidator
{
    public static IReadOnlyList<RegistrationProblem> ValidateRegister(
        AssemblyInspectionDto inspection,
        AssemblyRegisterRequest request,
        CapabilitiesDto capabilities)
    {
        var problems = new List<RegistrationProblem>(ValidateInspection(inspection));

        if (request.IsolationMode is not (
            RegistrationOptionValues.IsolationNone or RegistrationOptionValues.IsolationSandbox))
        {
            problems.Add(new(
                "isolationMode",
                "invalid",
                "Isolation must be None or Sandbox."));
        }
        else if (!capabilities.IsolationModes.Contains(request.IsolationMode))
        {
            problems.Add(new(
                "isolationMode",
                "unsupported_environment",
                capabilities.IsOnline
                    ? "Online environments require sandbox isolation."
                    : "The selected isolation mode is not available for this connection."));
        }

        if (request.SourceType is not (
            RegistrationOptionValues.SourceDatabase or RegistrationOptionValues.SourceDisk))
        {
            problems.Add(new(
                "sourceType",
                "invalid",
                "Source must be Database or Disk."));
        }
        else if (!capabilities.SourceTypes.Contains(request.SourceType))
        {
            problems.Add(new(
                "sourceType",
                "unsupported_environment",
                capabilities.IsOnline
                    ? "Online environments require database source."
                    : "The selected source type is not available for this connection."));
        }

        return problems;
    }

    public static IReadOnlyList<RegistrationProblem> ValidateInspection(
        AssemblyInspectionDto inspection)
    {
        var problems = new List<RegistrationProblem>();
        foreach (var diagnostic in inspection.Diagnostics)
        {
            if (diagnostic.Severity != AssemblyInspectionDiagnosticSeverity.Error)
                continue;
            problems.Add(new("assembly", diagnostic.Code, diagnostic.Message));
        }

        if (inspection.Plugins.Count == 0 && inspection.WorkflowActivities.Count == 0)
        {
            problems.Add(new(
                "assembly",
                "assembly_no_types",
                "The assembly contains no plug-in types or workflow activities."));
        }

        return problems;
    }
}
