using System.Net;
using System.Security;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Errors;

public sealed class PluginRegistrationProblemTests
{
    [Fact]
    public void Serialized_problem_never_exposes_sensitive_exception_details()
    {
        const string token = "eyJhbGciOiJIUzI1NiJ9.secret.signature";
        const string secureValue = "correct-horse-battery-staple";
        const string dllBytes = "TVqQAAMAAAAEAAAA";
        const string stackTrace = "at Contoso.Plugin.Execute() in C:\\Secret\\Plugin.cs:line 42";
        const string faultDetail = "Dataverse fault detail that must remain private";
        using var secureString = new SecureString();
        foreach (var character in secureValue)
            secureString.AppendChar(character);

        var exception = new InvalidOperationException(
            $"token={token}; secure={secureValue}; dll={dllBytes}; {stackTrace}; {faultDetail}");
        exception.Data["secure"] = secureString;
        exception.Data["dll"] = Convert.FromBase64String(dllBytes);
        var mapped = PluginRegistrationProblem.FromException(
            exception,
            "https://contoso.crm.dynamics.com");
        var serialized = JsonSerializer.Serialize(mapped.Problem);

        Assert.Equal(StatusCodes.Status502BadGateway, mapped.StatusCode);
        Assert.Equal("dataverse", mapped.Problem.Category);
        Assert.DoesNotContain(token, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(secureValue, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(dllBytes, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(stackTrace, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(faultDetail, serialized, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "authentication", 401)]
    [InlineData(HttpStatusCode.Forbidden, "permission", 403)]
    [InlineData(HttpStatusCode.ServiceUnavailable, "communication", 503)]
    public void Http_failures_map_to_safe_category_and_status(
        HttpStatusCode statusCode,
        string category,
        int expectedStatus)
    {
        var mapped = PluginRegistrationProblem.FromException(
            new HttpRequestException("raw remote failure", null, statusCode),
            "https://contoso.crm.dynamics.com");

        Assert.Equal(expectedStatus, mapped.StatusCode);
        Assert.Equal(category, mapped.Problem.Category);
        Assert.DoesNotContain("raw remote failure", mapped.Problem.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Validation_failure_maps_to_safe_validation_problem()
    {
        var mapped = PluginRegistrationProblem.FromException(
            new ArgumentException("untrusted payload details"),
            "https://contoso.crm.dynamics.com",
            "step");

        Assert.Equal(StatusCodes.Status400BadRequest, mapped.StatusCode);
        Assert.Equal("validation", mapped.Problem.Category);
        Assert.Equal("step", mapped.Problem.Component);
        Assert.DoesNotContain("untrusted payload details", mapped.Problem.Message, StringComparison.Ordinal);
    }
}
