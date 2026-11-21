using System.ComponentModel;
using System.Text.Json.Serialization;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Agent.Components.Forms;

[Description("The whole layout: these tabs in this order, each with these sections and fields. Tabs and sections left out are taken off the form; a field keeps its control, label and settings when it is already on the form, and subgrids and web resources already in a kept section stay at its end.")]
public sealed class FormLayout
{
    public required List<LayoutTab> Tabs { get; init; }
}

public sealed class LayoutTab
{
    [Description("The tab's name; an existing tab matches by name.")]
    public required string Name { get; init; }

    [Description("Default: the current label, or the name for a new tab.")]
    public string? Label { get; init; }

    public bool? Visible { get; init; }

    public required List<LayoutSection> Sections { get; init; }
}

public sealed class LayoutSection
{
    [Description("The section's name; an existing section matches by name, in any tab.")]
    public required string Name { get; init; }

    [Description("Default: the current label, or the name for a new section.")]
    public string? Label { get; init; }

    public bool? Visible { get; init; }

    [Description("Which column of the tab the section is in, 1 to 3. Default 1.")]
    public int? Column { get; init; }

    [Description("Column logical names, one per row, in order. Not for dashboards.")]
    public List<string>? Fields { get; init; }

    [Description("Dashboards only: the charts and lists in this section, in order.")]
    public List<DashboardComponent>? Components { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<DashboardMode>))]
public enum DashboardMode
{
    [JsonStringEnumMemberName("grid")] Grid,
    [JsonStringEnumMemberName("chart")] Chart,
}

[Description("A list or chart on a dashboard: a public view of a table, shown as a grid, or with a system chart of the table.")]
public sealed class DashboardComponent
{
    [Description("The component's name, unique on the dashboard.")]
    public required string Name { get; init; }

    [Description("Default: the view's name.")]
    public string? Label { get; init; }

    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("A public view of the table. Default: its default public view.")]
    public string? View { get; init; }

    [Description("A system chart of the table. With it the component shows the chart.")]
    public string? Chart { get; init; }
}

/// <summary>A dashboard component with its view and chart found.</summary>
public sealed record ResolvedComponent(DashboardComponent Spec, string Label, Guid ViewId, Guid? ChartId);

/// <summary>
/// Writes a whole layout into FormXml. Existing tabs, sections and field cells are reused, so their ids, labels,
/// events and parameters survive; the result is compared with <see cref="Summary"/> to tell whether anything changed.
/// </summary>
public static class FormLayoutWriter
{
    public const string GridClassId = FormEditor.SubgridClassId;

