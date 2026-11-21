using System.ComponentModel;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Components.WebResources;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Apps;

[Description("A model-driven app. Leave a property out to keep it. Components, roles and commands left out are kept.")]
public sealed class AppApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the app goes into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    [Description("The app's unique name with the publisher prefix, for example con_Projects. Cannot change.")]
    public required string UniqueName { get; init; }

    [Description("Needed for a new app.")]
    public string? Name { get; init; }

    public string? Description { get; init; }

    [Description("Name of an SVG or image web resource for the app's icon. Default: the standard icon.")]
    public string? Icon { get; init; }

    [Description("Tables in the app. Without forms, views or charts, the app shows all of the table's.")]
    public List<AppTable>? Tables { get; init; }

    [Description("System dashboards in the app, by name.")]
    public List<string>? Dashboards { get; init; }

    [Description("The navigation. It replaces the app's site map as a whole.")]
    public AppSiteMap? SiteMap { get; init; }

    [Description("Security roles that can open the app, by name.")]
    public List<string>? Roles { get; init; }

    [Description("Modern command bar buttons that run JavaScript. Online only.")]
    public List<AppCommand>? Commands { get; init; }
}

public sealed class AppTable
{
    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("Forms by name; only these are in the app.")]
    public List<string>? Forms { get; init; }

    [Description("Views by name; only these are in the app.")]
    public List<string>? Views { get; init; }

    [Description("System charts by name.")]
    public List<string>? Charts { get; init; }
}

public sealed class AppSiteMap
{
    public required List<SiteMapArea> Areas { get; init; }
}

public sealed class SiteMapArea
{
    [Description("Default: made from the title.")]
    public string? Id { get; init; }

    public required string Title { get; init; }

    public required List<SiteMapGroup> Groups { get; init; }
}

public sealed class SiteMapGroup
{
    [Description("Default: made from the title.")]
    public string? Id { get; init; }

    public required string Title { get; init; }

    public required List<SiteMapSubarea> Subareas { get; init; }
}

[Description("One of table, dashboards or url.")]
public sealed class SiteMapSubarea
{
    [Description("Default: made from the table or title.")]
    public string? Id { get; init; }

    [Description("Default for a table: the table's plural name.")]
    public string? Title { get; init; }

    [Description("Table logical name.")]
    public string? Table { get; init; }

    [Description("true: the dashboards page.")]
    public bool? Dashboards { get; init; }

    [Description("A web resource ($webresource:con_/page.html) or an absolute URL.")]
    public string? Url { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<CommandLocation>))]
public enum CommandLocation
{
    [JsonStringEnumMemberName("form")] Form,
    [JsonStringEnumMemberName("mainGrid")] MainGrid,
    [JsonStringEnumMemberName("subGrid")] SubGrid,
    [JsonStringEnumMemberName("associatedGrid")] AssociatedGrid,
}

public sealed class AppCommand
{
    [Description("The command's unique name with the publisher prefix.")]
    public required string UniqueName { get; init; }

    public required string Label { get; init; }

    [Description("Table logical name the command is on.")]
    public required string Table { get; init; }

    public required CommandLocation Location { get; init; }

    [Description("Name of the JavaScript web resource.")]
    public required string Library { get; init; }

    [Description("The function to call.")]
    public required string Function { get; init; }

    [Description("Parameters, for example PrimaryControl.")]
    public string? Parameters { get; init; }

    [Description("A Fluent icon name, for example Add.")]
    public string? Icon { get; init; }

    [Description("Order among the buttons; lower comes first.")]
    public int? Sequence { get; init; }

    public bool? Hidden { get; init; }
}

/// <summary>Writes site map XML from the spec. Ids not given are made from titles, so the same spec writes the same XML.</summary>
public static class SiteMapXmlBuilder
{
    public const string DashboardsUrl = "/workplace/home_dashboards.aspx";

