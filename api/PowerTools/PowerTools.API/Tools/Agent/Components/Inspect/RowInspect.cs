using System.ComponentModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Inspect;

/// <summary>The body of inspect_ui and inspect_solution.</summary>
public sealed class InspectBody
{
    public string? Kind { get; set; }

    [Description("Describe the one with this name (or id). Without it, list.")]
    public string? Name { get; set; }

    public string? Table { get; set; }

    public string? Filter { get; set; }

    public int? Top { get; set; }

    [Description("layers: the kind of the component.")]
    public ComponentKind? ComponentKind { get; set; }
}

/// <summary>Lists and reads components stored as rows, with plain values an agent can read.</summary>
internal static class RowInspect
{
    public const int DefaultTop = 100;
    public const int MaxTop = 500;

    public static int Top(int? top) => top is null ? DefaultTop : Math.Clamp(top.Value, 1, MaxTop);

    /// <summary>Lists rows whose name contains the filter, at most top of them.</summary>
    public static async Task<InspectListDto> ListAsync(
        IAgentClient client, string kind, string table, string nameColumn, string[] columns,
        Action<QueryExpression>? narrow, string? filter, int? top, CancellationToken ct)
    {
        var limit = Top(top);
        var query = new QueryExpression(table) { NoLock = true, TopCount = limit + 1, ColumnSet = new ColumnSet(columns) };
        narrow?.Invoke(query);
        if (!string.IsNullOrWhiteSpace(filter)) query.Criteria.AddCondition(nameColumn, ConditionOperator.Like, $"%{filter.Trim()}%");
        query.Orders.Add(new OrderExpression(nameColumn, OrderType.Ascending));
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        var items = rows.Take(limit).Select(row => (object)Plain(row, columns)).ToList();
        return new InspectListDto(kind, items.Count, items, rows.Count > limit);
    }

    /// <summary>One row by name or id, with the columns asked for; null when it does not exist.</summary>
    public static async Task<Entity?> FindAsync(
        IAgentClient client, string table, string nameColumn, string name, string[] columns, Action<QueryExpression>? narrow, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet(columns) };
        narrow?.Invoke(query);
        if (Guid.TryParse(name, out var id)) query.Criteria.AddCondition(ComponentKinds.IdColumn(table), ConditionOperator.Equal, id);
        else query.Criteria.AddCondition(nameColumn, ConditionOperator.Equal, name.Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count > 1) throw new AgentProblemException(AgentFaults.InvalidRequest($"More than one {table} is named '{name}'. Give its id."));
        return rows.FirstOrDefault();
    }

    public static AgentProblemException NotFound(string what) => new(AgentFaults.NotFound($"{what} was not found."));

    /// <summary>The row's values as plain JSON: a lookup becomes its name (or id), a choice its number.</summary>
    public static Dictionary<string, object?> Plain(Entity row, IEnumerable<string>? columns = null)
    {
        var values = new Dictionary<string, object?> { ["id"] = row.Id.ToString("D") };
        foreach (var column in columns ?? row.Attributes.Keys)
        {
            if (!row.Contains(column)) continue;
            values[column] = Value(row[column]);
        }

        return values;
    }

    public static object? Value(object? value) => value switch
    {
        null => null,
        EntityReference reference => reference.Name ?? reference.Id.ToString("D"),
        OptionSetValue option => option.Value,
        Money money => money.Value,
        BooleanManagedProperty managed => managed.Value,
        AliasedValue aliased => Value(aliased.Value),
        Guid guid => guid.ToString("D"),
        DateTime date => date.ToUniversalTime().ToString("O"),
        string or bool or int or long or decimal or double => value,
        _ => value.ToString(),
    };
}
