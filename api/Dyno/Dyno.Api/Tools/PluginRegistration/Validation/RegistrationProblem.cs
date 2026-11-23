namespace Dyno.Api.Tools.PluginRegistration.Validation;

public sealed record RegistrationProblem(string Field, string Code, string Message);
