using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.Agent.Components.Plugins;

[JsonConverter(typeof(JsonStringEnumConverter<StepStage>))]
public enum StepStage
{
    [JsonStringEnumMemberName("preValidation")] PreValidation,
    [JsonStringEnumMemberName("preOperation")] PreOperation,
    [JsonStringEnumMemberName("postOperation")] PostOperation,
}

[JsonConverter(typeof(JsonStringEnumConverter<StepMode>))]
public enum StepMode
{
    [JsonStringEnumMemberName("sync")] Sync,
    [JsonStringEnumMemberName("async")] Async,
}

[JsonConverter(typeof(JsonStringEnumConverter<ImageType>))]
public enum ImageType
{
    [JsonStringEnumMemberName("pre")] Pre,
    [JsonStringEnumMemberName("post")] Post,
    [JsonStringEnumMemberName("both")] Both,
}

[Description("Plug-in steps with their images and state. A step is matched by name; steps left out are kept.")]
public sealed class PluginStepApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution new steps go into.")]
    public required string Solution { get; init; }

    public required List<StepDefinition> Steps { get; init; }
}

public sealed class StepDefinition
{
    [Description("The step's name; finds it.")]
    public required string Name { get; init; }

    [Description("Full type name of the plug-in, for example Contoso.Plugins.SetCode. Or give serviceEndpoint.")]
    public string? PluginType { get; init; }

    [Description("Name of a webhook or Service Bus endpoint, instead of pluginType.")]
    public string? ServiceEndpoint { get; init; }

    [Description("Message name, for example Create, Update, Delete.")]
    public required string Message { get; init; }

    [Description("Table logical name. Leave out for a message without a table.")]
    public string? Table { get; init; }

    public required StepStage Stage { get; init; }

    [Description("Default sync. async runs only in postOperation.")]
    public StepMode? Mode { get; init; }

    [Description("Order among steps of the same stage. Default 1.")]
    public int? Rank { get; init; }

    [Description("Update only: the columns whose change runs the step.")]
    public List<string>? FilteringAttributes { get; init; }

    [Description("Unsecure configuration passed to the plug-in.")]
    public string? Configuration { get; init; }

    public string? Description { get; init; }

    [Description("async only: delete the system job when it succeeds.")]
    public bool? AsyncAutoDelete { get; init; }

    [Description("Default true.")]
    public bool? Enabled { get; init; }

    [Description("Images, matched by name.")]
    public List<ImageDefinition>? Images { get; init; }
}

public sealed class ImageDefinition
{
    public required string Name { get; init; }

    [Description("The alias the plug-in reads the image by. Default: name.")]
    public string? Alias { get; init; }

    public required ImageType Type { get; init; }

    [Description("Columns in the image. Leave out for all columns.")]
    public List<string>? Attributes { get; init; }
}

/// <summary>
/// Plans plugin_step_apply: each step (created or updated by name), then its images, then its enabled state. A step
/// created in the same plan is found by name when its images run.
/// </summary>
public sealed class PluginStepPlanner : IComponentPlanner<PluginStepApplySpec>
{
    public const string Family = "plugin_step";

