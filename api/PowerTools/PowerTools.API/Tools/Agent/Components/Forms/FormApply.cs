using System.ComponentModel;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Views;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Forms;

[JsonConverter(typeof(JsonStringEnumConverter<FormKind>))]
public enum FormKind
{
    [JsonStringEnumMemberName("main")] Main,
    [JsonStringEnumMemberName("quickCreate")] QuickCreate,
    [JsonStringEnumMemberName("quickView")] QuickView,
    [JsonStringEnumMemberName("card")] Card,
}

[JsonConverter(typeof(JsonStringEnumConverter<FormOp>))]
public enum FormOp
{
    [JsonStringEnumMemberName("addField")] AddField,
    [JsonStringEnumMemberName("moveField")] MoveField,
    [JsonStringEnumMemberName("removeField")] RemoveField,
    [JsonStringEnumMemberName("addSection")] AddSection,
    [JsonStringEnumMemberName("addTab")] AddTab,
    [JsonStringEnumMemberName("setLabel")] SetLabel,
    [JsonStringEnumMemberName("setVisible")] SetVisible,
    [JsonStringEnumMemberName("addSubgrid")] AddSubgrid,
}

[Description("Changes to one existing form, as operations run in order. Each one is skipped when the form already has it, so the same spec can be sent again.")]
public sealed class FormApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the form goes into.")]
    public required string Solution { get; init; }

    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("The form's name, for example Information.")]
    public required string Form { get; init; }

    [Description("Default main.")]
    public FormKind? FormType { get; init; }

    public required List<FormOperation> Operations { get; init; }
}

[Description("addField/moveField: column into section (after a column). removeField: column. addSection: section into tab. addTab: tab. setLabel/setVisible: on column, else section, else tab. addSubgrid: name, subgridTable into section. Tabs and sections match by name or label.")]
public sealed class FormOperation
{
    public required FormOp Op { get; init; }

    [Description("Column logical name.")]
    public string? Column { get; init; }

    public string? Tab { get; init; }

    public string? Section { get; init; }

    [Description("addSubgrid: the subgrid's name.")]
    public string? Name { get; init; }

    [Description("Label in the base language. For a new tab or section, its label.")]
    public string? Label { get; init; }

    [Description("Place it after this column (fields), section (addSection) or tab (addTab). Default: at the end.")]
    public string? After { get; init; }

    public bool? Visible { get; init; }

    [Description("addSubgrid: the table the subgrid lists.")]
    public string? SubgridTable { get; init; }

    [Description("addSubgrid: schema name of the relationship; without it the subgrid lists all records.")]
    public string? Relationship { get; init; }

    [Description("addSubgrid: name of a public view of subgridTable. Default: its default view.")]
    public string? View { get; init; }
}

/// <summary>
/// Edits FormXml as a tree. Every operation first checks whether the form already has what it asks for, so a
/// repeated spec changes nothing; what it does not model (controls, events, parameters) is kept as it was.
/// </summary>
public sealed class FormEditor(XDocument form, int language)
{
    public const string SubgridClassId = "{E7A81278-8635-4d9e-8D4D-59480B391C5B}";

    public XDocument Form { get; } = form;

    private IEnumerable<XElement> Tabs => Form.Root?.Element("tabs")?.Elements("tab") ?? [];

    private IEnumerable<XElement> Sections => Tabs.SelectMany(t => t.Descendants("section"));

    /// <summary>The cells in the tabs (not the header or footer) that hold the column.</summary>
    public List<XElement> FieldCells(string column) =>
        Tabs.SelectMany(t => t.Descendants("control"))
            .Where(c => string.Equals((string?)c.Attribute("datafieldname"), column, StringComparison.OrdinalIgnoreCase))
            .Select(c => c.Ancestors("cell").FirstOrDefault())
            .OfType<XElement>()
            .ToList();

    public XElement? Tab(string name) => Tabs.FirstOrDefault(t => Matches(t, name));

    public XElement? Section(string name, string? tab)
    {
        var sections = tab is null ? Sections : Tab(tab)?.Descendants("section") ?? [];
        return sections.FirstOrDefault(s => Matches(s, name));
    }

    public XElement RequireSection(string? name, string? tab, string op)
    {
        if (tab is not null && Tab(tab) is null) throw Invalid($"{op}: tab '{tab}' is not on the form.");
        if (name is null) throw Invalid($"{op} needs section.");
        return Section(name, tab) ?? throw Invalid($"{op}: section '{name}' is not on the form{(tab is null ? "" : $" in tab '{tab}'")}.");
    }

