using System.Security;
using System.Xml.Linq;

namespace PowerTools.API.Tools.Agent;

public sealed record FormSectionDto(string Name, string Label);

public sealed record FormTabDto(string Name, string Label, IReadOnlyList<FormSectionDto> Sections);

public sealed record FormColumnRemoval(string FormXml, IReadOnlyList<string> Places);

public sealed record FormInfoDto(Guid Id, string Name, int Type, IReadOnlyList<FormTabDto> Tabs);

/// <summary>Reads and edits systemform.formxml as text, leaving everything it does not touch as it was.</summary>
public static class AgentFormXml
{
    /// <summary>Control class ids by the kind of column.</summary>
    public static string ClassId(string kind) => kind switch
    {
        "memo" => "{E0DECE4B-6FC8-4a8f-A065-082708572369}",
        "integer" => "{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}",
        "decimal" => "{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E}",
        "money" => "{533B9E00-756B-4312-95A0-DC888637AC78}",
        "boolean" => "{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}",
        "datetime" => "{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}",
        "choice" => "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}",
        "lookup" => "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
        _ => "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
    };

    public static IReadOnlyList<FormTabDto> ListTabs(string formXml)
    {
        var doc = AgentXmlSplice.Parse(formXml);
        return doc.Descendants("tab")
            .Select(tab => new FormTabDto(
                (string?)tab.Attribute("name") ?? "",
                LabelOf(tab),
                tab.Descendants("section")
                    .Select(section => new FormSectionDto((string?)section.Attribute("name") ?? "", LabelOf(section)))
                    .ToList()))
            .ToList();
    }

    /// <summary>
    /// Adds a row holding the column to the end of a section's rows: the named section, or the first section of the
    /// first tab. Tab and section match by name or by label, ignoring case. The column must not already be on the form.
    /// </summary>
    public static AgentResult<string> AddColumn(
        string formXml, string column, string displayName, int languageCode, string classId, string? tab, string? section, Guid cellId)
    {
        var doc = AgentXmlSplice.Parse(formXml);

        var existing = doc.Descendants("control").Any(control =>
            string.Equals((string?)control.Attribute("datafieldname"), column, StringComparison.OrdinalIgnoreCase)
            || string.Equals((string?)control.Attribute("id"), column, StringComparison.OrdinalIgnoreCase));
        if (existing)
            return AgentResult<string>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is already on this form."));

        var tabs = doc.Descendants("tab").ToList();
        if (!string.IsNullOrWhiteSpace(tab))
        {
            tabs = tabs.Where(t => Matches(t, tab!)).ToList();
            if (tabs.Count == 0)
                return AgentResult<string>.Fail(AgentFaults.InvalidRequest($"Tab '{tab}' was not found on this form."));
        }

        var sections = tabs.SelectMany(t => t.Descendants("section")).ToList();
        XElement? target;
        if (!string.IsNullOrWhiteSpace(section))
        {
            target = sections.FirstOrDefault(s => Matches(s, section!));
            if (target is null)
                return AgentResult<string>.Fail(AgentFaults.InvalidRequest($"Section '{section}' was not found{(string.IsNullOrWhiteSpace(tab) ? "" : $" in tab '{tab}'")}."));
        }
        else
        {
            target = sections.FirstOrDefault();
            if (target is null)
                return AgentResult<string>.Fail(AgentFaults.InvalidRequest("This form has no section to add the column to."));
        }

        var rows = target.Element("rows");
        if (rows is null)
            return AgentResult<string>.Fail(AgentFaults.InvalidRequest("The target section has no rows element."));

        var row =
            $"<row><cell id=\"{{{cellId.ToString().ToUpperInvariant()}}}\"><labels><label description=\"{SecurityElement.Escape(displayName)}\" languagecode=\"{languageCode}\"/></labels>" +
            $"<control id=\"{SecurityElement.Escape(column)}\" classid=\"{classId}\" datafieldname=\"{SecurityElement.Escape(column)}\"/></cell></row>";
        return AgentResult<string>.Ok(AgentXmlSplice.AppendChild(formXml, rows, row));
    }

    /// <summary>
    /// Removes every control bound to the column, in the tabs, the header and the footer. A cell that was the only
    /// one in its row takes the row with it; a cell that shared its row leaves the row and the other cells. Control
    /// descriptions that point at a removed control go too. Everything else stays byte for byte.
    /// </summary>
    public static AgentResult<FormColumnRemoval> RemoveColumn(string formXml, string column)
    {
        var doc = AgentXmlSplice.Parse(formXml);
        var controls = doc.Descendants("control")
            .Where(control => string.Equals((string?)control.Attribute("datafieldname"), column, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (controls.Count == 0)
            return AgentResult<FormColumnRemoval>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is not on this form."));

        var targets = new List<XElement>();
        var places = new List<string>();
        foreach (var control in controls)
        {
            var cell = control.Ancestors("cell").FirstOrDefault();
            if (cell is null)
                return AgentResult<FormColumnRemoval>.Fail(AgentFaults.InvalidRequest($"Column '{column}' is in a part of the form this tool cannot edit."));
            var row = cell.Parent;
            targets.Add(row is not null && row.Name.LocalName == "row" && row.Elements("cell").Count() == 1 ? row : cell);
            places.Add(PlaceOf(cell));

            var uniqueId = (string?)control.Attribute("uniqueid");
            if (!string.IsNullOrEmpty(uniqueId))
            {
                targets.AddRange(doc.Descendants("controlDescription").Where(description =>
                    string.Equals((string?)description.Attribute("forControl"), uniqueId, StringComparison.OrdinalIgnoreCase)));
            }
        }

        // Cut from the end so earlier offsets stay valid; skip anything inside a range already cut.
        var ranges = targets.Distinct()
            .Select(element => AgentXmlSplice.RemovalRange(formXml, element))
            .OrderByDescending(range => range.Start)
            .ToList();
        var edited = formXml;
        var floor = int.MaxValue;
        foreach (var (start, end) in ranges)
        {
            if (end > floor) continue;
            edited = edited.Remove(start, end - start);
            floor = start;
        }

        return AgentResult<FormColumnRemoval>.Ok(new FormColumnRemoval(edited, places.Distinct().ToList()));
    }

    private static string PlaceOf(XElement cell)
    {
        if (cell.Ancestors("header").Any()) return "header";
        if (cell.Ancestors("footer").Any()) return "footer";
        var tab = cell.Ancestors("tab").FirstOrDefault();
        var section = cell.Ancestors("section").FirstOrDefault();
        return string.Join(" / ", new[] { tab, section }.Where(e => e is not null).Select(e => NameOf(e!)));
    }

    private static string NameOf(XElement element)
    {
        var label = LabelOf(element);
        return label.Length > 0 ? label : (string?)element.Attribute("name") ?? "";
    }

    private static bool Matches(XElement element, string wanted) =>
        string.Equals((string?)element.Attribute("name"), wanted, StringComparison.OrdinalIgnoreCase)
        || string.Equals(LabelOf(element), wanted, StringComparison.OrdinalIgnoreCase);

    private static string LabelOf(XElement element) =>
        (string?)element.Element("labels")?.Elements("label").FirstOrDefault()?.Attribute("description") ?? "";
}
