using System.Xml.Linq;

namespace PowerTools.API.Tools.WorkflowActivities;

public static class WorkflowActivityArguments
{
    public static (IReadOnlyList<ArgumentNameDto> Inputs, IReadOnlyList<ArgumentNameDto> Outputs) Read(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return ([], []);

        try
        {
            var document = XDocument.Parse(xml);
            return (NamesUnder(document, "Inputs"), NamesUnder(document, "Outputs"));
        }
        catch (Exception)
        {
            return ([], []);
        }
    }

    private static IReadOnlyList<ArgumentNameDto> NamesUnder(XDocument document, string parentName)
    {
        var names = new List<ArgumentNameDto>();
        foreach (var parent in document.Descendants())
        {
            if (!string.Equals(parent.Name.LocalName, parentName, StringComparison.Ordinal))
                continue;

            foreach (var name in parent.Descendants())
            {
                if (!string.Equals(name.Name.LocalName, "Name", StringComparison.Ordinal))
                    continue;

                var value = name.Value.Trim();
                if (value.Length > 0)
                    names.Add(new ArgumentNameDto(value));
            }
        }

        return names;
    }
}
