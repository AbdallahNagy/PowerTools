namespace PowerTools.API.Tools.WorkflowActivities;

public static class WorkflowActivityMatching
{
    public static string ClrTypeIdentity(string? typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
            return "";

        var comma = typeName.IndexOf(',');
        var identity = comma >= 0 ? typeName[..comma] : typeName;
        return identity.Trim();
    }

    public static bool XamlContainsType(string? xaml, string? typeName)
    {
        var identity = ClrTypeIdentity(typeName);
        if (identity.Length == 0 || string.IsNullOrEmpty(xaml))
            return false;

        return xaml.Contains(identity, StringComparison.OrdinalIgnoreCase);
    }
}
