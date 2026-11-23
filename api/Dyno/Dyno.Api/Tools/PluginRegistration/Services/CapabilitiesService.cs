using Dyno.Api.Services;
using Dyno.Api.Tools.PluginRegistration.Dtos;
using Dyno.Api.Tools.PluginRegistration.Validation;

namespace Dyno.Api.Tools.PluginRegistration.Services;

public sealed class CapabilitiesService(ICurrentConnection connection)
{
    public CapabilitiesDto Get() => For(connection.Context is OnlineConnectionContext);

    /// <summary>What an online or on-premises environment allows.</summary>
    public static CapabilitiesDto For(bool isOnline)
    {
        return isOnline
            ? new CapabilitiesDto(
                true,
                [RegistrationOptionValues.IsolationSandbox],
                [RegistrationOptionValues.SourceDatabase])
            : new CapabilitiesDto(
                false,
                [
                    RegistrationOptionValues.IsolationNone,
                    RegistrationOptionValues.IsolationSandbox,
                ],
                [
                    RegistrationOptionValues.SourceDatabase,
                    RegistrationOptionValues.SourceDisk,
                ]);
    }
}
