using System.Globalization;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Dyno.Api.Tools.Translator;

/// <summary>A tab or section of a form and its labels, read from <c>systemform.formxml</c>.</summary>
public sealed record FormElement(string Property, string Id, string? Name, IReadOnlyDictionary<int, string> Labels);

/// <summary>
/// Form tab and section labels. They live only in <c>formxml</c> as
/// <c>&lt;labels&gt;&lt;label description="…" languagecode="…"/&gt;&lt;/labels&gt;</c>, with no metadata API,
/// so a write reads the unpublished form, changes only those label elements, and updates <c>formxml</c>.
/// </summary>
public static class TranslatorForms
{
    public const string EntityName = "systemform";

    /// <summary>Main, Quick View, Quick Create, Card, and Main - Interactive experience.</summary>
    public static readonly int[] FormTypes = [2, 6, 7, 11, 12];

    /// <summary>Active forms of the tables, with their XML.</summary>
    public static QueryExpression Query(IReadOnlyCollection<string> tables)
    {
        var query = new QueryExpression(EntityName)
        {
            ColumnSet = new ColumnSet("formid", "name", "objecttypecode", "type", "formxml", "iscustomizable"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("objecttypecode", ConditionOperator.In, tables.Cast<object>().ToArray());
        query.Criteria.AddCondition("type", ConditionOperator.In, FormTypes.Cast<object>().ToArray());
        query.Criteria.AddCondition("formactivationstate", ConditionOperator.Equal, 1);
        query.AddOrder("formid", OrderType.Ascending);
        return query;
    }

    public static string FormType(int? type) =>
        type switch
        {
            2 => "Main",
            6 => "Quick View",
            7 => "Quick Create",
            11 => "Card",
            12 => "Main (interactive)",
            null => "Form",
            _ => $"Form type {type}",
        };

    /// <summary>Tabs, each followed by its sections, in document order. Elements without an id are left out.</summary>
    public static IReadOnlyList<FormElement> Elements(string? formXml)
    {
        if (string.IsNullOrWhiteSpace(formXml)) return [];
        var document = XDocument.Parse(formXml);
        var elements = new List<FormElement>();
        foreach (var tab in document.Descendants("tab"))
        {
            if (Element(tab, LabelProperties.TabLabel) is { } tabElement) elements.Add(tabElement);
            foreach (var section in tab.Descendants("section"))
            {
                if (Element(section, LabelProperties.SectionLabel) is { } sectionElement) elements.Add(sectionElement);
            }
        }

        return elements;
    }

    private static FormElement? Element(XElement element, string property)
    {
        var id = (string?)element.Attribute("id");
        if (string.IsNullOrWhiteSpace(id)) return null;
        var labels = new Dictionary<int, string>();
        foreach (var label in element.Element("labels")?.Elements("label") ?? [])
        {
            if (int.TryParse((string?)label.Attribute("languagecode"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var lcid) &&
                (string?)label.Attribute("description") is { } text)
            {
                labels[lcid] = text;
            }
        }

        return new FormElement(property, id, (string?)element.Attribute("name"), labels);
    }

    /// <summary>Ids compare without braces and case.</summary>
    public static string NormalizeId(string? id) => (id ?? "").Trim().Trim('{', '}').ToLowerInvariant();

    public static IEnumerable<LabelRowDto> Rows(
        Entity form,
        string table,
        IReadOnlyCollection<int> lcids,
        int baseLcid)
    {
        IReadOnlyList<FormElement> elements;
        try
        {
            elements = Elements(form.GetAttributeValue<string>("formxml"));
        }
        catch (System.Xml.XmlException)
        {
            yield break;
        }

        var formName = form.GetAttributeValue<string>("name") ?? form.Id.ToString();
        var detail = $"{formName} ({FormType(form.GetAttributeValue<OptionSetValue>("type")?.Value)})";
        var customizable = form.GetAttributeValue<BooleanManagedProperty>("iscustomizable");
        var reason = customizable?.Value == false ? "This form is not customizable." : null;
        var position = 0;
        foreach (var element in elements)
        {
            var labels = element.Labels
                .Where(pair => lcids.Contains(pair.Key))
                .ToDictionary(pair => pair.Key, pair => pair.Value);
            yield return new LabelRowDto
            {
                Key = new LabelKeyDto
                {
                    Kind = LabelKinds.Form,
                    Table = table,
                    RecordId = form.Id,
                    Element = NormalizeId(element.Id),
                    Property = element.Property,
                },
                Component = element.Labels.TryGetValue(baseLcid, out var text) && !string.IsNullOrWhiteSpace(text)
                    ? text
                    : element.Name ?? element.Id,
                ComponentName = element.Name,
                Detail = detail,
                Position = position++,
                ReadOnlyReason = reason,
                Labels = labels,
            };
        }
    }

    /// <summary>
    /// Sets the changed languages on the matching tabs and sections and keeps every other label and attribute.
    /// Returns the new XML and the rows whose element was not found.
    /// </summary>
    public static (string Xml, IReadOnlyList<ApplyRowDto> Missing) Merge(string formXml, IReadOnlyList<ApplyRowDto> rows)
    {
        var document = XDocument.Parse(formXml, LoadOptions.PreserveWhitespace);
        var byId = new Dictionary<(string Name, string Id), XElement>();
        foreach (var element in document.Descendants().Where(item => item.Name.LocalName is "tab" or "section"))
        {
            var id = NormalizeId((string?)element.Attribute("id"));
            if (id.Length > 0) byId.TryAdd((element.Name.LocalName, id), element);
        }

        var missing = new List<ApplyRowDto>();
        foreach (var row in rows)
        {
            var name = row.Key.Property == LabelProperties.TabLabel ? "tab" : "section";
            if (!byId.TryGetValue((name, NormalizeId(row.Key.Element)), out var element))
            {
                missing.Add(row);
                continue;
            }

            var labels = element.Element("labels");
            if (labels is null)
            {
                labels = new XElement("labels");
                element.AddFirst(labels);
            }

            foreach (var (lcid, value) in row.Labels)
            {
                var code = lcid.ToString(CultureInfo.InvariantCulture);
                var label = labels.Elements("label").FirstOrDefault(item => (string?)item.Attribute("languagecode") == code);
                if (label is null)
                    labels.Add(new XElement("label", new XAttribute("description", value), new XAttribute("languagecode", code)));
                else
                    label.SetAttributeValue("description", value);
            }
        }

        return (document.Root!.ToString(SaveOptions.DisableFormatting), missing);
    }
}
