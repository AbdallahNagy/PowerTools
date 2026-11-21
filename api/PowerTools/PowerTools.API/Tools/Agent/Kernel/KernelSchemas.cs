using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>
/// The JSON schemas the desktop MCP server uses, generated from the C# types so the two sides cannot drift. The
/// checked-in copies live in desktop/src/electron/mcp/schemas/; a test fails when they differ from these types.
/// Each apply family adds its spec as "<tool>.input".
/// </summary>
public static class KernelSchemas
{
    public static IReadOnlyDictionary<string, Type> Types { get; } = new SortedDictionary<string, Type>(StringComparer.Ordinal)
    {
        ["apply-result"] = typeof(ApplyResult),
        ["plan-preview"] = typeof(PlanPreview),
        ["table_apply.input"] = typeof(Components.Tables.TableApplySpec),
        ["solution_import.input"] = typeof(Components.Solutions.SolutionImportSpec),
        ["records_write.input"] = typeof(Components.Records.RecordsWriteSpec),
        ["records_delete.input"] = typeof(Components.Records.RecordsDeleteSpec),
        ["choice_apply.input"] = typeof(Components.Choices.ChoiceApplySpec),
        ["view_apply.input"] = typeof(Components.Views.ViewApplySpec),
        ["form_apply.input"] = typeof(Components.Forms.FormApplySpec),
        ["solution_apply.input"] = typeof(Components.Solutions.SolutionApplySpec),
        ["config_apply.input"] = typeof(Components.Config.ConfigApplySpec),
        ["plugin_deploy.input"] = typeof(Components.Plugins.PluginDeploySpec),
        ["plugin_step_apply.input"] = typeof(Components.Plugins.PluginStepApplySpec),
        ["remove.input"] = typeof(Components.Remove.RemoveSpec),
        ["webresource_apply.input"] = typeof(Components.WebResources.WebResourceApplySpec),
        ["customapi_apply.input"] = typeof(Components.CustomApis.CustomApiApplySpec),
        ["role_apply.input"] = typeof(Components.Security.RoleApplySpec),
        ["app_apply.input"] = typeof(Components.Apps.AppApplySpec),
    };

    /// <summary>Input schemas end in ".input"; they leave out null, since an agent leaves a property out instead.</summary>
    public static string Export(string name) => Export(Types[name], name.EndsWith(".input", StringComparison.Ordinal));

    public static string Export(Type type, bool input = false)
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
            TransformSchemaNode = (context, node) =>
            {
                if (node is not JsonObject obj) return node;

                // A closed shape: agents and the desktop see exactly the documented properties.
                if (obj["properties"] is not null && !obj.ContainsKey("additionalProperties"))
                    obj["additionalProperties"] = false;

                // [Description] on a property, or else on its type, tells the agent what the value means.
                var provider = context.PropertyInfo?.AttributeProvider;
                var description = Describe(provider) ?? Describe(context.TypeInfo.Type);
                if (description is not null && !obj.ContainsKey("description")) obj.Insert(0, "description", description);

                if (input) DropNull(obj);
                return node;
            },
        };
        var schema = options.GetJsonSchemaAsNode(type, exporter);
        return schema.ToJsonString(new JsonSerializerOptions { WriteIndented = true }).ReplaceLineEndings("\n") + "\n";
    }

    private static string? Describe(System.Reflection.ICustomAttributeProvider? provider) =>
        provider?.GetCustomAttributes(typeof(DescriptionAttribute), true).OfType<DescriptionAttribute>().FirstOrDefault()?.Description;

    /// <summary>["string", "null"] becomes "string", and an enum loses its null.</summary>
    private static void DropNull(JsonObject obj)
    {
        if (obj["type"] is JsonArray types)
        {
            var kept = types.Where(t => t?.GetValue<string>() != "null").Select(t => t!.GetValue<string>()).ToList();
            obj["type"] = kept.Count == 1 ? JsonValue.Create(kept[0]) : new JsonArray(kept.Select(k => (JsonNode)JsonValue.Create(k)!).ToArray());
        }

        if (obj["enum"] is JsonArray values && values.Any(v => v is null))
            obj["enum"] = new JsonArray(values.Where(v => v is not null).Select(v => v!.DeepClone()).ToArray());
    }
}
