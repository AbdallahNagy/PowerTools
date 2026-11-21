using System.ComponentModel;
using System.Security.Cryptography;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.WebResources;

[Description("Web resources from files on this computer: listed files, or every file of a folder. A file whose content is already there plans nothing.")]
public sealed class WebResourceApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the web resources go into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    [Description("Files to create or update.")]
    public List<WebResourceFile>? Files { get; init; }

    [Description("Absolute path of a folder: every file in it and its subfolders with a known extension becomes a web resource named basePath plus its path in the folder.")]
    public string? Folder { get; init; }

    [Description("For folder, and for files without a name: the start of each name, for example con_/project/. Default: the publisher prefix and _/.")]
    public string? BasePath { get; init; }
}

public sealed class WebResourceFile
{
    [Description("Absolute path of the file. The extension decides the type: html, css, js, xml, png, jpg, gif, xap, xsl, ico, svg, resx.")]
    public required string Path { get; init; }

    [Description("The web resource's name, starting with the publisher prefix, for example con_/project/form.js. Default: basePath plus the file name.")]
    public string? Name { get; init; }

    [Description("Default: the name.")]
    public string? DisplayName { get; init; }

    public string? Description { get; init; }
}

/// <summary>
/// Plans webresource_apply: each file becomes a create, or an update when its content, display name or description
/// differs from what the environment has. The type comes from the extension and cannot change on an existing one.
/// </summary>
public sealed class WebResourcePlanner : IComponentPlanner<WebResourceApplySpec>
{
    public const string Family = "webresource";

    public const int MaxFiles = 200;

    private const int DefaultMaxBytes = 5 * 1024 * 1024;