    public static string Build(AppSiteMap map, int language, Func<string, string> pluralName)
    {
        if (map.Areas is not { Count: > 0 }) throw Invalid("siteMap needs at least one area.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string Id(string? given, string prefix, string from)
        {
            var id = given?.Trim() is { Length: > 0 } g ? g : $"{prefix}_{Slug(from)}";
            var unique = id;
            for (var i = 2; !ids.Add(unique); i++)
            {
                if (given is not null) throw Invalid($"The site map has the id {id} twice.");
                unique = $"{id}_{i}";
            }

            return unique;
        }

        XElement Titles(string title) =>
            new("Titles", new XElement("Title", new XAttribute("LCID", language), new XAttribute("Title", title)));

        var root = new XElement("SiteMap", new XAttribute("IntroducedVersion", "7.0.0.0"));
        foreach (var area in map.Areas)
        {
            var areaElement = new XElement("Area", new XAttribute("Id", Id(area.Id, "area", area.Title)), new XAttribute("ShowGroups", "true"), Titles(area.Title));
            if (area.Groups is not { Count: > 0 }) throw Invalid($"Area {area.Title} needs at least one group.");
            foreach (var group in area.Groups)
            {
                var groupElement = new XElement("Group", new XAttribute("Id", Id(group.Id, "group", group.Title)), Titles(group.Title));
                foreach (var sub in group.Subareas ?? [])
                {
                    var kinds = (sub.Table is null ? 0 : 1) + (sub.Dashboards == true ? 1 : 0) + (sub.Url is null ? 0 : 1);
                    if (kinds != 1) throw Invalid($"A subarea of group {group.Title} needs exactly one of table, dashboards or url.");
                    XElement element;
                    if (sub.Table is { } table)
                    {
                        var logical = table.Trim().ToLowerInvariant();
                        element = new XElement("SubArea", new XAttribute("Id", Id(sub.Id, "subarea", logical)), new XAttribute("Entity", logical));
                        element.Add(Titles(sub.Title ?? pluralName(logical)));
                    }
                    else if (sub.Dashboards == true)
                    {
                        element = new XElement("SubArea", new XAttribute("Id", Id(sub.Id, "subarea", sub.Title ?? "dashboards")), new XAttribute("Url", DashboardsUrl), new XAttribute("Type", "Dashboard"));
                        element.Add(Titles(sub.Title ?? "Dashboards"));
                    }
                    else
                    {
                        var title = sub.Title ?? throw Invalid($"A url subarea of group {group.Title} needs a title.");
                        element = new XElement("SubArea", new XAttribute("Id", Id(sub.Id, "subarea", title)), new XAttribute("Url", sub.Url!.Trim()));
                        element.Add(Titles(title));
                    }

                    groupElement.Add(element);
                }

                areaElement.Add(groupElement);
            }

            root.Add(areaElement);
        }

        return root.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>The site map XML with formatting taken out, for comparing.</summary>
    public static string Normalize(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml)) return "";
        try
        {
            return XElement.Parse(xml).ToString(SaveOptions.DisableFormatting);
        }
        catch (System.Xml.XmlException)
        {
            return xml;
        }
    }

