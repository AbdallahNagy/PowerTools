using Microsoft.Xrm.Sdk;
using System.ServiceModel;

namespace PowerTools.API.Services;

public static class DataverseErrorFormatter
{
    public static string Format(Exception ex)
    {
        if (ex is FaultException<OrganizationServiceFault> fault)
        {
            var detail = fault.Detail;
            var code = detail.ErrorCode != 0 ? $" (0x{detail.ErrorCode:X8})" : "";
            return string.IsNullOrWhiteSpace(detail.Message)
                ? $"Dataverse error{code}: {fault.Message}"
                : $"{detail.Message}{code}";
        }

        if (ex.InnerException is FaultException<OrganizationServiceFault> inner)
            return Format(inner);

        return ex.Message;
    }
}