    /// <summary>Replaces the tabs of the form with the layout. Answers what changed, or null when nothing did.</summary>
    public static string? Apply(
        FormEditor editor,
        FormLayout layout,
        Func<string, string> fieldLabel,
        Func<string, string> classId,
        IReadOnlyDictionary<string, ResolvedComponent>? components)
    {
        Check(layout, components is not null);
        var doc = editor.Form;
        var before = Summary(doc, editor);
        var fieldsBefore = Fields(doc);
        var root = doc.Root!;
        var oldTabs = root.Element("tabs");
        var newTabs = new XElement("tabs", oldTabs?.Attributes());

        foreach (var tab in layout.Tabs)
        {
            var existingTab = editor.Tab(tab.Name.Trim());
            var tabElement = existingTab is null
                ? new XElement("tab",
                    new XAttribute("name", tab.Name.Trim()),
                    new XAttribute("id", FormEditor.NewId()),
                    new XAttribute("IsUserDefined", "0"),
                    new XAttribute("expanded", "true"),
                    new XAttribute("showlabel", "true"),
                    new XElement("labels"))
                : new XElement("tab", existingTab.Attributes(), existingTab.Elements().Where(e => e.Name != "columns"));
            if (tab.Label is not null || existingTab is null) editor.SetLabel(tabElement, tab.Label ?? tab.Name.Trim());
            if (tab.Visible is { } tabVisible) FormEditor.SetVisible(tabElement, tabVisible);

            var columnCount = tab.Sections.Select(s => s.Column ?? 1).DefaultIfEmpty(1).Max();
            var width = columnCount switch { 1 => "100%", 2 => "50%", _ => "33%" };
            var columns = Enumerable.Range(0, columnCount).Select(_ => new XElement("column", new XAttribute("width", width), new XElement("sections"))).ToList();
            tabElement.Add(new XElement("columns", columns));

            foreach (var section in tab.Sections)
            {
                var existing = editor.Section(section.Name.Trim(), null);
                var sectionElement = existing is null
                    ? editor.NewSection(section.Name.Trim(), section.Label ?? section.Name.Trim())
                    : new XElement("section", existing.Attributes(), existing.Elements().Where(e => e.Name != "rows"), new XElement("rows"));
                if (section.Label is not null) editor.SetLabel(sectionElement, section.Label);
                if (section.Visible is { } sectionVisible) FormEditor.SetVisible(sectionElement, sectionVisible);
                var rows = sectionElement.Element("rows")!;

                if (components is not null)
                {
                    foreach (var component in section.Components ?? [])
                    {
                        rows.Add(new XElement("row", ComponentCell(editor, components[component.Name.Trim()], existing)));
                        for (var i = 0; i < 11; i++) rows.Add(new XElement("row"));
                    }
                }
                else
                {
                    foreach (var field in section.Fields ?? [])
                    {
                        var column = field.Trim().ToLowerInvariant();
                        var cell = editor.FieldCells(column).FirstOrDefault() is { } found
                            ? new XElement(found)
                            : editor.NewFieldCell(column, fieldLabel(column), classId(column));
                        rows.Add(new XElement("row", cell));
                    }

                    // Subgrids, web resources and other controls without a column stay, with the empty rows they span.
                    if (existing is not null) rows.Add(OtherRows(existing));
                }

                columns[(section.Column ?? 1) - 1].Element("sections")!.Add(sectionElement);
            }

            newTabs.Add(tabElement);
        }

        if (oldTabs is null) root.AddFirst(newTabs);
        else oldTabs.ReplaceWith(newTabs);

        var after = Summary(doc, editor);
        if (before == after) return null;
        var fieldsAfter = Fields(doc);
        var parts = new List<string> { $"layout: {layout.Tabs.Count} tab(s), {layout.Tabs.Sum(t => t.Sections.Count)} section(s)" };
        var added = fieldsAfter.Except(fieldsBefore).ToList();
        var removed = fieldsBefore.Except(fieldsAfter).ToList();
        if (added.Count > 0) parts.Add($"add {string.Join(", ", added)}");
        if (removed.Count > 0) parts.Add($"take off {string.Join(", ", removed)}");
        return string.Join("; ", parts);
    }

    /// <summary>The layout as text: tabs, sections, their column, labels, visibility and controls in order.</summary>
    public static string Summary(XDocument doc, FormEditor editor)
    {
        var lines = new List<string>();
        foreach (var tab in doc.Root?.Element("tabs")?.Elements("tab") ?? [])
        {
            lines.Add($"tab {(string?)tab.Attribute("name")} '{editor.LabelOf(tab)}' {FormEditor.IsVisible(tab)}");
            var columns = tab.Element("columns")?.Elements("column").ToList() ?? [];
            for (var i = 0; i < columns.Count; i++)
            {
                foreach (var section in columns[i].Descendants("section"))
                {
                    var controls = section.Descendants("control").Select(Describe);
                    lines.Add($" section {(string?)section.Attribute("name")} '{editor.LabelOf(section)}' {FormEditor.IsVisible(section)} col {i + 1}: {string.Join(", ", controls)}");
                }
            }
        }

        return string.Join("\n", lines);
    }