    private static string Slug(string text)
    {
        var chars = text.Trim().ToLowerInvariant().Select(c => char.IsAsciiLetterOrDigit(c) ? c : '_').ToArray();
        var slug = new string(chars).Trim('_');
        return slug.Length == 0 ? "item" : slug;
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

/// <summary>
/// Plans app_apply: the appmodule row, its site map, the components it shows (AddAppComponents), the roles that can
/// open it and its modern commands, then ValidateApp, so an app that would not open fails the call. The executor
/// publishes the app and the site map.
/// </summary>
public sealed class AppPlanner : IComponentPlanner<AppApplySpec>
{
    public const string Family = "app";

    /// <summary>The icon web resource every environment has.</summary>
    public static readonly Guid DefaultIcon = new("953b9fac-1e5e-e611-80d6-00155ded156f");

    private const int UnifiedInterface = 4;

    private sealed record Component(string Table, Guid Id, int Type, string Label);

    public async Task<Plan> PlanAsync(AppApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var client = context.Client;
        var uniqueName = spec.UniqueName?.Trim() ?? "";
        if (uniqueName.Length == 0) throw Invalid("uniqueName is required.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(uniqueName, "^[A-Za-z0-9_]+$")) throw Invalid("uniqueName may only hold letters, digits and _.");
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var language = await context.BaseLanguageAsync(ct);
        var lockKey = $"app:{uniqueName.ToLowerInvariant()}";
        var app = await UnpublishedAsync(client, "appmodule", "uniquename", uniqueName, ct);
        var appId = app?.Id ?? Guid.NewGuid();
        var steps = new List<PlanStep>();
        var appPublish = new PublishTarget(PublishKind.AppModule, appId.ToString("D"));

        // Read everything the spec names first, so a wrong name is refused before anything is planned.
        var icon = spec.Icon is null ? (Guid?)null : await WebResourceAsync(client, spec.Icon, ct);
        var components = await ComponentsAsync(spec, context, ct);
        var roles = await RolesAsync(client, spec.Roles, ct);

        if (app is null)
        {
            if (solution.CheckSchemaName(uniqueName) is { } problem) throw new AgentProblemException(problem);
            if (string.IsNullOrWhiteSpace(spec.Name)) throw Invalid($"App {uniqueName} does not exist yet; a new app needs name.");
            var created = new Entity("appmodule", appId)
            {
                ["uniquename"] = uniqueName,
                ["name"] = spec.Name.Trim(),
                ["webresourceid"] = icon ?? DefaultIcon,
                ["clienttype"] = UnifiedInterface,
            };
            if (spec.Description is not null) created["description"] = spec.Description;
            steps.Add(new PlanStep { Op = "createApp", Target = uniqueName, Detail = spec.Name.Trim(), Request = new CreateRequest { Target = created }, Publishes = [appPublish] });
        }
        else
        {
            if (app.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
                return new Plan([PlanStep.Blocked("updateApp", uniqueName, $"App {uniqueName} is managed and not customizable.")], lockKeys: [lockKey]);
            var update = new Entity("appmodule", appId);
            var changes = new List<string>();
            if (spec.Name is { } name && name.Trim() != app.GetAttributeValue<string>("name")) { update["name"] = name.Trim(); changes.Add($"name → {name.Trim()}"); }
            if (spec.Description is { } description && description != app.GetAttributeValue<string>("description")) { update["description"] = description; changes.Add("description"); }
            if (icon is { } iconId && iconId != app.GetAttributeValue<Guid?>("webresourceid")) { update["webresourceid"] = iconId; changes.Add($"icon → {spec.Icon}"); }
            if (changes.Count > 0)
            {
                steps.Add(new PlanStep
                {
                    Op = "updateApp",
                    Target = uniqueName,
                    Detail = string.Join("; ", changes),
                    Action = async (step, token) =>
                    {
                        await step.Client.UpdateAsync(update, token);
                        await WebResourcePlanner.AddToSolutionAsync(step, appId, ComponentKinds.AppModuleType, token);
                    },
                    Publishes = [appPublish],
                });
            }
        }

        // Site map: one per app, named like the app.
        if (spec.SiteMap is { } map)
        {
            var plural = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var table in map.Areas.SelectMany(a => a.Groups ?? []).SelectMany(g => g.Subareas ?? []).Select(s => s.Table).OfType<string>())
            {
                var logical = table.Trim().ToLowerInvariant();
                var metadata = await context.Metadata.TableAsync(logical, ct) ?? throw Invalid($"Site map: table {logical} does not exist.");
                plural[logical] = Labels.Text(metadata.DisplayCollectionName, language) ?? logical;
            }

            var xml = SiteMapXmlBuilder.Build(map, language, t => plural[t]);
            var siteMap = await UnpublishedAsync(client, "sitemap", "sitemapnameunique", uniqueName, ct);
            var siteMapId = siteMap?.Id ?? Guid.NewGuid();
            var publish = new PublishTarget(PublishKind.SiteMap, siteMapId.ToString("D"));
            var areas = $"{map.Areas.Count} area(s): {string.Join(", ", map.Areas.Select(a => a.Title))}";
            if (siteMap is null)
            {
                var created = new Entity("sitemap", siteMapId)
                {
                    ["sitemapname"] = spec.Name?.Trim() ?? uniqueName,
                    ["sitemapnameunique"] = uniqueName,
                    ["sitemapxml"] = xml,
                    ["isappaware"] = true,
                };
                steps.Add(new PlanStep { Op = "createSiteMap", Target = uniqueName, Detail = areas, Request = new CreateRequest { Target = created }, Publishes = [publish] });
            }
            else if (SiteMapXmlBuilder.Normalize(siteMap.GetAttributeValue<string>("sitemapxml")) != SiteMapXmlBuilder.Normalize(xml))
            {
                var update = new Entity("sitemap", siteMapId) { ["sitemapxml"] = xml };
                steps.Add(new PlanStep
                {
                    Op = "updateSiteMap",
                    Target = uniqueName,
                    Detail = areas,
                    Action = async (step, token) =>
                    {
                        await step.Client.UpdateAsync(update, token);
                        await WebResourcePlanner.AddToSolutionAsync(step, siteMapId, ComponentKinds.SiteMapType, token);
                    },
                    Publishes = [publish],
                });
            }

            components.Add(new Component("sitemap", siteMapId, ComponentKinds.SiteMapType, $"site map {uniqueName}"));
        }

        // Components the app does not have yet.
        var have = app is null ? [] : await AppComponentsAsync(client, app, ct);
        var missing = components.Where(c => !have.Contains(c.Id)).ToList();
        if (missing.Count > 0)
        {
            var references = new EntityReferenceCollection(missing.Select(c => new EntityReference(c.Table, c.Id)).ToList());
            steps.Add(new PlanStep
            {
                Op = "addAppComponents",
                Target = uniqueName,
                Detail = string.Join(", ", missing.Select(c => c.Label)),
                Request = new AddAppComponentsRequest { AppId = appId, Components = references },
                SolutionAware = false,
                Publishes = [appPublish],
            });
        }

        // Roles that can open the app.
        foreach (var (roleId, roleName) in roles)
        {
            if (app is not null && await LinkedAsync(client, "appmoduleroles", "appmoduleid", appId, "roleid", roleId, ct)) continue;
            steps.Add(new PlanStep
            {
                Op = "addAppRole",
                Target = $"{uniqueName} → {roleName}",
                SolutionAware = false,
                Request = new AssociateRequest
                {
                    Target = new EntityReference("appmodule", appId),
                    Relationship = new Relationship("appmoduleroles_association"),
                    RelatedEntities = [new EntityReference("role", roleId)],
                },
                Publishes = [appPublish],
            });
        }

        if (spec.Commands is { Count: > 0 } commands) await PlanCommandsAsync(commands, context, solution, appId, app is null, steps, ct);

        if (steps.Any(s => s.Kind == PlanStepKind.Run))
        {
            steps.Add(new PlanStep
            {
                Op = "validateApp",
                Target = uniqueName,
                Detail = "ValidateApp; errors stop the call",
                SolutionAware = false,
                Action = async (step, token) =>
                {
                    var response = (ValidateAppResponse)await step.Client.ExecuteAsync(new ValidateAppRequest { AppModuleId = appId }, token);
                    var errors = (response.AppValidationResponse?.ValidationIssueList ?? [])
                        .Where(i => i.ErrorType == ErrorType.Error)
                        .Select(i => string.IsNullOrWhiteSpace(i.DisplayName) ? i.Message : $"{i.DisplayName}: {i.Message}")
                        .ToList();
                    if (errors.Count > 0)
                        throw new AgentProblemException(AgentFaults.InvalidRequest($"The app does not validate: {string.Join("; ", errors)}. Add what it names and apply again."));
                },
            });
        }

        return new Plan(steps, lockKeys: [lockKey]);
    }

    private static async Task PlanCommandsAsync(
        List<AppCommand> commands, PlanContext context, SolutionContext solution, Guid appId, bool newApp, List<PlanStep> steps, CancellationToken ct)
    {
        if (!context.Capabilities.HasTable("appaction"))
        {
            foreach (var command in commands)
            {
                steps.Add(PlanStep.Unsupported("applyCommand", command.UniqueName, "This environment has no modern commands.",
                    "Change the classic ribbon (RibbonDiffXml) in a solution and import it with solution_import."));
            }

            return;
        }

        foreach (var command in commands)
        {
            var name = command.UniqueName.Trim();
            if (solution.CheckSchemaName(name) is { } problem) throw new AgentProblemException(problem);
            var table = command.Table.Trim().ToLowerInvariant();
            var metadata = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Command {name}: table {table} does not exist.");
            var library = await WebResourceAsync(context.Client, command.Library, ct);
            var wanted = new Dictionary<string, object?>
            {
                ["name"] = name,
                ["buttonlabeltext"] = command.Label,
                ["appmoduleid"] = new EntityReference("appmodule", appId),
                ["context"] = new OptionSetValue(1),
                ["contextentity"] = new EntityReference("entity", metadata.MetadataId ?? Guid.Empty),
                ["contextvalue"] = table,
                ["location"] = new OptionSetValue((int)command.Location),
                ["onclickeventtype"] = new OptionSetValue(2),
                ["onclickeventjavascriptwebresourceid"] = new EntityReference("webresource", library),
                ["onclickeventjavascriptfunctionname"] = command.Function.Trim(),
                ["onclickeventjavascriptparameters"] = command.Parameters ?? "",
                ["fonticon"] = command.Icon ?? "",
                ["sequence"] = (decimal)(command.Sequence ?? 10),
                ["hidden"] = command.Hidden ?? false,
            };
            Entity? current = null;
            if (!newApp)
            {
                var query = new QueryExpression("appaction") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet([.. wanted.Keys]) };
                query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, name);
                current = (await context.Client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
            }

            // Name every value the request writes, so the approved hash covers them.
            var detail = $"{command.Location} of {table}: {command.Label} → {command.Library} {command.Function}"
                + $"({command.Parameters ?? ""}), icon '{command.Icon ?? ""}', sequence {command.Sequence ?? 10}, hidden {(command.Hidden ?? false ? "yes" : "no")}";
            if (current is null)
            {
                var row = new Entity("appaction") { ["uniquename"] = name };
                foreach (var (key, value) in wanted) row[key] = value;
                steps.Add(new PlanStep { Op = "createCommand", Target = name, Detail = detail, Request = new CreateRequest { Target = row } });
                continue;
            }

            var update = new Entity("appaction", current.Id);
            foreach (var (key, value) in wanted)
            {
                if (!SameValue(current.GetAttributeValue<object>(key), value)) update[key] = value;
            }

            if (update.Attributes.Count == 0) continue;
            steps.Add(new PlanStep
            {
                Op = "updateCommand",
                Target = name,
                Detail = $"{string.Join(", ", update.Attributes.Keys)}; {detail}",
                Request = new UpdateRequest { Target = update },
            });
        }
    }

    private static bool SameValue(object? now, object? wanted) => (now, wanted) switch
    {
        (null, string s) => s.Length == 0,
        (null, false) => true,
        (EntityReference a, EntityReference b) => a.Id == b.Id,
        (OptionSetValue a, OptionSetValue b) => a.Value == b.Value,
        _ => Equals(now, wanted),
    };

    /// <summary>The components the spec names, read once so a missing one is refused with its name.</summary>
    private static async Task<List<Component>> ComponentsAsync(AppApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var client = context.Client;
        var found = new List<Component>();
        foreach (var item in spec.Tables ?? [])
        {
            var table = item.Table.Trim().ToLowerInvariant();
            var metadata = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Table {table} does not exist.");
            found.Add(new Component("entity", metadata.MetadataId ?? Guid.Empty, ComponentKinds.EntityType, $"table {table}"));
            foreach (var form in item.Forms ?? [])
                found.Add(new Component("systemform", await RowAsync(client, "systemform", "name", form, "objecttypecode", table, $"{table} has no form named '{form}'.", ct), ComponentKinds.SystemFormType, $"form {table}/{form}"));
            foreach (var view in item.Views ?? [])
                found.Add(new Component("savedquery", await RowAsync(client, "savedquery", "name", view, "returnedtypecode", table, $"{table} has no view named '{view}'.", ct), ComponentKinds.SavedQueryType, $"view {table}/{view}"));
            foreach (var chart in item.Charts ?? [])
                found.Add(new Component("savedqueryvisualization", await RowAsync(client, "savedqueryvisualization", "name", chart, "primaryentitytypecode", table, $"{table} has no system chart named '{chart}'.", ct), 59, $"chart {table}/{chart}"));
        }

        foreach (var dashboard in spec.Dashboards ?? [])
            found.Add(new Component("systemform", await RowAsync(client, "systemform", "name", dashboard, "type", 0, $"There is no system dashboard named '{dashboard}'.", ct), ComponentKinds.SystemFormType, $"dashboard {dashboard}"));
        return found;
    }

    private static async Task<Guid> RowAsync(IAgentClient client, string table, string nameColumn, string name, string scopeColumn, object scope, string missing, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet(nameColumn) };
        query.Criteria.AddCondition(nameColumn, ConditionOperator.Equal, name.Trim());
        query.Criteria.AddCondition(scopeColumn, ConditionOperator.Equal, scope);
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0) throw Invalid(missing);
        if (rows.Count > 1) throw Invalid($"More than one {table} matches '{name}'.");
        return rows[0].Id;
    }