    /// <summary>webresourcetype by extension.</summary>
    public static readonly IReadOnlyDictionary<string, int> Types = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        [".htm"] = 1, [".html"] = 1,
        [".css"] = 2,
        [".js"] = 3,
        [".xml"] = 4,
        [".png"] = 5,
        [".jpg"] = 6, [".jpeg"] = 6,
        [".gif"] = 7,
        [".xap"] = 8,
        [".xsl"] = 9, [".xslt"] = 9,
        [".ico"] = 10,
        [".svg"] = 11,
        [".resx"] = 12,
    };

    private sealed record Wanted(string Path, string Name, string DisplayName, string? Description, int Type, string Content, long Size, string Sha);

    public async Task<Plan> PlanAsync(WebResourceApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var basePath = spec.BasePath?.Trim() ?? $"{solution.Prefix}_/";
        if (!basePath.StartsWith($"{solution.Prefix}_", StringComparison.OrdinalIgnoreCase))
            throw Invalid($"basePath must start with the publisher prefix {solution.Prefix}_ (for example {solution.Prefix}_/project/).");

        var files = Collect(spec, basePath);
        if (files.Count == 0) throw Invalid("Give files or folder with at least one file of a known type.");
        if (files.Count > MaxFiles) throw Invalid($"At most {MaxFiles} web resources per call; this call has {files.Count}. Split the folder.");
        var duplicate = files.GroupBy(f => f.Name, StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null) throw Invalid($"Two files would both be the web resource {duplicate.Key}.");

        var maxBytes = await MaxUploadAsync(context.Client, ct);
        var wanted = new List<Wanted>();
        foreach (var (path, name, display, description) in files)
        {
            if (!name.StartsWith($"{solution.Prefix}_", StringComparison.OrdinalIgnoreCase))
                throw Invalid($"Web resource name {name} must start with the publisher prefix {solution.Prefix}_.");
            if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[A-Za-z0-9_./\-]+$"))
                throw Invalid($"Web resource name {name} may only hold letters, digits, _ . / and -.");
            var type = TypeOf(path) ?? throw Invalid($"{path}: the extension is not a web resource type.");
            if (!File.Exists(path)) throw Invalid($"The file {path} does not exist.");
            var bytes = await File.ReadAllBytesAsync(path, ct);
            if (bytes.Length > maxBytes) throw Invalid($"{path} is {bytes.Length / 1024} KB; this environment takes web resources up to {maxBytes / 1024} KB.");
            wanted.Add(new Wanted(path, name, display ?? name, description, type, Convert.ToBase64String(bytes), bytes.Length, Convert.ToHexStringLower(SHA256.HashData(bytes))));
        }

        var current = await ReadAsync(context.Client, wanted.Select(w => w.Name).ToList(), ct);
        var steps = new List<PlanStep>();
        foreach (var file in wanted)
        {
            var detail = $"{TypeName(file.Type)}, {Size(file.Size)}, sha256 {file.Sha[..12]}";
            if (!current.TryGetValue(file.Name, out var row))
            {
                var id = Guid.NewGuid();
                var entity = new Entity("webresource", id)
                {
                    ["name"] = file.Name,
                    ["displayname"] = file.DisplayName,
                    ["webresourcetype"] = new OptionSetValue(file.Type),
                    ["content"] = file.Content,
                };
                if (file.Description is not null) entity["description"] = file.Description;
                steps.Add(new PlanStep
                {
                    Op = "createWebResource",
                    Target = file.Name,
                    Detail = $"{detail} from {System.IO.Path.GetFileName(file.Path)}",
                    Request = new CreateRequest { Target = entity },
                    Publishes = [new PublishTarget(PublishKind.WebResource, id.ToString("D"))],
                });
                continue;
            }

            var currentType = row.GetAttributeValue<OptionSetValue>("webresourcetype")?.Value;
            if (currentType is { } existingType && existingType != file.Type)
            {
                steps.Add(PlanStep.Blocked("updateWebResource", file.Name,
                    $"{file.Name} is a {TypeName(existingType)} web resource; its type cannot change to {TypeName(file.Type)}. Remove it with remove kind webresource first, or give the file another name."));
                continue;
            }

            var changes = new List<string>();
            var update = new Entity("webresource", row.Id);
            if (!string.Equals(row.GetAttributeValue<string>("content") ?? "", file.Content, StringComparison.Ordinal))
            {
                changes.Add($"content → {detail}");
                update["content"] = file.Content;
            }

            if (!string.Equals(row.GetAttributeValue<string>("displayname"), file.DisplayName, StringComparison.Ordinal))
            {
                changes.Add($"display name → {file.DisplayName}");
                update["displayname"] = file.DisplayName;
            }

            if (file.Description is not null && !string.Equals(row.GetAttributeValue<string>("description"), file.Description, StringComparison.Ordinal))
            {
                changes.Add("description");
                update["description"] = file.Description;
            }

            if (changes.Count == 0) continue;
            if (row.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
            {
                steps.Add(PlanStep.Blocked("updateWebResource", file.Name, $"{file.Name} is managed and not customizable."));
                continue;
            }

            var rowId = row.Id;
            steps.Add(new PlanStep
            {
                Op = "updateWebResource",
                Target = file.Name,
                Detail = string.Join("; ", changes),
                Action = async (step, token) =>
                {
                    await step.Client.UpdateAsync(update, token);
                    await AddToSolutionAsync(step, rowId, ComponentKinds.WebResourceType, token);
                },
                Publishes = [new PublishTarget(PublishKind.WebResource, rowId.ToString("D"))],
            });
        }

        return new Plan(steps, lockKeys: wanted.Select(w => LockKey(w.Name)).ToList());
    }

    public static string LockKey(string name) => $"webresource:{name.ToLowerInvariant()}";

    public static int? TypeOf(string path) => Types.TryGetValue(System.IO.Path.GetExtension(path), out var type) ? type : null;

    public static string TypeName(int type) => type switch
    {
        1 => "html", 2 => "css", 3 => "js", 4 => "xml", 5 => "png", 6 => "jpg", 7 => "gif",
        8 => "xap", 9 => "xsl", 10 => "ico", 11 => "svg", 12 => "resx", _ => $"type {type}",
    };

    /// <summary>Adds a component that already existed to the solution of the call; Dataverse ignores one already there.</summary>
    internal static async Task AddToSolutionAsync(StepContext step, Guid id, int componentType, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(step.SolutionUniqueName)) return;
        await step.Client.ExecuteAsync(new AddSolutionComponentRequest
        {
            ComponentId = id,
            ComponentType = componentType,
            SolutionUniqueName = step.SolutionUniqueName,
            AddRequiredComponents = false,
        }, ct);
    }

    /// <summary>The files of the spec with the names they get, in order: listed files first, then the folder's.</summary>
    private static List<(string Path, string Name, string? DisplayName, string? Description)> Collect(WebResourceApplySpec spec, string basePath)
    {
        var files = new List<(string, string, string?, string?)>();
        foreach (var file in spec.Files ?? [])
        {
            var path = file.Path?.Trim() ?? "";
            if (!System.IO.Path.IsPathFullyQualified(path)) throw Invalid($"path must be an absolute path: {path}");
            files.Add((path, file.Name?.Trim() ?? basePath + System.IO.Path.GetFileName(path), file.DisplayName, file.Description));
        }

        if (spec.Folder is { } folder)
        {
            folder = folder.Trim();
            if (!System.IO.Path.IsPathFullyQualified(folder)) throw Invalid("folder must be an absolute path.");
            if (!Directory.Exists(folder)) throw Invalid($"The folder {folder} does not exist.");
            foreach (var path in Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories).Order(StringComparer.Ordinal))
            {
                if (TypeOf(path) is null) continue;
                var relative = System.IO.Path.GetRelativePath(folder, path).Replace('\\', '/');
                files.Add((path, basePath + relative, null, null));
            }
        }

        return files;
    }

    private static async Task<Dictionary<string, Entity>> ReadAsync(IAgentClient client, List<string> names, CancellationToken ct)
    {
        var found = new Dictionary<string, Entity>(StringComparer.OrdinalIgnoreCase);
        foreach (var chunk in names.Chunk(50))
        {
            var query = new QueryExpression("webresource")
            {
                NoLock = true,
                ColumnSet = new ColumnSet("name", "displayname", "description", "webresourcetype", "content", "iscustomizable"),
            };
            query.Criteria.AddCondition("name", ConditionOperator.In, chunk.Cast<object>().ToArray());
            foreach (var row in (await client.RetrieveMultipleAsync(query, ct)).Entities)
                found[row.GetAttributeValue<string>("name")] = row;
        }

        return found;
    }

    /// <summary>The organization's largest attachment, which also limits web resources.</summary>
    private static async Task<int> MaxUploadAsync(IAgentClient client, CancellationToken ct)
    {
        var query = new QueryExpression("organization") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("maxuploadfilesize") };
        var row = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        var size = row?.GetAttributeValue<int?>("maxuploadfilesize");
        return size is > 0 ? size.Value : DefaultMaxBytes;
    }

    private static string Size(long bytes) => bytes < 1024 ? $"{bytes} B" : $"{bytes / 1024.0:0.#} KB";

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