    public async Task<Plan> PlanAsync(PluginStepApplySpec spec, PlanContext context, CancellationToken ct)
    {
        if (spec.Steps is not { Count: > 0 }) throw Invalid("steps must list at least one step.");
        await context.SolutionAsync(spec.Solution, ct);
        var client = context.Client;
        var steps = new List<PlanStep>();
        var locks = new List<string>();
        if (spec.Steps.GroupBy(s => s.Name.Trim(), StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1) is { } twice)
            throw Invalid($"Step '{twice.Key}' is listed twice.");

        foreach (var definition in spec.Steps)
        {
            var name = definition.Name.Trim();
            locks.Add($"pluginstep:{name.ToLowerInvariant()}");
            var mode = definition.Mode ?? StepMode.Sync;
            if (mode == StepMode.Async && definition.Stage != StepStage.PostOperation) throw Invalid($"Step {name}: async steps run only in postOperation.");
            if ((definition.PluginType is null) == (definition.ServiceEndpoint is null)) throw Invalid($"Step {name}: give pluginType or serviceEndpoint.");

            var handler = definition.PluginType is { } typeName
                ? await RowAsync(client, "plugintype", "typename", typeName, ct) ?? throw Invalid($"Step {name}: plug-in type {typeName} is not registered. Deploy its assembly with plugin_deploy.")
                : await RowAsync(client, "serviceendpoint", "name", definition.ServiceEndpoint!, ct) ?? throw Invalid($"Step {name}: endpoint {definition.ServiceEndpoint} was not found.");
            var message = await RowAsync(client, "sdkmessage", "name", definition.Message, ct) ?? throw Invalid($"Step {name}: message {definition.Message} does not exist.");
            Entity? filter = null;
            if (definition.Table is { } table)
            {
                var query = new QueryExpression("sdkmessagefilter") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("primaryobjecttypecode") };
                query.Criteria.AddCondition("sdkmessageid", ConditionOperator.Equal, message.Id);
                query.Criteria.AddCondition("primaryobjecttypecode", ConditionOperator.Equal, table.Trim().ToLowerInvariant());
                filter = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault()
                    ?? throw Invalid($"Step {name}: message {definition.Message} does not run on table {table}.");
            }

            if (definition.FilteringAttributes is { Count: > 0 } && !StepDraftValidator.FilteringAttributeMessages.Contains(definition.Message))
                throw Invalid($"Step {name}: filteringAttributes apply only to {string.Join(", ", StepDraftValidator.FilteringAttributeMessages)}.");

            var wanted = new Entity("sdkmessageprocessingstep")
            {
                ["name"] = name,
                ["eventhandler"] = handler.ToEntityReference(),
                ["sdkmessageid"] = message.ToEntityReference(),
                ["sdkmessagefilterid"] = filter?.ToEntityReference(),
                ["stage"] = new OptionSetValue(Stage(definition.Stage)),
                ["mode"] = new OptionSetValue(mode == StepMode.Async ? RegistrationOptionValues.ModeAsynchronous : RegistrationOptionValues.ModeSynchronous),
                ["rank"] = definition.Rank ?? 1,
                ["supporteddeployment"] = new OptionSetValue(RegistrationOptionValues.DeploymentServer),
                ["filteringattributes"] = definition.FilteringAttributes is { Count: > 0 } f ? string.Join(",", f.Select(a => a.Trim().ToLowerInvariant()).Order()) : null,
                ["configuration"] = definition.Configuration,
                ["description"] = definition.Description,
                ["asyncautodelete"] = mode == StepMode.Async && definition.AsyncAutoDelete == true,
            };

            var existing = await RowAsync(client, "sdkmessageprocessingstep", "name", name, ct);
            if (existing is null)
            {
                steps.Add(new PlanStep
                {
                    Op = "createStep",
                    Target = name,
                    Detail = Describe(wanted, definition),
                    Action = async (step, token) =>
                    {
                        var id = await step.Client.CreateAsync(wanted, token);
                        step.Ids.Add(id.ToString("D"));
                        await PluginDeployPlanner.AddToSolutionAsync(step, id, ComponentKinds.StepType, token);
                    },
                });
            }
            else
            {
                if (existing.GetAttributeValue<bool?>("ismanaged") == true && existing.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
                {
                    steps.Add(PlanStep.Blocked("updateStep", name, $"Step {name} is managed and not customizable."));
                    continue;
                }

                var changes = Changes(existing, wanted);
                if (changes.Count > 0)
                {
                    var update = new Entity("sdkmessageprocessingstep", existing.Id);
                    foreach (var column in changes) update[column] = wanted[column];
                    steps.Add(new PlanStep
                    {
                        Op = "updateStep",
                        Target = name,
                        Detail = string.Join("; ", changes.Select(c => $"{c} → {Show(wanted[c])}")),
                        Request = new UpdateRequest { Target = update },
                    });
                }
            }

            foreach (var image in definition.Images ?? [])
                await ImageAsync(client, name, existing?.Id, definition.Message, image, steps, ct);

            var enabled = definition.Enabled ?? true;
            var isEnabled = existing is null || existing.GetAttributeValue<OptionSetValue>("statecode")?.Value != RegistrationOptionValues.StateDisabled;
            if (enabled != isEnabled)
            {
                steps.Add(new PlanStep
                {
                    Op = enabled ? "enableStep" : "disableStep",
                    Target = name,
                    SolutionAware = false,
                    Action = async (step, token) =>
                    {
                        var row = await RowAsync(step.Client, "sdkmessageprocessingstep", "name", name, token) ?? throw Invalid($"Step {name} was not found.");
                        await step.Client.UpdateAsync(new Entity("sdkmessageprocessingstep", row.Id)
                        {
                            ["statecode"] = new OptionSetValue(enabled ? RegistrationOptionValues.StateEnabled : RegistrationOptionValues.StateDisabled),
                            ["statuscode"] = new OptionSetValue(enabled ? RegistrationOptionValues.StatusEnabled : RegistrationOptionValues.StatusDisabled),
                        }, token);
                    },
                });
            }
        }

        return new Plan(steps, lockKeys: locks);
    }