    private static async Task<List<(Guid Id, string Name)>> RolesAsync(IAgentClient client, List<string>? names, CancellationToken ct)
    {
        var roles = new List<(Guid, string)>();
        foreach (var name in names ?? [])
        {
            var role = await ComponentKinds.FindAsync(client, ComponentKind.Role, name, null, ct) ?? throw Invalid($"There is no security role named '{name}'. Create it with role_apply.");
            roles.Add((role.Id, role.Label));
        }

        return roles;
    }

    private static async Task<Guid> WebResourceAsync(IAgentClient client, string name, CancellationToken ct)
    {
        var query = new QueryExpression("webresource") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("name") };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, name.Trim());
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault()?.Id
            ?? throw Invalid($"There is no web resource named {name}. Upload it with webresource_apply first.");
    }

    /// <summary>The ids of the components the app has (published or not).</summary>
    private static async Task<HashSet<Guid>> AppComponentsAsync(IAgentClient client, Entity app, CancellationToken ct)
    {
        var unique = app.GetAttributeValue<Guid?>("appmoduleidunique") ?? app.GetAttributeValue<EntityReference>("appmoduleidunique")?.Id ?? app.Id;
        var query = new QueryExpression("appmodulecomponent") { NoLock = true, ColumnSet = new ColumnSet("objectid", "componenttype") };
        query.Criteria.AddCondition("appmoduleidunique", ConditionOperator.Equal, unique);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.Select(r => r.GetAttributeValue<Guid>("objectid")).ToHashSet();
    }

    private static async Task<bool> LinkedAsync(IAgentClient client, string intersect, string fromColumn, Guid from, string toColumn, Guid to, CancellationToken ct)
    {
        var query = new QueryExpression(intersect) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(toColumn) };
        query.Criteria.AddCondition(fromColumn, ConditionOperator.Equal, from);
        query.Criteria.AddCondition(toColumn, ConditionOperator.Equal, to);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.Count > 0;
    }

    /// <summary>A row as it stands, unpublished changes included: an app or site map just created is not published yet.</summary>
    private static async Task<Entity?> UnpublishedAsync(IAgentClient client, string table, string column, string value, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition(column, ConditionOperator.Equal, value);
        var response = (RetrieveUnpublishedMultipleResponse)await client.ExecuteAsync(new RetrieveUnpublishedMultipleRequest { Query = query }, ct);
        return response.EntityCollection.Entities.FirstOrDefault();
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
