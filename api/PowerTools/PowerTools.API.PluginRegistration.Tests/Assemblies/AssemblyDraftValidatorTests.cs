using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Assemblies;

public sealed class AssemblyDraftValidatorTests
{
    [Fact]
    public void Accepts_sandbox_database_on_online_environments()
    {
        var problems = AssemblyDraftValidator.ValidateRegister(
            ValidInspection(),
            new AssemblyRegisterRequest(2, 0),
            Online());

        Assert.Empty(problems);
    }

    [Fact]
    public void Accepts_none_and_disk_on_premises()
    {
        var problems = AssemblyDraftValidator.ValidateRegister(
            ValidInspection(),
            new AssemblyRegisterRequest(1, 1),
            OnPrem());

        Assert.Empty(problems);
    }

    [Fact]
    public void Rejects_none_isolation_when_online()
    {
        var problems = AssemblyDraftValidator.ValidateRegister(
            ValidInspection(),
            new AssemblyRegisterRequest(1, 0),
            Online());

        Assert.Contains(problems, problem =>
            problem.Field == "isolationMode" && problem.Code == "unsupported_environment");
    }

    [Fact]
    public void Rejects_disk_source_when_online()
    {
        var problems = AssemblyDraftValidator.ValidateRegister(
            ValidInspection(),
            new AssemblyRegisterRequest(2, 1),
            Online());

        Assert.Contains(problems, problem =>
            problem.Field == "sourceType" && problem.Code == "unsupported_environment");
    }

    [Fact]
    public void Rejects_invalid_isolation_and_source()
    {
        var problems = AssemblyDraftValidator.ValidateRegister(
            ValidInspection(),
            new AssemblyRegisterRequest(3, 2),
            OnPrem());

        Assert.Contains(problems, problem => problem.Field == "isolationMode" && problem.Code == "invalid");
        Assert.Contains(problems, problem => problem.Field == "sourceType" && problem.Code == "invalid");
    }

    [Fact]
    public void Rejects_error_diagnostics()
    {
        var inspection = ValidInspection() with
        {
            Diagnostics =
            [
                new AssemblyInspectionDiagnosticDto(
                    "target_framework_unsupported",
                    "Unsupported framework.",
                    AssemblyInspectionDiagnosticSeverity.Error),
            ],
        };

        var problems = AssemblyDraftValidator.ValidateInspection(inspection);

        Assert.Contains(problems, problem => problem.Code == "target_framework_unsupported");
    }

    [Fact]
    public void Rejects_assemblies_with_no_types()
    {
        var inspection = ValidInspection() with
        {
            Plugins = [],
            WorkflowActivities = [],
        };

        var problems = AssemblyDraftValidator.ValidateInspection(inspection);

        Assert.Contains(problems, problem => problem.Code == "assembly_no_types");
    }

    private static AssemblyInspectionDto ValidInspection() => new(
        "Contoso.Plugins.dll",
        10,
        "abc",
        new AssemblyIdentityInspectionDto("Contoso.Plugins", "1.0.0.0", "neutral", "token"),
        ".NETFramework,Version=v4.6.2",
        "v4.0.30319",
        [],
        [new PluginTypeInspectionDto("Contoso.Plugins.AccountPlugin")],
        []);

    private static CapabilitiesDto Online() => new(true, [2], [0]);

    private static CapabilitiesDto OnPrem() => new(false, [1, 2], [0, 1]);
}
