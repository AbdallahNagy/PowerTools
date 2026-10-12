using System.Text.RegularExpressions;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>
/// Checks run before a job is queued. ModelBuilder's own <c>VerifyArguments</c> result is ignored by the
/// engine, so this is the only gate.
/// </summary>
public static partial class EarlyBoundGeneratorValidation
{
    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")]
    private static partial Regex NamespacePattern();

    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex IdentifierPattern();

    [GeneratedRegex(@"^[a-z0-9_]+$")]
    private static partial Regex TableNamePattern();

    /// <summary>
    /// The engine injects message names into FetchXML unescaped, so only letters, digits, underscore
    /// and the <c>*</c> wildcard are allowed.
    /// </summary>
    [GeneratedRegex(@"^[A-Za-z0-9_*]+$")]
    private static partial Regex MessageNamePattern();

    /// <summary>
    /// Trims values, lowercases and de-duplicates table names, and clears the message filter when
    /// messages are off (a non-empty filter makes the engine generate messages anyway).
    /// </summary>
    public static GenerationSettingsDto Normalize(GenerationSettingsDto settings) => new()
    {
        OutputDirectory = (settings.OutputDirectory ?? "").Trim(),
        Namespace = (settings.Namespace ?? "").Trim(),
        ServiceContextName = (settings.ServiceContextName ?? "").Trim(),
        EntityTypesFolder = NormalizeFolder(settings.EntityTypesFolder),
        OptionSetsTypesFolder = NormalizeFolder(settings.OptionSetsTypesFolder),
        MessagesTypesFolder = NormalizeFolder(settings.MessagesTypesFolder),
        EntityNamesFilter = (settings.EntityNamesFilter ?? [])
            .Select(name => (name ?? "").Trim().ToLowerInvariant())
            .Where(name => name.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList(),
        MessageNamesFilter = settings.GenerateMessages
            ? (settings.MessageNamesFilter ?? [])
                .Select(name => (name ?? "").Trim())
                .Where(name => name.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList()
            : [],
        GenerateMessages = settings.GenerateMessages,
        GenerateGlobalOptionSets = settings.GenerateGlobalOptionSets,
        EmitFieldsClasses = settings.EmitFieldsClasses,
        EmitVirtualAttributes = settings.EmitVirtualAttributes,
        EmitEntityETC = settings.EmitEntityETC,
        SuppressINotifyPattern = settings.SuppressINotifyPattern,
        SuppressGeneratedCodeAttribute = settings.SuppressGeneratedCodeAttribute,
    };

    /// <summary>Validates normalized settings. Does not touch Dataverse; table names are checked separately.</summary>
    public static IReadOnlyList<ValidationProblemDto> Validate(GenerationSettingsDto settings)
    {
        var problems = new List<ValidationProblemDto>();

        if (settings.OutputDirectory.Length == 0)
        {
            problems.Add(new("outputDirectory", "Choose an output folder first."));
        }
        else if (!Path.IsPathFullyQualified(settings.OutputDirectory))
        {
            problems.Add(new("outputDirectory", "The output folder must be a full path."));
        }
        else if (!Directory.Exists(settings.OutputDirectory))
        {
            problems.Add(new("outputDirectory", "The output folder does not exist."));
        }

        if (!NamespacePattern().IsMatch(settings.Namespace))
        {
            problems.Add(new("namespace", "Enter a valid C# namespace, such as Contoso.Model."));
        }

        if (settings.ServiceContextName.Length > 0)
        {
            if (!IdentifierPattern().IsMatch(settings.ServiceContextName))
            {
                problems.Add(new("serviceContextName", "Enter a valid C# class name, such as DataverseContext."));
            }
            else if (string.Equals(settings.ServiceContextName, settings.Namespace, StringComparison.Ordinal))
            {
                problems.Add(new("serviceContextName", "The service context name must differ from the namespace."));
            }
        }
        else if (settings.GenerateMessages)
        {
            problems.Add(new(
                "serviceContextName",
                "Message classes need the service context. Enter a service context name."));
        }

        AddFolderProblem(problems, "entityTypesFolder", settings.EntityTypesFolder);
        AddFolderProblem(problems, "optionSetsTypesFolder", settings.OptionSetsTypesFolder);
        AddFolderProblem(problems, "messagesTypesFolder", settings.MessagesTypesFolder);

        var badTables = settings.EntityNamesFilter.Where(name => !TableNamePattern().IsMatch(name)).ToList();
        if (badTables.Count > 0)
        {
            problems.Add(new(
                "entityNamesFilter",
                $"Table names can contain only letters, digits, and underscores: {string.Join(", ", badTables)}."));
        }

        var badMessages = settings.MessageNamesFilter.Where(name => !MessageNamePattern().IsMatch(name)).ToList();
        if (badMessages.Count > 0)
        {
            problems.Add(new(
                "messageNamesFilter",
                $"Message names can contain only letters, digits, underscores, and *: {string.Join(", ", badMessages)}."));
        }

        return problems;
    }

    /// <summary>Returns the requested table names that are not in the environment, in request order.</summary>
    public static IReadOnlyList<string> UnknownTables(IEnumerable<string> requested, IEnumerable<string> known)
    {
        var set = new HashSet<string>(known, StringComparer.OrdinalIgnoreCase);
        return requested.Where(name => !set.Contains(name)).ToList();
    }

    /// <summary>
    /// True when <paramref name="relative"/> is a plain relative folder under the output folder:
    /// not empty, not rooted, no <c>..</c> segment, and no invalid path characters.
    /// </summary>
    public static bool IsSafeRelativeFolder(string relative)
    {
        if (string.IsNullOrWhiteSpace(relative)) return false;
        if (Path.IsPathRooted(relative) || relative.Contains(':')) return false;
        if (relative.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return false;
        if (relative.IndexOfAny(['<', '>', '"', '|', '?', '*']) >= 0) return false;
        var segments = relative.Split(['/', '\\'], StringSplitOptions.RemoveEmptyEntries);
        return segments.Length > 0 && segments.All(segment => segment != ".." && segment != ".");
    }

    private static void AddFolderProblem(List<ValidationProblemDto> problems, string field, string folder)
    {
        if (!IsSafeRelativeFolder(folder))
        {
            problems.Add(new(field, "Enter a folder name relative to the output folder, without .. or a drive."));
        }
    }

    private static string NormalizeFolder(string? folder) =>
        (folder ?? "").Trim().TrimEnd('/', '\\');
}
