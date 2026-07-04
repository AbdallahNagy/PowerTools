using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Utils;

public static class DataverseValueFormatter
{
    public static object? Format(object? val) => val switch
    {
        EntityReference er  => new { id = er.Id.ToString(), name = er.Name, logicalName = er.LogicalName },
        OptionSetValue osv  => osv.Value,
        Money money         => money.Value,
        AliasedValue av     => Format(av.Value),
        _                   => val
    };
}
