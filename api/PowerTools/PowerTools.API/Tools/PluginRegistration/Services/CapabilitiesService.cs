using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class CapabilitiesService(ICurrentConnection connection)
{
    public CapabilitiesDto Get()
    {
        var isOnline = connection.Context is OnlineConnectionContext;
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