    private static async Task ImageAsync(IAgentClient client, string stepName, Guid? stepId, string message, ImageDefinition image, List<PlanStep> steps, CancellationToken ct)
    {
        if (!ImageMessageProperties.TryGet(message, out var property))
            throw Invalid($"Step {stepName}: message {message} does not take images.");
        var alias = image.Alias ?? image.Name;
        var attributes = image.Attributes is { Count: > 0 } a ? string.Join(",", a.Select(x => x.Trim().ToLowerInvariant()).Order()) : "";
        var type = image.Type switch { ImageType.Pre => RegistrationOptionValues.ImagePre, ImageType.Post => RegistrationOptionValues.ImagePost, _ => RegistrationOptionValues.ImageBoth };
        var target = $"{stepName}/{image.Name}";
        Entity? existing = null;
        if (stepId is { } id)
        {
            var query = new QueryExpression("sdkmessageprocessingstepimage") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("name", "entityalias", "imagetype", "attributes") };
            query.Criteria.AddCondition("sdkmessageprocessingstepid", ConditionOperator.Equal, id);
            query.Criteria.AddCondition("name", ConditionOperator.Equal, image.Name);
            existing = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        }

        var detail = $"{image.Type.ToString().ToLowerInvariant()}; alias {alias}; columns {(attributes.Length == 0 ? "all" : attributes)}";
        if (existing is null)
        {
            steps.Add(new PlanStep
            {
                Op = "createImage",
                Target = target,
                Detail = detail,
                SolutionAware = false,
                Action = async (step, token) =>
                {
                    var parent = await RowAsync(step.Client, "sdkmessageprocessingstep", "name", stepName, token) ?? throw Invalid($"Step {stepName} was not found.");
                    var created = await step.Client.CreateAsync(new Entity("sdkmessageprocessingstepimage")
                    {
                        ["name"] = image.Name,
                        ["entityalias"] = alias,
                        ["imagetype"] = new OptionSetValue(type),
                        ["attributes"] = attributes,
                        ["messagepropertyname"] = property,
                        ["sdkmessageprocessingstepid"] = parent.ToEntityReference(),
                    }, token);
                    step.Ids.Add(created.ToString("D"));
                },
            });
            return;
        }

        var same = existing.GetAttributeValue<string>("entityalias") == alias
            && existing.GetAttributeValue<OptionSetValue>("imagetype")?.Value == type
            && string.Join(",", (existing.GetAttributeValue<string>("attributes") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(x => x.ToLowerInvariant()).Order()) == attributes;
        if (same) return;
        steps.Add(new PlanStep
        {
            Op = "updateImage",
            Target = target,
            Detail = detail,
            SolutionAware = false,
            Request = new UpdateRequest
            {
                Target = new Entity("sdkmessageprocessingstepimage", existing.Id)
                {
                    ["entityalias"] = alias,
                    ["imagetype"] = new OptionSetValue(type),
                    ["attributes"] = attributes,
                },
            },
        });
    }

    private static readonly string[] Compared =
        ["eventhandler", "sdkmessageid", "sdkmessagefilterid", "stage", "mode", "rank", "filteringattributes", "configuration", "description", "asyncautodelete"];

    private static List<string> Changes(Entity existing, Entity wanted) =>
        Compared.Where(column => !Same(existing.GetAttributeValue<object>(column), wanted[column], column)).ToList();

    private static bool Same(object? current, object? wanted, string column) => (current, wanted) switch
    {
        (EntityReference a, EntityReference b) => a.Id == b.Id,
        (null, EntityReference) or (EntityReference, null) => false,
        (OptionSetValue a, OptionSetValue b) => a.Value == b.Value,
        _ when column == "filteringattributes" => Normalize(current as string) == Normalize(wanted as string),
        _ when current is null or "" && wanted is null or "" => true,
        _ when column == "asyncautodelete" => (current as bool? ?? false) == (wanted as bool? ?? false),
        _ => Equals(current, wanted),
    };

    private static string Normalize(string? columns) =>
        string.Join(",", (columns ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(c => c.ToLowerInvariant()).Order());

    private static string Describe(Entity wanted, StepDefinition definition) =>
        $"{definition.Message}{(definition.Table is null ? "" : $" of {definition.Table}")}; {definition.Stage}; {(definition.Mode ?? StepMode.Sync).ToString().ToLowerInvariant()}; rank {wanted["rank"]}"
        + $"; handler {definition.PluginType ?? definition.ServiceEndpoint}"
        + (wanted["filteringattributes"] is string f ? $"; filtering {f}" : "")
        + (definition.Configuration is null ? "" : $"; configuration {definition.Configuration}");

    private static string Show(object? value) => value switch
    {
        EntityReference r => r.Name ?? r.Id.ToString("D"),
        OptionSetValue o => o.Value.ToString(),
        null => "none",
        _ => value.ToString() ?? "",
    };

    private static int Stage(StepStage stage) => stage switch
    {
        StepStage.PreValidation => RegistrationOptionValues.StagePreValidation,
        StepStage.PreOperation => RegistrationOptionValues.StagePreOperation,
        _ => RegistrationOptionValues.StagePostOperation,
    };

    private static async Task<Entity?> RowAsync(IAgentClient client, string table, string column, string value, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition(column, ConditionOperator.Equal, value.Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count > 1) throw Invalid($"More than one {table} is named {value}.");
        return rows.FirstOrDefault();
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
