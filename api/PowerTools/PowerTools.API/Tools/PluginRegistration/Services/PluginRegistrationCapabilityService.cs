using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration.Services;

// Deliberately disabled until Task 13 proves this request shape in a disposable environment.
public sealed class PluginRegistrationCapabilityService(bool transactionalCascadeReleaseApproved = false)
{
    public PluginRegistrationCapabilitiesDto GetCapabilities(
        bool environmentSupportsTransaction = false,
        bool onPremisesAssemblyOptions = false) =>
        transactionalCascadeReleaseApproved && environmentSupportsTransaction
            ? new(new(true, "Transactional cascade unregister is available."), onPremisesAssemblyOptions)
            : new(new(false, transactionalCascadeReleaseApproved
                ? "This connected environment does not support the required transactional delete request."
                : "Transactional cascade unregister is not release-approved yet."), onPremisesAssemblyOptions);

    public bool IsTransactionalCascadeSupported(bool environmentSupportsTransaction = true) =>
        GetCapabilities(environmentSupportsTransaction).TransactionalCascadeUnregister.Supported;
}
