namespace PowerTools.API.Services;

public abstract record DataverseConnectionContext(string EnvironmentUrl);

public sealed record OnlineConnectionContext(
    string EnvironmentUrl,
    string AccessToken) : DataverseConnectionContext(EnvironmentUrl);

public sealed record OnPremisesConnectionContext(
    string EnvironmentUrl,
    string AuthMode,
    string Username,
    string Password,
    string Domain) : DataverseConnectionContext(EnvironmentUrl);
