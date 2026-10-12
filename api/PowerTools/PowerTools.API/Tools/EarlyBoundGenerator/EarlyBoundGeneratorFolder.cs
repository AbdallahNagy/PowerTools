using System.Text.Json;
using System.Text.Json.Nodes;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>
/// Reads the output folder: whether it holds files, and the settings in builderSettings.json.
/// Also lists the files a run wrote and keeps builderSettings.json keys the form does not control.
/// </summary>
public static class EarlyBoundGeneratorFolder
{
    /// <summary>builderSettings.json keys the form controls. Every other key is kept as it was.</summary>
    private static readonly HashSet<string> ManagedKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "suppressINotifyPattern",
        "suppressGeneratedCodeAttribute",
        "language",
        "namespace",
        "serviceContextName",
        "generateSdkMessages",
        "generateGlobalOptionSets",
        "emitFieldsClasses",
        "entityTypesFolder",
        "messagesTypesFolder",
        "optionSetsTypesFolder",
        "entityNamesFilter",
        "messageNamesFilter",
        "emitEntityETC",
        "emitVirtualAttributes",
    };

    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };

    public static FolderInfoDto Inspect(string path)
    {
        if (!Path.IsPathFullyQualified(path) || !Directory.Exists(path))
        {
            return new FolderInfoDto(path, false, false, null, null);
        }

        var settingsPath = Path.Combine(path, EarlyBoundGeneratorArguments.SettingsFileName);
        var hasOtherFiles = Directory.EnumerateFileSystemEntries(path)
            .Any(entry => !string.Equals(
                Path.GetFileName(entry),
                EarlyBoundGeneratorArguments.SettingsFileName,
                StringComparison.OrdinalIgnoreCase));

        if (!File.Exists(settingsPath))
        {
            return new FolderInfoDto(path, true, hasOtherFiles, null, null);
        }

        try
        {
            var settings = ParseSettings(File.ReadAllText(settingsPath));
            return new FolderInfoDto(path, true, hasOtherFiles, settings, null);
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException or InvalidDataException)
        {
            return new FolderInfoDto(path, true, hasOtherFiles, null, ex.Message);
        }
    }

    public static LoadedSettingsDto ParseSettings(string json)
    {
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions
        {
            AllowTrailingCommas = true,
            CommentHandling = JsonCommentHandling.Skip,
        });
        if (document.RootElement.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("The file does not hold a JSON object.");
        }

        var values = document.RootElement.EnumerateObject()
            .GroupBy(property => property.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last().Value, StringComparer.OrdinalIgnoreCase);

        return new LoadedSettingsDto
        {
            Namespace = String(values, "namespace"),
            ServiceContextName = String(values, "serviceContextName"),
            EntityTypesFolder = String(values, "entityTypesFolder"),
            OptionSetsTypesFolder = String(values, "optionSetsTypesFolder"),
            MessagesTypesFolder = String(values, "messagesTypesFolder"),
            EntityNamesFilter = Strings(values, "entityNamesFilter"),
            MessageNamesFilter = Strings(values, "messageNamesFilter"),
            GenerateSdkMessages = Bool(values, "generateSdkMessages"),
            GenerateGlobalOptionSets = Bool(values, "generateGlobalOptionSets"),
            EmitFieldsClasses = Bool(values, "emitFieldsClasses"),
            EmitVirtualAttributes = Bool(values, "emitVirtualAttributes"),
            EmitEntityETC = Bool(values, "emitEntityETC"),
            SuppressINotifyPattern = Bool(values, "suppressINotifyPattern"),
            SuppressGeneratedCodeAttribute = Bool(values, "suppressGeneratedCodeAttribute"),
        };
    }

    /// <summary>The keys of an existing builderSettings.json that the form does not control.</summary>
    public static JsonObject PreservedKeys(string? json)
    {
        var preserved = new JsonObject();
        if (string.IsNullOrWhiteSpace(json)) return preserved;

        try
        {
            if (JsonNode.Parse(json, documentOptions: new JsonDocumentOptions
                {
                    AllowTrailingCommas = true,
                    CommentHandling = JsonCommentHandling.Skip,
                }) is not JsonObject root)
            {
                return preserved;
            }

            foreach (var (key, value) in root)
            {
                if (!ManagedKeys.Contains(key)) preserved[key] = value?.DeepClone();
            }
        }
        catch (JsonException)
        {
            // An unreadable file has nothing to keep; it is replaced.
        }

        return preserved;
    }

    /// <summary>Adds the preserved keys back into the builderSettings.json the engine just wrote.</summary>
    public static void MergePreservedKeys(string settingsPath, JsonObject preserved)
    {
        if (preserved.Count == 0 || !File.Exists(settingsPath)) return;
        if (JsonNode.Parse(File.ReadAllText(settingsPath)) is not JsonObject written) return;

        foreach (var (key, value) in preserved)
        {
            written[key] = value?.DeepClone();
        }

        File.WriteAllText(settingsPath, written.ToJsonString(WriteOptions));
    }

    /// <summary>
    /// Files under the output folder written at or after <paramref name="sinceUtc"/>: <c>*.cs</c> in the
    /// output folder and the three type folders, plus builderSettings.json when asked. Other folders are not read.
    /// </summary>
    public static List<GeneratedFileDto> ListWritten(
        GenerationSettingsDto settings,
        DateTime sinceUtc,
        bool includeSettingsFile)
    {
        var root = settings.OutputDirectory;
        var folders = new (string Relative, string Kind)[]
        {
            (settings.EntityTypesFolder, GeneratedFileKinds.Table),
            (settings.OptionSetsTypesFolder, GeneratedFileKinds.Choice),
            (settings.MessagesTypesFolder, GeneratedFileKinds.Message),
        };

        var files = new List<GeneratedFileDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddFrom(string directory, string kind)
        {
            if (!Directory.Exists(directory)) return;
            foreach (var file in Directory.EnumerateFiles(directory, "*.cs", SearchOption.TopDirectoryOnly))
            {
                var info = new FileInfo(file);
                if (info.LastWriteTimeUtc < sinceUtc || !seen.Add(info.FullName)) continue;
                files.Add(new GeneratedFileDto(
                    Path.GetRelativePath(root, info.FullName),
                    kind,
                    Path.GetFileNameWithoutExtension(info.Name),
                    info.Length));
            }
        }

        foreach (var (relative, kind) in folders)
        {
            AddFrom(Path.GetFullPath(Path.Combine(root, relative)), kind);
        }

        AddFrom(Path.GetFullPath(root), GeneratedFileKinds.ServiceContext);

        if (includeSettingsFile)
        {
            var settingsFile = new FileInfo(Path.Combine(root, EarlyBoundGeneratorArguments.SettingsFileName));
            if (settingsFile.Exists && settingsFile.LastWriteTimeUtc >= sinceUtc)
            {
                files.Add(new GeneratedFileDto(
                    settingsFile.Name,
                    GeneratedFileKinds.Settings,
                    "",
                    settingsFile.Length));
            }
        }

        return files.OrderBy(file => file.Path, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string? String(Dictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool? Bool(Dictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : null;

    private static List<string>? Strings(Dictionary<string, JsonElement> values, string key)
    {
        if (!values.TryGetValue(key, out var value)) return null;
        if (value.ValueKind == JsonValueKind.String)
        {
            // Older files hold a ;-separated string.
            return value.GetString()!
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }

        if (value.ValueKind != JsonValueKind.Array) return null;
        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString()!.Trim())
            .Where(item => item.Length > 0)
            .ToList();
    }
}
