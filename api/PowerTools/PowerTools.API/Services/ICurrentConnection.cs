using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Utils;

namespace PowerTools.API.Services;

/// <summary>
/// Per-request abstraction over the caller's Dataverse connection.
///
/// Today the implementation reads token + environment URL out of
/// <c>HttpContext.Items</c> (populated by <see cref="Filters.DataverseContextFilter"/>).
/// This indirection exists so v2 third-party tool endpoints, loaded into the
/// same sidecar process, can depend on a stable scoped service instead of
/// knowing about specific request headers.
/// </summary>
public interface ICurrentConnection
{
    DataverseConnectionContext Context { get; }
    string EnvironmentUrl { get; }
    ServiceClient CreateClient();
}

internal sealed class HttpContextCurrentConnection(
    IHttpContextAccessor accessor,
    DataverseClientFactory factory) : ICurrentConnection
{
    private HttpContext Http => accessor.HttpContext
        ?? throw new InvalidOperationException(
            "ICurrentConnection resolved outside of an HTTP request scope.");

    public DataverseConnectionContext Context => Http.GetDataverseConnectionContext();
    public string EnvironmentUrl => Http.GetEnvironmentUrl();
    public ServiceClient CreateClient() => Http.CreateDataverseClient(factory);
}
