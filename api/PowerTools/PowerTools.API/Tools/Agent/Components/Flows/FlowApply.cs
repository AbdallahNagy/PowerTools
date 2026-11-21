using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Config;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Components.WebResources;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Flows;

[JsonConverter(typeof(JsonStringEnumConverter<FlowState>))]
public enum FlowState
{
    [JsonStringEnumMemberName("on")] On,
    [JsonStringEnumMemberName("off")] Off,
}

[Description("A solution-aware cloud flow (online only). Leave a property out to keep it. See the guide powertools://guides/cloud-flows.")]
public sealed class FlowApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the flow and its connection references go into.")]
    public required string Solution { get; init; }

    [Description("The flow's name; an existing cloud flow matches by name.")]
    public required string Name { get; init; }

    public string? Description { get; init; }

    [Description("The connections the definition uses, by the connectionName its actions give in host.connectionName. A missing reference is created.")]
    public Dictionary<string, FlowConnectionReference>? ConnectionReferences { get; init; }

    [Description("The Logic Apps workflow definition: triggers and actions. Needed for a new flow.")]
    public JsonElement? Definition { get; init; }

    [Description("on turns the flow on; it stays off while a connection reference has no connection. Default: a new flow is off, an existing one keeps its state.")]
    public FlowState? State { get; init; }
}

public sealed class FlowConnectionReference
{
    [Description("Logical name of the connection reference, with the publisher prefix.")]
    public required string LogicalName { get; init; }

    [Description("The connector, for example shared_commondataserviceforapps.")]
    public required string Connector { get; init; }

    [Description("For a new reference. Default: the logical name.")]
    public string? DisplayName { get; init; }
}

/// <summary>
/// Plans flow_apply: creates the connection references a flow needs, writes its clientdata (definition plus
/// connection references) and turns it on or off. Cloud flows exist only where Power Automate does, which
/// <see cref="Capabilities"/> tells by the connectionreference table; elsewhere the plan is unsupported.
/// </summary>
public sealed class FlowPlanner : IComponentPlanner<FlowApplySpec>
{
    public const string Family = "flow";

    public const string SchemaUri = "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#";

    private const string ApiPrefix = "/providers/Microsoft.PowerApps/apis/";