    private static string Describe(XElement control)
    {
        var field = (string?)control.Attribute("datafieldname");
        if (field is not null) return field;
        var parameters = control.Element("parameters");
        var target = (string?)parameters?.Element("TargetEntityType");
        return target is null
            ? $"#{(string?)control.Attribute("id")}"
            : $"#{(string?)control.Attribute("id")}({target} {(string?)parameters!.Element("ViewId")} {(string?)parameters.Element("VisualizationId")} {(string?)parameters.Element("ChartGridMode")} '{control.Parent?.Element("labels")?.Element("label")?.Attribute("description")?.Value}')";
    }

    private static HashSet<string> Fields(XDocument doc) =>
        (doc.Root?.Element("tabs")?.Descendants("control") ?? [])
            .Select(c => (string?)c.Attribute("datafieldname"))
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static IEnumerable<XElement> OtherRows(XElement section)
    {
        var keep = false;
        foreach (var row in section.Element("rows")?.Elements("row") ?? [])
        {
            var cells = row.Elements("cell").ToList();
            if (cells.Count > 0) keep = cells.Any(c => c.Element("control") is { } control && control.Attribute("datafieldname") is null);
            if (keep) yield return new XElement(row);
        }
    }

    private static XElement ComponentCell(FormEditor editor, ResolvedComponent component, XElement? existingSection)
    {
        var name = component.Spec.Name.Trim();
        var existingCell = existingSection?.Descendants("control")
            .FirstOrDefault(c => string.Equals((string?)c.Attribute("id"), name, StringComparison.OrdinalIgnoreCase))?.Parent;
        var chart = component.ChartId is { } chartId ? $"{{{chartId.ToString().ToUpperInvariant()}}}" : "";
        var cell = new XElement("cell",
            new XAttribute("id", (string?)existingCell?.Attribute("id") ?? FormEditor.NewId()),
            new XAttribute("rowspan", "12"),
            new XAttribute("colspan", "1"),
            new XAttribute("showlabel", "true"),
            new XElement("labels"),
            new XElement("control",
                new XAttribute("id", name),
                new XAttribute("classid", GridClassId),
                new XAttribute("indicationOfSubgrid", "true"),
                new XElement("parameters",
                    new XElement("ViewId", $"{{{component.ViewId.ToString().ToUpperInvariant()}}}"),
                    new XElement("IsUserView", "false"),
                    new XElement("RelationshipName", ""),
                    new XElement("TargetEntityType", component.Spec.Table.Trim().ToLowerInvariant()),
                    new XElement("AutoExpand", "Fixed"),
                    new XElement("EnableQuickFind", "false"),
                    new XElement("EnableViewPicker", "true"),
                    new XElement("ViewIds", ""),
                    new XElement("EnableJumpBar", "false"),
                    new XElement("ChartGridMode", component.ChartId is null ? "Grid" : "Chart"),
                    new XElement("VisualizationId", chart),
                    new XElement("IsUserChart", "false"),
                    new XElement("EnableChartPicker", component.ChartId is null ? "false" : "true"),
                    new XElement("RecordsPerPage", "10"))));
        editor.SetLabel(cell, component.Label);
        return cell;
    }

    private static void Check(FormLayout layout, bool dashboard)
    {
        if (layout.Tabs is not { Count: > 0 }) throw FormEditor.Invalid("layout needs at least one tab.");
        Unique(layout.Tabs.Select(t => t.Name), "tab");
        Unique(layout.Tabs.SelectMany(t => t.Sections).Select(s => s.Name), "section");
        foreach (var section in layout.Tabs.SelectMany(t => t.Sections))
        {
            if (section.Column is < 1 or > 3) throw FormEditor.Invalid($"Section {section.Name}: column is 1, 2 or 3.");
            if (dashboard && section.Fields is { Count: > 0 }) throw FormEditor.Invalid($"Section {section.Name}: a dashboard holds components, not fields.");
            if (!dashboard && section.Components is { Count: > 0 }) throw FormEditor.Invalid($"Section {section.Name}: components are for dashboards; a form holds fields.");
        }

        if (dashboard) Unique(layout.Tabs.SelectMany(t => t.Sections).SelectMany(s => s.Components ?? []).Select(c => c.Name), "component");
        else Unique(layout.Tabs.SelectMany(t => t.Sections).SelectMany(s => s.Fields ?? []), "field");
    }

