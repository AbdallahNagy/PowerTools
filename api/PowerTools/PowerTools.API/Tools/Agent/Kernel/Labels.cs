using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// Labels in the organization's base language. A planner compares only the languages a spec gives, so a missing
/// translation is never a change.
/// </summary>
public static class Labels
{
    public static async Task<int> BaseLanguageAsync(IAgentClient client, CancellationToken ct)
    {
        var query = new QueryExpression("organization") { TopCount = 1, ColumnSet = new ColumnSet("languagecode"), NoLock = true };
        var row = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        return row?.GetAttributeValue<int?>("languagecode") ?? 1033;
    }

    /// <summary>A label in the base language plus any extra languages the spec gave (language code → text).</summary>
    public static Label Make(string text, int baseLanguage, IReadOnlyDictionary<int, string>? extra = null)
    {
        var label = new Label(text, baseLanguage);
        foreach (var (language, value) in extra ?? new Dictionary<int, string>())
        {
            if (language != baseLanguage) label.LocalizedLabels.Add(new LocalizedLabel(value, language));
        }

        return label;
    }

    /// <summary>
    /// True when <paramref name="current"/> already says what the spec wants, in the base language and in each extra
    /// language the spec gave. Languages the spec leaves out are not compared.
    /// </summary>
    public static bool Matches(Label? current, string wanted, int baseLanguage, IReadOnlyDictionary<int, string>? extra = null)
    {
        if (!string.Equals(Text(current, baseLanguage), wanted, StringComparison.Ordinal)) return false;
        return (extra ?? new Dictionary<int, string>())
            .Where(pair => pair.Key != baseLanguage)
            .All(pair => string.Equals(Text(current, pair.Key), pair.Value, StringComparison.Ordinal));
    }

    public static string? Text(Label? label, int language) =>
        label?.LocalizedLabels.FirstOrDefault(l => l.LanguageCode == language)?.Label
        ?? (label?.UserLocalizedLabel?.LanguageCode == language ? label.UserLocalizedLabel.Label : null);
}
