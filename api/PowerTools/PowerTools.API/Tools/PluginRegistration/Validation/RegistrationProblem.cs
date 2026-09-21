namespace PowerTools.API.Tools.PluginRegistration.Validation;

public sealed record RegistrationProblem(string Field, string Code, string Message);