    private static void Unique(IEnumerable<string> names, string what)
    {
        var duplicate = names.Select(n => n.Trim()).GroupBy(n => n, StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null) throw FormEditor.Invalid($"The layout has the {what} {duplicate.Key} twice.");
    }
}

/// <summary>Form libraries and event handlers in FormXml.</summary>
public static class FormEvents
{
    public static XElement? Library(XDocument form, string name) =>
        form.Root?.Element("formLibraries")?.Elements("Library")
            .FirstOrDefault(l => string.Equals((string?)l.Attribute("name"), name, StringComparison.OrdinalIgnoreCase));

    /// <summary>Adds the library at the end of the form's libraries; false when it is already there.</summary>
    public static bool AddLibrary(XDocument form, string name)
    {
        if (Library(form, name) is not null) return false;
        var libraries = form.Root!.Element("formLibraries");
        if (libraries is null)
        {
            libraries = new XElement("formLibraries");
            Place(form.Root!, libraries, "tabs", "header", "footer", "events", "DisplayConditions");
        }

        libraries.Add(new XElement("Library", new XAttribute("name", name), new XAttribute("libraryUniqueId", FormEditor.NewId())));
        return true;
    }

    /// <summary>Takes the library and every handler that calls it off the form; answers how many handlers went with it.</summary>
    public static int? RemoveLibrary(XDocument form, string name)
    {
        var library = Library(form, name);
        if (library is null) return null;
        var handlers = Handlers(form).Where(h => string.Equals((string?)h.Attribute("libraryName"), name, StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var handler in handlers) handler.Remove();
        var libraries = library.Parent!;
        library.Remove();
        if (!libraries.HasElements) libraries.Remove();
        return handlers.Count;
    }

    public static IEnumerable<XElement> Handlers(XDocument form) =>
        form.Root?.Element("events")?.Descendants("Handler") ?? [];

    public static XElement? Event(XDocument form, string name, string? attribute) =>
        form.Root?.Element("events")?.Elements("event").FirstOrDefault(e =>
            string.Equals((string?)e.Attribute("name"), name, StringComparison.OrdinalIgnoreCase)
            && string.Equals((string?)e.Attribute("attribute"), attribute, StringComparison.OrdinalIgnoreCase));

    public static XElement? Handler(XElement? @event, string library, string function) =>
        @event?.Element("Handlers")?.Elements("Handler").FirstOrDefault(h =>
            string.Equals((string?)h.Attribute("libraryName"), library, StringComparison.OrdinalIgnoreCase)
            && string.Equals((string?)h.Attribute("functionName"), function, StringComparison.Ordinal));

    public static XElement EnsureEvent(XDocument form, string name, string? attribute)
    {
        if (Event(form, name, attribute) is { } found) return found;
        var events = form.Root!.Element("events");
        if (events is null)
        {
            events = new XElement("events");
            Place(form.Root!, events, "tabs", "header", "footer");
        }

        var created = new XElement("event",
            new XAttribute("name", name),
            new XAttribute("application", "false"),
            new XAttribute("active", "false"));
        if (attribute is not null) created.Add(new XAttribute("attribute", attribute));
        events.Add(created);
        return created;
    }

    /// <summary>Puts a new element after the last of the named siblings that is there, else first.</summary>
    private static void Place(XElement root, XElement element, params string[] after)
    {
        var anchor = root.Elements().LastOrDefault(e => after.Contains(e.Name.LocalName));
        if (anchor is not null) anchor.AddAfterSelf(element);
        else root.AddFirst(element);
    }
}
