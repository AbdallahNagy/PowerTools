using PowerTools.API.Tools.PluginRegistration.Dtos;

namespace PowerTools.API.Tools.PluginRegistration;

// Deliberately disabled until Task 13 proves this request shape in a disposable environment.
public sealed class PluginRegistrationCapabilityService(bool transactionalCascadeReleaseApproved = false)
{
    public PluginRegistrationCapabilitiesDto GetCapabilities(bool environmentSupportsTransaction = false) =>
        transactionalCascadeReleaseApproved && environmentSupportsTransaction
            ? new(new(true, "Transactional cascade unregister is available."))
            : new(new(false, transactionalCascadeReleaseApproved
                ? "This connected environment does not support the required transactional delete request."
                : "Transactional cascade unregister is not release-approved yet."));

    public bool IsTransactionalCascadeSupported(bool environmentSupportsTransaction = true) =>
        GetCapabilities(environmentSupportsTransaction).TransactionalCascadeUnregister.Supported;
}
