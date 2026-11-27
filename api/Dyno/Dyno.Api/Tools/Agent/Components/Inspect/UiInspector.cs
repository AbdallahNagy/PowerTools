using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Components.Forms;
using Dyno.Api.Tools.Agent.Components.Views;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Inspect;

public sealed record FormDescription(string Table, string Name, string Id, string Type, IReadOnlyList<FormTabItem> Tabs, IReadOnlyList<string> Header);

public sealed record FormTabItem(string Name, string? Label, bool Visible, IReadOnlyList<FormSectionItem> Sections);

public sealed record FormSectionItem(string Name, string? Label, bool Visible, IReadOnlyList<FormFieldItem> Fields, IReadOnlyList<string> Subgrids);

public sealed record FormFieldItem(string Column, string? Label, bool Visible);

/// <summary>
/// inspect_ui: forms, views, apps, site maps, modern commands and web resources. A view comes back in the shape
/// view_apply takes, and a form lists its tabs, sections and fields by the names form_apply uses.
/// </summary>
public sealed class UiInspector(IAgentClient client, Capabilities capabilities)
{
    public static readonly string[] Kinds = ["form", "view", "app", "sitemap", "command", "webresource"];
    private const int MaxContentBytes = 100 * 1024;

    public async Task<AgentResult<object>> InspectAsync(InspectBody body, CancellationToken ct)
    {
        try
        {
            var table = body.Table?.Trim().ToLowerInvariant();
            object result = body.Kind switch
            {
                "form" => body.Name is null
                    ? await RowInspect.ListAsync(client, "form", "systemform", "name", ["name", "type", "objecttypecode", "ismanaged", "isdefault"],
                        q => { if (table is not null) q.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, table); }, body.Filter, body.Top, ct)
                    : await DescribeFormAsync(Require(table, "form"), body.Name, ct),
                "view" => body.Name is null && table is null
                    ? throw Invalid("view needs table.")
                    : body.Name is null
                        ? await RowInspect.ListAsync(client, "view", "savedquery", "name", ["name", "querytype", "returnedtypecode", "isdefault", "ismanaged"],
                            q => q.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, table), body.Filter, body.Top, ct)
                        : await DescribeViewAsync(table!, body.Name, ct),
                "app" => await RowsAsync(body, "app", "appmodule", "uniquename", ["name", "uniquename", "description", "ismanaged", "clienttype"], [], ct),
                "sitemap" => await RowsAsync(body, "sitemap", "sitemap", "sitemapnameunique", ["sitemapname", "sitemapnameunique", "isappaware", "ismanaged"], ["sitemapxml"], ct),
                "command" => capabilities.HasTable("appaction")
                    ? await RowsAsync(body, "command", "appaction", "uniquename", ["name", "uniquename", "location", "contextentity", "buttonlabeltext", "ismanaged"], ["onclickeventtype", "onclickeventjavascriptfunctionname", "visibilitytype", "sequence", "hidden"], ct)
                    : throw new AgentProblemException(new AgentProblem(StatusCodes.Status400BadRequest, ApplyResult.NotSupportedCode,
                        "This environment has no modern commands (they are online only). The ribbon changes through solution_import.")),
                "webresource" => await WebResourceAsync(body, ct),
                _ => throw Invalid($"kind must be one of: {string.Join(", ", Kinds)}."),
            };
            return AgentResult<object>.Ok(result);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return AgentResult<object>.Fail(AgentFaults.From(ex));
        }
    }

    private async Task<object> RowsAsync(InspectBody body, string kind, string table, string nameColumn, string[] columns, string[] detail, CancellationToken ct)
    {
        if (body.Name is null) return await RowInspect.ListAsync(client, kind, table, nameColumn, columns, null, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, table, nameColumn, body.Name, [.. columns, .. detail], null, ct)
            ?? throw RowInspect.NotFound($"{kind} {body.Name}");
        return RowInspect.Plain(row, [.. columns, .. detail]);
    }

    private async Task<object> WebResourceAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["name", "displayname", "webresourcetype", "ismanaged", "description"];
        if (body.Name is null) return await RowInspect.ListAsync(client, "webresource", "webresource", "name", columns, null, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, "webresource", "name", body.Name, [.. columns, "content"], null, ct)
            ?? throw RowInspect.NotFound($"webresource {body.Name}");
        var result = RowInspect.Plain(row, columns);
        var type = row.GetAttributeValue<OptionSetValue>("webresourcetype")?.Value;
        // Text types: HTML, CSS, JavaScript, XML, XSL, SVG, RESX. Images and Silverlight stay out.
        if (type is 1 or 2 or 3 or 4 or 9 or 11 or 12 && row.GetAttributeValue<string>("content") is { } content)
        {
            var bytes = Convert.FromBase64String(content);
            result["content"] = bytes.Length <= MaxContentBytes ? System.Text.Encoding.UTF8.GetString(bytes) : null;
            if (bytes.Length > MaxContentBytes) result["contentNote"] = $"The content is {bytes.Length} bytes, more than {MaxContentBytes}; it is left out.";
        }

        return result;
    }

    public async Task<FormDescription> DescribeFormAsync(string table, string name, CancellationToken ct)
    {
        var query = new QueryExpression("systemform") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name", "type") };
        query.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, table);
        if (Guid.TryParse(name, out var id)) query.Criteria.AddCondition("formid", ConditionOperator.Equal, id);
        else query.Criteria.AddCondition("name", ConditionOperator.Equal, name.Trim());
        var found = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault() ?? throw RowInspect.NotFound($"Form {table}/{name}");
        var kind = (found.GetAttributeValue<OptionSetValue>("type")?.Value) switch { 7 => FormKind.QuickCreate, 6 => FormKind.QuickView, 11 => FormKind.Card, _ => FormKind.Main };
        var form = await FormPlanner.FindAsync(client, table, found.Id.ToString("D"), kind, ct);
        var language = await Labels.BaseLanguageAsync(client, ct);
        var doc = XDocument.Parse(form.GetAttributeValue<string>("formxml") ?? "<form/>");
        var editor = new FormEditor(doc, language);

        FormFieldItem Field(XElement control)
        {
            var cell = control.Ancestors("cell").FirstOrDefault();
            // Logical names are lower case everywhere else; a form written by another tool may keep the schema name's case.
            var label = cell is null ? null : editor.LabelOf(cell);
            return new FormFieldItem(((string?)control.Attribute("datafieldname") ?? "").ToLowerInvariant(), string.IsNullOrEmpty(label) ? null : label, cell is null || FormEditor.IsVisible(cell));
        }

        var tabs = (doc.Root?.Element("tabs")?.Elements("tab") ?? []).Select(tab => new FormTabItem(
            (string?)tab.Attribute("name") ?? "",
            editor.LabelOf(tab),
            FormEditor.IsVisible(tab),
            tab.Descendants("section").Select(section => new FormSectionItem(
                (string?)section.Attribute("name") ?? "",
                editor.LabelOf(section),
                FormEditor.IsVisible(section),
                section.Descendants("control").Where(c => c.Attribute("datafieldname") is not null).Select(Field).ToList(),
                section.Descendants("control").Where(c => (string?)c.Attribute("classid") is { } cls && cls.Equals(FormEditor.SubgridClassId, StringComparison.OrdinalIgnoreCase))
                    .Select(c => (string?)c.Attribute("id") ?? "").ToList())).ToList())).ToList();
        var header = doc.Root?.Element("header")?.Descendants("control").Select(c => ((string?)c.Attribute("datafieldname"))?.ToLowerInvariant()).OfType<string>().ToList() ?? [];
        var typeName = kind switch { FormKind.QuickCreate => "quickCreate", FormKind.QuickView => "quickView", FormKind.Card => "card", _ => "main" };
        return new FormDescription(table, form.GetAttributeValue<string>("name") ?? name, form.Id.ToString("D"), typeName, tabs, header);
    }

    /// <summary>A view in view_apply's shape.</summary>
    public async Task<ViewApplySpec> DescribeViewAsync(string table, string name, CancellationToken ct)
    {
        var query = new QueryExpression("savedquery") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name", "querytype") };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, table);
        if (Guid.TryParse(name, out var id)) query.Criteria.AddCondition("savedqueryid", ConditionOperator.Equal, id);
        else query.Criteria.AddCondition("name", ConditionOperator.Equal, name.Trim());
        var found = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault() ?? throw RowInspect.NotFound($"View {table}/{name}");
        var type = ViewXml.TypeOf(found.GetAttributeValue<int?>("querytype") ?? found.GetAttributeValue<OptionSetValue>("querytype")?.Value ?? 0)
            ?? throw Invalid($"View {name} is not a type view_apply handles (public, advancedFind, associated, quickFind, lookup).");
        var view = await ViewPlanner.FindAsync(client, table, type, found.GetAttributeValue<string>("name"), ct) ?? throw RowInspect.NotFound($"View {table}/{name}");
        var fetch = ViewXml.Parse(view.GetAttributeValue<string>("fetchxml") ?? "", "fetch");
        var layout = ViewXml.Parse(view.GetAttributeValue<string>("layoutxml") ?? "", "grid");
        return new ViewApplySpec
        {
            Solution = null!,
            Table = table,
            Type = type,
            Name = view.GetAttributeValue<string>("name"),
            Description = view.GetAttributeValue<string>("description"),
            Columns = ViewXml.Columns(layout),
            Filter = ViewXml.Filter(fetch),
            Sort = ViewXml.Sort(fetch),
            FindColumns = type == ViewType.QuickFind ? ViewXml.FindColumns(fetch) : null,
            IsDefault = type == ViewType.Public ? view.GetAttributeValue<bool?>("isdefault") : null,
        };
    }

    private static string Require(string? table, string kind) => table ?? throw Invalid($"Describing a {kind} needs table.");

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
