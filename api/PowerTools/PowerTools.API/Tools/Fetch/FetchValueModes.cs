namespace PowerTools.API.Tools.Fetch;

public static class FetchValueModes
{
    public const string Builder = "builder";
    public const string Formatted = "formatted";
    public const string Raw = "raw";

    public static bool TryNormalize(string? value, out string mode)
    {
        mode = string.IsNullOrWhiteSpace(value) ? Builder : value.Trim().ToLowerInvariant();
        return mode is Builder or Formatted or Raw;
    }
}
