using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// The JSON schemas the desktop MCP server uses, generated from the C# types so the two sides cannot drift. The
/// checked-in copies live in desktop/src/electron/mcp/schemas/; a test fails when they differ from these types.
/// Phase 1 adds one entry per apply family spec (for example "table_apply.input").
/// </summary>
public static class KernelSchemas
{
    public static IReadOnlyDictionary<string, Type> Types { get; } = new SortedDictionary<string, Type>(StringComparer.Ordinal)
    {
        ["apply-result"] = typeof(ApplyResult),
        ["plan-preview"] = typeof(PlanPreview),
    };

    public static string Export(Type type)
    {
        var options = new JsonSerializerOptions(JsonSerializerOptions.Web)
        {
            RespectNullableAnnotations = true,
            // The schemas describe what the sidecar writes: numbers as numbers.
            NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict,
        };
        var exporter = new JsonSchemaExporterOptions
        {
            TreatNullObliviousAsNonNullable = true,
            TransformSchemaNode = (_, node) =>
            {
                // A closed shape: agents and the desktop see exactly the documented properties.
                if (node is JsonObject obj && obj["properties"] is not null && !obj.ContainsKey("additionalProperties"))
                    obj["additionalProperties"] = false;
                return node;
            },
        };
        var schema = options.GetJsonSchemaAsNode(type, exporter);
        return schema.ToJsonString(new JsonSerializerOptions { WriteIndented = true }).ReplaceLineEndings("\n") + "\n";
    }
}