    /// <summary>Puts a new row with the cell into the section, after the row holding <paramref name="after"/>.</summary>
    public void PlaceCell(XElement section, XElement cell, string? after, int extraRows = 0)
    {
        var rows = section.Element("rows") ?? new XElement("rows");
        if (rows.Parent is null) section.Add(rows);
        var row = new XElement("row", cell);
        var anchor = after is null ? null : FieldCells(after).FirstOrDefault(c => c.Ancestors("section").FirstOrDefault() == section)?.Parent;
        if (after is not null && anchor is null) throw Invalid($"Column '{after}' is not in section '{(string?)section.Attribute("name")}'.");
        if (anchor is not null) anchor.AddAfterSelf(row);
        else rows.Add(row);
        for (var i = 0; i < extraRows; i++) row.AddAfterSelf(new XElement("row"));
    }

    /// <summary>Takes a cell out; a row it was alone in goes with it.</summary>
    public static void RemoveCell(XElement cell)
    {
        var row = cell.Parent;
        if (row is not null && row.Name == "row" && row.Elements("cell").Count() == 1) row.Remove();
        else cell.Remove();
    }

    public XElement NewFieldCell(string column, string label, string classId) =>
        new("cell",
            new XAttribute("id", NewId()),
            new XElement("labels", Label(label)),
            new XElement("control",
                new XAttribute("id", column),
                new XAttribute("classid", classId),
                new XAttribute("datafieldname", column)));

    public XElement NewSection(string name, string label) =>
        new("section",
            new XAttribute("name", name),
            new XAttribute("showlabel", "true"),
            new XAttribute("showbar", "false"),
            new XAttribute("id", NewId()),
            new XAttribute("IsUserDefined", "0"),
            new XAttribute("columns", "1"),
            new XElement("labels", Label(label)),
            new XElement("rows"));

    public XElement NewTab(string name, string label) =>
        new("tab",
            new XAttribute("name", name),
            new XAttribute("id", NewId()),
            new XAttribute("IsUserDefined", "0"),
            new XAttribute("expanded", "true"),
            new XAttribute("showlabel", "true"),
            new XElement("labels", Label(label)),
            new XElement("columns",
                new XElement("column", new XAttribute("width", "100%"),
                    new XElement("sections", NewSection($"{name}_section_1", label)))));

    public void AddTab(XElement tab, string? after)
    {
        var tabs = Form.Root!.Element("tabs") ?? throw Invalid("The form has no tabs element.");
        var anchor = after is null ? null : Tab(after) ?? throw Invalid($"Tab '{after}' is not on the form.");
        if (anchor is not null) anchor.AddAfterSelf(tab);
        else tabs.Add(tab);
    }

    public void AddSection(XElement tab, XElement section, string? after)
    {
        var anchor = after is null ? null : tab.Descendants("section").FirstOrDefault(s => Matches(s, after))
            ?? throw Invalid($"Section '{after}' is not in tab '{(string?)tab.Attribute("name")}'.");
        if (anchor is not null)
        {
            anchor.AddAfterSelf(section);
            return;
        }

        var sections = tab.Descendants("sections").FirstOrDefault() ?? throw Invalid($"Tab '{(string?)tab.Attribute("name")}' has no column to hold a section.");
        sections.Add(section);
    }

    public string? LabelOf(XElement element) =>
        element.Element("labels")?.Elements("label").FirstOrDefault(l => (int?)l.Attribute("languagecode") == language)?.Attribute("description")?.Value;

    public void SetLabel(XElement element, string text)
    {
        var labels = element.Element("labels");
        if (labels is null)
        {
            labels = new XElement("labels");
            element.AddFirst(labels);
        }

        var label = labels.Elements("label").FirstOrDefault(l => (int?)l.Attribute("languagecode") == language);
        if (label is null) labels.Add(Label(text));
        else label.SetAttributeValue("description", text);
    }

    public static bool IsVisible(XElement element) => (string?)element.Attribute("visible") != "false";

    public static void SetVisible(XElement element, bool visible) => element.SetAttributeValue("visible", visible ? null : "false");

    public bool HasControl(string id) =>
        Form.Descendants("control").Any(c => string.Equals((string?)c.Attribute("id"), id, StringComparison.OrdinalIgnoreCase));

    private XElement Label(string text) => new("label", new XAttribute("description", text), new XAttribute("languagecode", language));

    public static string NewId() => $"{{{Guid.NewGuid().ToString().ToUpperInvariant()}}}";

