using PowerTools.API.Filters;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationEndpoints
{
    public static IEndpointRouteBuilder MapPluginRegistrationEndpoints(
        this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/plugin-registration")
            .AddEndpointFilter<DataverseContextFilter>();

        group.MapGet("/capabilities", (CapabilitiesService capabilities) =>
            Results.Ok(capabilities.Get()));

        return app;
    }

    internal static async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (RegistrationException ex)
        {
            return Results.Json(ex.Problem, statusCode: ex.StatusCode);
        }
        catch (Exception ex)
        {
            return Results.Json(
                new ProblemResponse(
                    "dataverse_error",
                    DataverseErrorFormatter.Format(ex),
                    Array.Empty<RegistrationProblem>()),
                statusCode: StatusCodes.Status502BadGateway);
        }
    }
}