    public async Task<Plan> PlanAsync(FlowApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var name = spec.Name?.Trim() ?? "";
        if (name.Length == 0) throw Invalid("name is required.");
        if (!context.Capabilities.HasTable(ConfigPlanner.ConnectionReferenceTable))
        {
            return new Plan([PlanStep.Unsupported("createFlow", name,
                "This environment has no cloud flows (Power Automate is online only).",
                "Build the logic as a classic workflow (process_apply), or import a solution that has it with solution_import.")]);
        }

        var solution = await context.SolutionAsync(spec.Solution, ct);
        var client = context.Client;
        var references = spec.ConnectionReferences ?? [];
        JsonObject? definition = spec.Definition is { } given ? Normalize(given) : null;
        if (definition is not null) CheckReferences(definition, references);

        var existing = await ComponentKinds.FindAsync(client, ComponentKind.Flow, name, null, ct);
        if (existing is null && definition is null) throw Invalid($"Flow {name} does not exist yet; a new flow needs definition.");
        var steps = new List<PlanStep>();
        var locks = new List<string> { $"flow:{name.ToLowerInvariant()}" };
        var warnings = new List<string>();

        // Connection references first: the flow's clientdata names them.
        var unconnected = new List<(string Reference, string Connector)>();
        foreach (var (key, reference) in references)
        {
            var logical = reference.LogicalName.Trim().ToLowerInvariant();
            var connector = ConfigPlanner.ConnectorId(reference.Connector);
            locks.Add($"connectionreference:{logical}");
            var found = await FindReferenceAsync(client, logical, ct);
            if (found is null)
            {
                if (solution.CheckSchemaName(logical) is { } problem) throw new AgentProblemException(problem);
                steps.Add(new PlanStep
                {
                    Op = "createConnectionReference",
                    Target = logical,
                    Detail = $"{key}: {connector}; no connection yet",
                    Request = new CreateRequest
                    {
                        Target = new Entity(ConfigPlanner.ConnectionReferenceTable)
                        {
                            ["connectionreferencelogicalname"] = logical,
                            ["connectionreferencedisplayname"] = reference.DisplayName ?? logical,
                            ["connectorid"] = connector,
                        },
                    },
                });
                unconnected.Add((logical, ShortName(connector)));
                continue;
            }

            if (!string.Equals(found.GetAttributeValue<string>("connectorid"), connector, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"Connection reference {logical} uses connector {found.GetAttributeValue<string>("connectorid")}, not {connector}. Give another logical name.");
            if (string.IsNullOrWhiteSpace(found.GetAttributeValue<string>("connectionid"))) unconnected.Add((logical, ShortName(connector)));
        }

        var clientData = definition is null ? null : ClientData(definition, references);
        var wantOn = spec.State == FlowState.On;
        var id = existing?.Id ?? Guid.NewGuid();

        if (existing is null)
        {
            var flow = new Entity("workflow", id)
            {
                ["name"] = name,
                ["type"] = new OptionSetValue(1),
                ["category"] = new OptionSetValue(ComponentKinds.FlowCategory),
                ["primaryentity"] = "none",
                ["clientdata"] = clientData!.ToJsonString(),
            };
            if (spec.Description is not null) flow["description"] = spec.Description;
            steps.Add(new PlanStep
            {
                Op = "createFlow",
                Target = name,
                Detail = Describe(definition!, references),
                Request = new CreateRequest { Target = flow },
            });
            if (wantOn) steps.Add(Activate(name, id, unconnected));
            return new Plan(steps, warnings, locks);
        }

        if (!existing.Customizable || existing.Managed)
            return new Plan([PlanStep.Blocked("updateFlow", name, $"Flow {name} is managed; change it in its source environment.")], lockKeys: locks);

        var row = existing.Row!;
        var isOn = row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1;
        var changes = new List<string>();
        var update = new Entity("workflow", id);
        if (clientData is not null && !SameClientData(row.GetAttributeValue<string>("clientdata"), clientData))
        {
            update["clientdata"] = clientData.ToJsonString();
            changes.Add(Describe(definition!, references));
        }

        if (spec.Description is { } description && description != row.GetAttributeValue<string>("description"))
        {
            update["description"] = description;
            changes.Add("description");
        }

        var stateToken = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(row.GetAttributeValue<string>("clientdata") ?? "")));
        if (changes.Count > 0)
        {
            var reactivate = isOn && spec.State != FlowState.Off && unconnected.Count == 0;
            steps.Add(new PlanStep
            {
                Op = "updateFlow",
                Target = name,
                Detail = string.Join("; ", changes) + (isOn ? $"; the flow is turned off while it is saved{(reactivate ? " and on again after" : "")}" : ""),
                Action = async (step, token) =>
                {
                    if (isOn) await SetStateAsync(step.Client, id, on: false, token);
                    await step.Client.UpdateAsync(update, token);
                    await WebResourcePlanner.AddToSolutionAsync(step, id, ComponentKinds.WorkflowType, token);
                    if (reactivate) await SetStateAsync(step.Client, id, on: true, token);
                },
            });
            if (isOn && !reactivate)
            {
                // Saved off: either asked for, or a reference lost its connection and the flow cannot run.
                wantOn |= spec.State != FlowState.Off;
                isOn = false;
            }
        }

        if (wantOn && !isOn) steps.Add(Activate(name, id, unconnected));
        if (spec.State == FlowState.Off && isOn)
        {
            steps.Add(new PlanStep
            {
                Op = "turnOffFlow",
                Target = name,
                SolutionAware = false,
                Action = (step, token) => SetStateAsync(step.Client, id, on: false, token),
            });
        }

