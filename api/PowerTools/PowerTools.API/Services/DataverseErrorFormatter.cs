using System.Net.Sockets;
using Microsoft.Xrm.Sdk;
using System.ServiceModel;

namespace PowerTools.API.Services;

public static class DataverseErrorFormatter
{
    public static string Format(Exception ex)
    {
        if (ContainsSocketTimeout(ex))
        {
            return "The Dataverse server did not respond on the network. Check the server URL, VPN, firewall/IP allowlist, and that port 443 is reachable.";
        }

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

        return string.Join(
            " Inner error: ",
            EnumerateMessages(ex).Distinct(StringComparer.Ordinal));
    }

    private static bool ContainsSocketTimeout(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is SocketException
                {
                    SocketErrorCode: SocketError.TimedOut or SocketError.HostUnreachable or SocketError.NetworkUnreachable
                })
            {
                return true;
            }
        }

        return false;
    }

    private static IEnumerable<string> EnumerateMessages(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
            {
                yield return current.Message.Trim();
            }
        }
    }
}
