using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.WorkflowActivities;

public static class WorkflowActivitiesMapper
{
    public static IReadOnlyList<AssemblyGroupDto> Assemblies(IReadOnlyList<Entity> rows)
    {
        return rows
            .GroupBy(row => LookupId(row, "pluginassemblyid"))
            .Select(group => new AssemblyGroupDto(
                group.Key,
                group.Select(row => Text(row, "assemblyname")).FirstOrDefault(name => name.Length > 0) ?? "",
                group.Select(Activity).ToList()))
            .OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(group => group.AssemblyId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static ActivityDto Activity(Entity entity)
    {
        var xml = entity.Contains("customworkflowactivityinfo") && entity["customworkflowactivityinfo"] is string text
            ? text
            : null;
        var arguments = WorkflowActivityArguments.Read(xml);
        return new ActivityDto(
            EntityId(entity, "plugintypeid"),
            Text(entity, "name"),
            Text(entity, "typename"),
            Text(entity, "version"),
            Timestamp(entity, "createdon"),
            LookupName(entity, "createdby"),
            Timestamp(entity, "modifiedon"),
            LookupName(entity, "modifiedby"),
            arguments.Inputs,
            arguments.Outputs);
    }

    public static ProcessDto Process(Entity entity)
    {
        return new ProcessDto(
            EntityId(entity, "workflowid"),
            Text(entity, "name"),
            Option(entity, "category"),
            CategoryLabel(entity),
            Text(entity, "primaryentity"),
            Timestamp(entity, "createdon"),
            Timestamp(entity, "modifiedon"),
            Flag(entity, "ondemand"),
            Flag(entity, "triggeroncreate"),
            Flag(entity, "triggerondelete"),
            UpdateAttributes(entity));
    }

    private static string CategoryLabel(Entity entity)
    {
        foreach (var key in new[] { "category", "workflow_category" })
        {
            if (!entity.FormattedValues.Contains(key))
                continue;

            var label = entity.FormattedValues[key];
            if (!string.IsNullOrWhiteSpace(label))
                return label;
        }

        return "";
    }

    private static IReadOnlyList<string> UpdateAttributes(Entity entity)
    {
        var raw = Text(entity, "triggeronupdateattributelist");
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static string Text(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute) || entity[attribute] is not string value)
            return "";

        return value;
    }

    private static bool Flag(Entity entity, string attribute) =>
        entity.Contains(attribute) && entity[attribute] is true;

    private static int? Option(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute) || entity[attribute] is null)
            return null;

        return entity[attribute] switch
        {
            OptionSetValue option => option.Value,
            int number => number,
            _ => null,
        };
    }

    private static string LookupName(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute) || entity[attribute] is not EntityReference reference)
            return "";

        return reference.Name ?? "";
    }

    private static string LookupId(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute) || entity[attribute] is null)
            return "";

        return entity[attribute] switch
        {
            EntityReference reference when reference.Id != Guid.Empty => reference.Id.ToString("D"),
            Guid guid when guid != Guid.Empty => guid.ToString("D"),
            _ => "",
        };
    }

    private static string EntityId(Entity entity, string attribute)
    {
        if (entity.Id != Guid.Empty)
            return entity.Id.ToString("D");

        if (entity.Contains(attribute) && entity[attribute] is Guid guid && guid != Guid.Empty)
            return guid.ToString("D");

        return "";
    }

    private static string? Timestamp(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute) || entity[attribute] is not DateTime value)
            return null;

        var utc = value.Kind switch
        {
            DateTimeKind.Local => value.ToUniversalTime(),
            DateTimeKind.Utc => value,
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
        return utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
}
