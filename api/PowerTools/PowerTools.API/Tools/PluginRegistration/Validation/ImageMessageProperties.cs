namespace PowerTools.API.Tools.PluginRegistration.Validation;

public static class ImageMessageProperties
{
    // Create uses Id following XrmToolBox/PRT. Microsoft Learn currently lists Target.
    // If a live org rejects Id, change this one map entry.
    private static readonly Dictionary<string, string> Properties = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Create"] = "Id",
        ["Update"] = "Target",
        ["Delete"] = "Target",
        ["Assign"] = "Target",
        ["Merge"] = "Target",
        ["SetState"] = "EntityMoniker",
        ["SetStateDynamicEntity"] = "EntityMoniker",
        ["CreateMultiple"] = "Ids",
        ["UpdateMultiple"] = "Targets",
        ["DeliverIncoming"] = "EmailId",
        ["DeliverPromote"] = "EmailId",
        ["Send"] = "EmailId",
    };

    public static bool TryGet(string? messageName, out string propertyName) =>
        Properties.TryGetValue(messageName?.Trim() ?? "", out propertyName!);
}
