using System.Text.RegularExpressions;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public static partial class SolutionComponentFailureText
{
    public static IEnumerable<Guid> IdsIn(string? message)
    {
        if (string.IsNullOrWhiteSpace(message)) yield break;
        foreach (Match match in GuidText().Matches(message))
        {
            if (Guid.TryParse(match.Value, out var id))
                yield return id;
        }
    }

    public static string Format(string dataverseMessage, IReadOnlyDictionary<Guid, string> names)
    {
        var message = dataverseMessage ?? "";
        foreach (var pair in names)
        {
            if (string.IsNullOrWhiteSpace(pair.Value)) continue;
            message = message.Replace(pair.Key.ToString("D"), pair.Value.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        var match = MissingRoot().Match(message);
        if (!match.Success) return message;

        var item = match.Groups["item"].Value.Trim();
        if (Guid.TryParse(item, out _))
            item = "This component";

        var root = match.Groups["root"].Value.Trim();
        var because = root.Equals("Entity", StringComparison.OrdinalIgnoreCase)
            ? "the table it belongs to is not in the target solution"
            : $"its {root} is not in the target solution";
        var code = ErrorCode().Match(dataverseMessage ?? "");
        var suffix = code.Success ? $" {code.Value}" : "";
        return $"{item} cannot be added because {because}.{suffix}";
    }

    [GeneratedRegex(
        @"^Subcomponent (?<item>.+?) cannot be added to the solution because the root component (?<root>.+?) is missing\.",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MissingRoot();

    [GeneratedRegex(@"\((0x[0-9A-Fa-f]+)\)", RegexOptions.CultureInvariant)]
    private static partial Regex ErrorCode();

    [GeneratedRegex(@"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", RegexOptions.CultureInvariant)]
    private static partial Regex GuidText();
}