        return new Plan(steps, warnings, locks, stateToken);
    }

    private static PlanStep Activate(string name, Guid id, List<(string Reference, string Connector)> unconnected)
    {
        if (unconnected.Count > 0)
        {
            var list = string.Join(", ", unconnected.Select(u => $"{u.Reference} ({u.Connector})"));
            return PlanStep.Blocked("turnOnFlow", name,
                $"These connection references have no connection: {list}. Sign in to each connector in the maker portal (Connections), set the connection on the reference (config_apply connectionId, or the maker portal), then send the same spec again. The flow stays off until then.");
        }

        return new PlanStep
        {
            Op = "turnOnFlow",
            Target = name,
            SolutionAware = false,
            Action = (step, token) => SetStateAsync(step.Client, id, on: true, token),
        };
    }

    private static Task SetStateAsync(IAgentClient client, Guid id, bool on, CancellationToken ct) =>
        client.ExecuteAsync(new SetStateRequest
        {
            EntityMoniker = new EntityReference("workflow", id),
            State = new OptionSetValue(on ? 1 : 0),
            Status = new OptionSetValue(on ? 2 : 1),
        }, ct);

    /// <summary>The definition as an object, with the schema, version and the two parameters every flow has.</summary>
    public static JsonObject Normalize(JsonElement given)
    {
        if (given.ValueKind != JsonValueKind.Object) throw Invalid("definition must be a JSON object with triggers and actions.");
        var definition = JsonNode.Parse(given.GetRawText())!.AsObject();
        if (definition["triggers"] is not JsonObject { Count: > 0 }) throw Invalid("definition needs at least one trigger in triggers.");
        if (definition["actions"] is not JsonObject) throw Invalid("definition needs actions (an object; it may be empty).");
        definition["$schema"] ??= SchemaUri;
        definition["contentVersion"] ??= "1.0.0.0";
        var parameters = definition["parameters"] as JsonObject ?? [];
        definition["parameters"] = parameters;
        parameters["$connections"] ??= new JsonObject { ["defaultValue"] = new JsonObject(), ["type"] = "Object" };
        parameters["$authentication"] ??= new JsonObject { ["defaultValue"] = new JsonObject(), ["type"] = "SecureObject" };
        return definition;
    }

    /// <summary>Every host.connectionName the definition uses needs an entry in connectionReferences.</summary>
    public static void CheckReferences(JsonObject definition, IReadOnlyDictionary<string, FlowConnectionReference> references)
    {
        var used = ConnectionNames(definition).ToHashSet(StringComparer.Ordinal);
        var missing = used.Where(n => !references.ContainsKey(n)).Order(StringComparer.Ordinal).ToList();
        if (missing.Count > 0)
            throw Invalid($"The definition uses connections with no entry in connectionReferences: {string.Join(", ", missing)}. Add each with its logicalName and connector.");
    }

    /// <summary>The connectionName of every host in the definition.</summary>
    public static IEnumerable<string> ConnectionNames(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj["host"] is JsonObject host && host["connectionName"] is JsonValue value && value.TryGetValue<string>(out var name)) yield return name;
                foreach (var (_, child) in obj)
                    foreach (var found in ConnectionNames(child)) yield return found;
                break;
            case JsonArray array:
                foreach (var child in array)
                    foreach (var found in ConnectionNames(child)) yield return found;
                break;
        }
    }

    /// <summary>The clientdata Dataverse keeps for a solution-aware flow.</summary>
    public static JsonObject ClientData(JsonObject definition, IReadOnlyDictionary<string, FlowConnectionReference> references)
    {
        var refs = new JsonObject();
        foreach (var (key, reference) in references.OrderBy(r => r.Key, StringComparer.Ordinal))
        {
            refs[key] = new JsonObject
            {
                ["runtimeSource"] = "embedded",
                ["connection"] = new JsonObject { ["connectionReferenceLogicalName"] = reference.LogicalName.Trim().ToLowerInvariant() },
                ["api"] = new JsonObject { ["name"] = ShortName(ConfigPlanner.ConnectorId(reference.Connector)) },
            };
        }

        return new JsonObject
        {
            ["properties"] = new JsonObject { ["connectionReferences"] = refs, ["definition"] = definition.DeepClone() },
            ["schemaVersion"] = "1.0.0.0",
        };
    }

    /// <summary>Same definition and the same references (by key, logical name and connector); other properties Dataverse adds are ignored.</summary>
    public static bool SameClientData(string? current, JsonObject wanted)
    {
        if (string.IsNullOrWhiteSpace(current)) return false;
        JsonNode? parsed;
        try
        {
            parsed = JsonNode.Parse(current);
        }
        catch (JsonException)
        {
            return false;
        }

        var properties = parsed?["properties"];
        var wantedProperties = wanted["properties"]!;
        if (!JsonNode.DeepEquals(properties?["definition"], wantedProperties["definition"])) return false;
        return References(properties?["connectionReferences"]).SetEquals(References(wantedProperties["connectionReferences"]));
    }

    private static HashSet<string> References(JsonNode? node) =>
        (node as JsonObject ?? []).Select(r =>
            $"{r.Key}|{r.Value?["connection"]?["connectionReferenceLogicalName"]?.GetValue<string>()?.ToLowerInvariant()}|{r.Value?["api"]?["name"]?.GetValue<string>()?.ToLowerInvariant()}")
        .ToHashSet(StringComparer.Ordinal);

    /// <summary>The flow in the shape flow_apply takes (without solution), for inspect_solution kind flow.</summary>
    public static Dictionary<string, object?> Describe(Entity row)
    {
        var result = new Dictionary<string, object?>
        {
            ["name"] = row.GetAttributeValue<string>("name"),
            ["state"] = row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1 ? "on" : "off",
        };
        // Only spec properties, so the result can be sent back to flow_apply with solution added.
        if (row.GetAttributeValue<string>("description") is { } description) result["description"] = description;
        JsonNode? data = null;
        try
        {
            data = JsonNode.Parse(row.GetAttributeValue<string>("clientdata") ?? "");
        }
        catch (JsonException)
        {
        }

        if (data?["properties"] is JsonObject properties)
        {
            var references = new Dictionary<string, object?>();
            foreach (var (key, value) in properties["connectionReferences"] as JsonObject ?? [])
            {
                references[key] = new Dictionary<string, object?>
                {
                    ["logicalName"] = value?["connection"]?["connectionReferenceLogicalName"]?.GetValue<string>(),
                    ["connector"] = value?["api"]?["name"]?.GetValue<string>(),
                };
            }

            result["connectionReferences"] = references;
            result["definition"] = JsonSerializer.Deserialize<JsonElement>(properties["definition"]?.ToJsonString() ?? "null");
        }

        return result;
    }

    private static string Describe(JsonObject definition, IReadOnlyDictionary<string, FlowConnectionReference> references)
    {
        var triggers = (definition["triggers"] as JsonObject ?? []).Select(t => t.Key);
        var actions = (definition["actions"] as JsonObject ?? []).Count;
        var hash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(definition.ToJsonString())))[..12];
        var connectors = references.Values.Select(r => ShortName(ConfigPlanner.ConnectorId(r.Connector))).Distinct().Order();
        return $"trigger {string.Join(", ", triggers)}; {actions} top-level action(s); connectors {(connectors.Any() ? string.Join(", ", connectors) : "none")}; definition sha256 {hash}";
    }

    private static string ShortName(string connectorId) =>
        connectorId.StartsWith(ApiPrefix, StringComparison.OrdinalIgnoreCase) ? connectorId[ApiPrefix.Length..] : connectorId;

    private static async Task<Entity?> FindReferenceAsync(IAgentClient client, string logical, CancellationToken ct)
    {
        var query = new QueryExpression(ConfigPlanner.ConnectionReferenceTable)
        {
            NoLock = true,
            TopCount = 1,
            ColumnSet = new ColumnSet("connectionreferencelogicalname", "connectorid", "connectionid"),
        };
        query.Criteria.AddCondition("connectionreferencelogicalname", ConditionOperator.Equal, logical);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