    private bool Matches(XElement element, string wanted) =>
        string.Equals((string?)element.Attribute("name"), wanted, StringComparison.OrdinalIgnoreCase)
        || string.Equals(LabelOf(element), wanted, StringComparison.OrdinalIgnoreCase);

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

/// <summary>
/// Plans form_apply: runs the operations on the form as it stands (unpublished included) and plans one step that writes
/// the edited FormXml, listing every operation that changes something. Operations the form already satisfies are left
/// out, so a repeated spec plans nothing.
/// </summary>
public sealed class FormPlanner : IComponentPlanner<FormApplySpec>
{
    public const string Family = "form";

    public static int TypeCode(FormKind kind) => kind switch
    {
        FormKind.QuickCreate => 7,
        FormKind.QuickView => 6,
        FormKind.Card => 11,
        _ => 2,
    };

    public async Task<Plan> PlanAsync(FormApplySpec spec, PlanContext context, CancellationToken ct)
    {
        if (spec.Operations is not { Count: > 0 }) throw FormEditor.Invalid("operations must list at least one operation.");
        var table = spec.Table.Trim().ToLowerInvariant();
        await context.SolutionAsync(spec.Solution, ct);
        var language = await context.BaseLanguageAsync(ct);
        var metadata = await context.Metadata.TableAsync(table, ct) ?? throw FormEditor.Invalid($"Table {table} does not exist.");
        var form = await FindAsync(context.Client, table, spec.Form, spec.FormType ?? FormKind.Main, ct);
        var label = $"{table}/{form.GetAttributeValue<string>("name")}";
        var lockKey = Locks.RecordKey(form.Id);
        var xml = form.GetAttributeValue<string>("formxml") ?? "";
        var stateToken = ViewPlanner.Hash(xml);
        if (form.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
            return new Plan([PlanStep.Blocked("updateForm", label, $"Form {label} is managed and not customizable.")], lockKeys: [lockKey], stateToken: stateToken);

        XDocument doc;
        try
        {
            doc = XDocument.Parse(xml);
        }
        catch (System.Xml.XmlException ex)
        {
            throw FormEditor.Invalid($"The form's XML cannot be read: {ex.Message}");
        }

        var editor = new FormEditor(doc, language);
        var changes = new List<string>();
        for (var i = 0; i < spec.Operations.Count; i++)
        {
            var change = await ApplyAsync(editor, spec.Operations[i], metadata, context, language, ct);
            if (change is not null) changes.Add($"{i + 1}. {change}");
        }

        if (changes.Count == 0) return new Plan([], lockKeys: [lockKey], stateToken: stateToken);
        var edited = doc.Root!.ToString(SaveOptions.DisableFormatting);
        var id = form.Id;
        return new Plan(
            [new PlanStep
            {
                Op = "updateForm",
                Target = label,
                Detail = string.Join("\n", changes),
                Action = async (step, token) =>
                {
                    await step.Client.UpdateAsync(new Entity("systemform", id) { ["formxml"] = edited }, token);
                    if (!string.IsNullOrWhiteSpace(step.SolutionUniqueName))
                    {
                        await step.Client.ExecuteAsync(new AddSolutionComponentRequest
                        {
                            ComponentId = id,
                            ComponentType = Shared.ComponentKinds.SystemFormType,
                            SolutionUniqueName = step.SolutionUniqueName,
                            AddRequiredComponents = false,
                        }, token);
                    }
                },
                Publishes = [new PublishTarget(PublishKind.Entity, table)],
            }],
            lockKeys: [lockKey],
            stateToken: stateToken);
    }

    /// <summary>Runs one operation on the form; answers what it changed, or null when the form already had it.</summary>
    private static async Task<string?> ApplyAsync(
        FormEditor editor, FormOperation op, EntityMetadata metadata, PlanContext context, int language, CancellationToken ct)
    {
        string Column(string what)
        {
            var column = op.Column?.Trim().ToLowerInvariant() ?? throw FormEditor.Invalid($"{what} needs column.");
            return column;
        }

        switch (op.Op)
        {
            case FormOp.AddField:
            {
                var column = Column("addField");
                if (editor.FieldCells(column).Count > 0) return null;
                var attribute = Attribute(metadata, column);
                var section = editor.RequireSection(op.Section, op.Tab, "addField");
                var display = op.Label ?? Labels.Text(attribute.DisplayName, language) ?? column;
                editor.PlaceCell(section, editor.NewFieldCell(column, display, AgentFormXml.ClassId(ControlKind(attribute))), op.After?.ToLowerInvariant());
                return $"add {column} to section {(string?)section.Attribute("name")}";
            }

            case FormOp.MoveField:
            {
                var column = Column("moveField");
                var cells = editor.FieldCells(column);
                if (cells.Count == 0) throw FormEditor.Invalid($"moveField: column '{column}' is not on the form; use addField.");
                var section = editor.RequireSection(op.Section, op.Tab, "moveField");
                var cell = cells[0];
                var inSection = cell.Ancestors("section").FirstOrDefault() == section;
                var after = op.After?.ToLowerInvariant();
                var placed = inSection && (after is null || editor.FieldCells(after).FirstOrDefault()?.Parent?.ElementsAfterSelf("row").FirstOrDefault() == cell.Parent);
                if (placed) return null;
                FormEditor.RemoveCell(cell);
                editor.PlaceCell(section, cell, after);
                return $"move {column} to section {(string?)section.Attribute("name")}{(after is null ? "" : $" after {after}")}";
            }

            case FormOp.RemoveField:
            {
                var column = Column("removeField");
                var cells = editor.FieldCells(column);
                if (cells.Count == 0) return null;
                foreach (var cell in cells) FormEditor.RemoveCell(cell);
                return $"remove {column}";
            }

            case FormOp.AddSection:
            {
                var name = op.Section?.Trim() ?? throw FormEditor.Invalid("addSection needs section (the new section's name).");
                var tabName = op.Tab ?? throw FormEditor.Invalid("addSection needs tab.");
                if (editor.Section(name, null) is not null) return null;
                var tab = editor.Tab(tabName) ?? throw FormEditor.Invalid($"addSection: tab '{tabName}' is not on the form.");
                editor.AddSection(tab, editor.NewSection(name, op.Label ?? name), op.After);
                return $"add section {name} to tab {(string?)tab.Attribute("name")}";
            }

            case FormOp.AddTab:
            {
                var name = op.Tab?.Trim() ?? throw FormEditor.Invalid("addTab needs tab (the new tab's name).");
                if (editor.Tab(name) is not null) return null;
                editor.AddTab(editor.NewTab(name, op.Label ?? name), op.After);
                return $"add tab {name}";
            }

            case FormOp.SetLabel:
            {
                var text = op.Label ?? throw FormEditor.Invalid("setLabel needs label.");
                var (element, what) = Target(editor, op, "setLabel");
                if (string.Equals(editor.LabelOf(element), text, StringComparison.Ordinal)) return null;
                editor.SetLabel(element, text);
                return $"label of {what} → {text}";
            }

            case FormOp.SetVisible:
            {
                var visible = op.Visible ?? throw FormEditor.Invalid("setVisible needs visible.");
                var (element, what) = Target(editor, op, "setVisible");
                if (FormEditor.IsVisible(element) == visible) return null;
                FormEditor.SetVisible(element, visible);
                return $"{(visible ? "show" : "hide")} {what}";
            }

            case FormOp.AddSubgrid:
            {
                var name = op.Name?.Trim() ?? throw FormEditor.Invalid("addSubgrid needs name.");
                if (editor.HasControl(name)) return null;
                var target = op.SubgridTable?.Trim().ToLowerInvariant() ?? throw FormEditor.Invalid("addSubgrid needs subgridTable.");
                var section = editor.RequireSection(op.Section, op.Tab, "addSubgrid");
                var viewId = await SubgridViewAsync(context.Client, target, op.View, ct);
                var parameters = new XElement("parameters",
                    new XElement("RecordsPerPage", 4),
                    new XElement("AutoExpand", "Fixed"),
                    new XElement("EnableQuickFind", "false"),
                    new XElement("EnableViewPicker", "false"),
                    new XElement("EnableJumpBar", "false"),
                    new XElement("ChartGridMode", "Grid"),
                    new XElement("RelationshipName", op.Relationship ?? ""),
                    new XElement("TargetEntityType", target),
                    new XElement("ViewId", $"{{{viewId.ToString().ToUpperInvariant()}}}"),
                    new XElement("ViewIds", ""),
                    new XElement("IsUserView", "false"),
                    new XElement("IsUserChart", "false"),
                    new XElement("EnableChartPicker", "false"));
                var cell = new XElement("cell",
                    new XAttribute("id", FormEditor.NewId()),
                    new XAttribute("rowspan", "4"),
                    new XAttribute("colspan", "1"),
                    new XElement("labels", new XElement("label", new XAttribute("description", op.Label ?? name), new XAttribute("languagecode", language))),
                    new XElement("control",
                        new XAttribute("id", name),
                        new XAttribute("classid", FormEditor.SubgridClassId),
                        new XAttribute("indicationOfSubgrid", "true"),
                        parameters));
                editor.PlaceCell(section, cell, op.After?.ToLowerInvariant(), extraRows: 3);
                return $"add subgrid {name} of {target}{(op.Relationship is null ? "" : $" ({op.Relationship})")} to section {(string?)section.Attribute("name")}";
            }

            default:
                throw FormEditor.Invalid("The operation is not known.");
        }
    }

    private static (XElement Element, string What) Target(FormEditor editor, FormOperation op, string what)
    {
        if (op.Column is { } column)
        {
            var cell = editor.FieldCells(column.ToLowerInvariant()).FirstOrDefault()
                ?? throw FormEditor.Invalid($"{what}: column '{column}' is not on the form.");
            return (cell, column.ToLowerInvariant());
        }

        if (op.Section is { } section)
            return (editor.Section(section, op.Tab) ?? throw FormEditor.Invalid($"{what}: section '{section}' is not on the form."), $"section {section}");
        if (op.Tab is { } tab)
            return (editor.Tab(tab) ?? throw FormEditor.Invalid($"{what}: tab '{tab}' is not on the form."), $"tab {tab}");
        throw FormEditor.Invalid($"{what} needs column, section or tab.");
    }

    private static AttributeMetadata Attribute(EntityMetadata metadata, string column) =>
        (metadata.Attributes ?? []).FirstOrDefault(a => string.Equals(a.LogicalName, column, StringComparison.OrdinalIgnoreCase))
        ?? throw FormEditor.Invalid($"Table {metadata.LogicalName} has no column {column}. Create it with table_apply first.");

    private static string ControlKind(AttributeMetadata attribute) => attribute.AttributeType switch
    {
        AttributeTypeCode.Memo => "memo",
        AttributeTypeCode.Integer or AttributeTypeCode.BigInt => "integer",
        AttributeTypeCode.Decimal or AttributeTypeCode.Double => "decimal",
        AttributeTypeCode.Money => "money",
        AttributeTypeCode.Boolean => "boolean",
        AttributeTypeCode.DateTime => "datetime",
        AttributeTypeCode.Picklist or AttributeTypeCode.State or AttributeTypeCode.Status => "choice",
        AttributeTypeCode.Lookup or AttributeTypeCode.Customer or AttributeTypeCode.Owner => "lookup",
        _ => "text",
    };

    private static async Task<Guid> SubgridViewAsync(IAgentClient client, string table, string? view, CancellationToken ct)
    {
        var query = new QueryExpression("savedquery") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("name") };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, table);
        query.Criteria.AddCondition("querytype", ConditionOperator.Equal, 0);
        if (view is not null) query.Criteria.AddCondition("name", ConditionOperator.Equal, view.Trim());
        else query.Criteria.AddCondition("isdefault", ConditionOperator.Equal, true);
        var row = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        return row?.Id ?? throw FormEditor.Invalid(view is null
            ? $"Table {table} has no default public view for the subgrid; name one with view."
            : $"Table {table} has no public view named '{view}'.");
    }

    /// <summary>The form as it stands, unpublished changes included.</summary>
    internal static async Task<Entity> FindAsync(IAgentClient client, string table, string name, FormKind kind, CancellationToken ct)
    {
        var query = new QueryExpression("systemform") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name") };
        query.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, table);
        query.Criteria.AddCondition("type", ConditionOperator.Equal, TypeCode(kind));
        if (Guid.TryParse(name, out var id)) query.Criteria.AddCondition("formid", ConditionOperator.Equal, id);
        else query.Criteria.AddCondition("name", ConditionOperator.Equal, name.Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0)
            throw new AgentProblemException(AgentFaults.NotFound($"Table {table} has no {kind} form named '{name}'. List forms with inspect_ui kind form."));
        if (rows.Count > 1) throw FormEditor.Invalid($"Table {table} has more than one {kind} form named '{name}'; give its id.");
        var response = (RetrieveUnpublishedResponse)await client.ExecuteAsync(new RetrieveUnpublishedRequest
        {
            Target = new EntityReference("systemform", rows[0].Id),
            ColumnSet = new ColumnSet("name", "formxml", "iscustomizable", "type"),
        }, ct);
        return response.Entity;
    }
}
