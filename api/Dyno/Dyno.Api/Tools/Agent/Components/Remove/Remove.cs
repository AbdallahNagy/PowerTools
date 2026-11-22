using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Components.Shared;
using Dyno.Api.Tools.Agent.Kernel;
using Dyno.Api.Tools.PluginRegistration.Services;
using Dyno.Api.Tools.SolutionLayers;

namespace Dyno.Api.Tools.Agent.Components.Remove;

[JsonConverter(typeof(JsonStringEnumConverter<RemoveKind>))]
public enum RemoveKind
{
    [JsonStringEnumMemberName("table")] Table,
    [JsonStringEnumMemberName("column")] Column,
    [JsonStringEnumMemberName("relationship")] Relationship,
    [JsonStringEnumMemberName("key")] Key,
    [JsonStringEnumMemberName("choice")] Choice,
    [JsonStringEnumMemberName("choiceoption")] ChoiceOption,
    [JsonStringEnumMemberName("form")] Form,
    [JsonStringEnumMemberName("view")] View,
    [JsonStringEnumMemberName("app")] App,
    [JsonStringEnumMemberName("sitemap")] SiteMap,
    [JsonStringEnumMemberName("webresource")] WebResource,
    [JsonStringEnumMemberName("command")] Command,
    [JsonStringEnumMemberName("process")] Process,
    [JsonStringEnumMemberName("flow")] Flow,
    [JsonStringEnumMemberName("customapi")] CustomApi,
    [JsonStringEnumMemberName("pluginassembly")] PluginAssembly,
    [JsonStringEnumMemberName("plugintype")] PluginType,
    [JsonStringEnumMemberName("pluginstep")] PluginStep,
    [JsonStringEnumMemberName("pluginimage")] PluginImage,
    [JsonStringEnumMemberName("role")] Role,
    [JsonStringEnumMemberName("envvar")] EnvVar,
    [JsonStringEnumMemberName("connectionreference")] ConnectionReference,
    [JsonStringEnumMemberName("solution")] Solution,
    [JsonStringEnumMemberName("solutioncomponent")] SolutionComponent,
    [JsonStringEnumMemberName("activelayer")] ActiveLayer,
}

[Description("One component to delete or detach. Never records. A component that is already gone plans nothing.")]
public sealed class RemoveSpec : IApplySpec
{
    public required RemoveKind Kind { get; init; }

    [Description("Logical, unique or schema name (by kind), or the id. choiceoption: the global choice (or give table and column). solutioncomponent and activelayer: the component's name.")]
    public required string Name { get; init; }

    [Description("Table logical name, for column, key, form, view, and a local choiceoption.")]
    public string? Table { get; init; }

    [Description("choiceoption on a column: the column.")]
    public string? Column { get; init; }

    [Description("choiceoption: the option value.")]
    public int? Value { get; init; }

    [Description("solutioncomponent and activelayer: the kind of the component.")]
    public ComponentKind? ComponentKind { get; init; }

    [Description("solutioncomponent: the solution to take it out of.")]
    public string? Solution { get; init; }

    string? IApplySpec.Solution => null;
}

/// <summary>
/// Plans remove: finds the component and, for a delete, asks Dataverse what depends on it. Anything that depends on
/// it, or a managed component, blocks the step with the reason; otherwise one destructive step deletes it.
/// </summary>
public sealed class RemovePlanner(ISolutionLayersCache layersCache) : IComponentPlanner<RemoveSpec>
{
    public const string Family = "remove";
    private const int MaxDependents = 10;

    public async Task<Plan> PlanAsync(RemoveSpec spec, PlanContext context, CancellationToken ct)
    {
        var client = context.Client;
        var kindName = KindName(spec.Kind);
        switch (spec.Kind)
        {
            case RemoveKind.ChoiceOption:
                return await ChoiceOptionAsync(spec, client, ct);
            case RemoveKind.Solution:
                return await SolutionAsync(spec, client, ct);
            case RemoveKind.SolutionComponent:
                return await SolutionComponentAsync(spec, client, ct);
            case RemoveKind.ActiveLayer:
                return await ActiveLayerAsync(spec, context, ct);
        }

        var kind = Enum.Parse<ComponentKind>(spec.Kind.ToString());
        if (ComponentKinds.Feature(kind) is { } feature && !context.Capabilities.HasTable(feature))
            return new Plan([PlanStep.Unsupported("delete", $"{kindName} {spec.Name}", $"This environment has no {kindName} components.")]);

        var found = await ComponentKinds.FindAsync(client, kind, spec.Name, spec.Table, ct);
        if (found is null) return new Plan([], [$"{kindName} {spec.Name} was not found; nothing to remove."]);
        var label = $"{kindName} {found.Label}";
        var locks = new[] { $"remove:{found.Id:D}" };
        if (found.Managed)
            return new Plan([PlanStep.Blocked("delete", label, $"{label} is managed. It goes when its solution is uninstalled.")], lockKeys: locks);

        if (found.ComponentType != 0 && found.Id != Guid.Empty)
        {
            var dependents = await Dependencies.ForDeleteAsync(client, found.ComponentType, found.Id, ct);
            if (dependents.Count > 0)
            {
                var listed = string.Join(", ", dependents.Take(MaxDependents).Select(d => $"type {d.DependentComponentType} {d.DependentComponentId:D}"));
                return new Plan(
                    [PlanStep.Blocked("delete", label,
                        $"{dependents.Count} component(s) depend on {label}: {listed}{(dependents.Count > MaxDependents ? ", …" : "")}. Remove them or their use of it first.")],
                    lockKeys: locks);
            }
        }

        var steps = new List<PlanStep>();
        if (kind is ComponentKind.Process or ComponentKind.Flow && found.Row?.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1)
        {
            steps.Add(new PlanStep
            {
                Op = "deactivate",
                Target = label,
                Effect = PlanEffect.Change,
                SolutionAware = false,
                Request = new SetStateRequest { EntityMoniker = new EntityReference("workflow", found.Id), State = new OptionSetValue(0), Status = new OptionSetValue(1) },
            });
        }

        steps.Add(new PlanStep
        {
            Op = "delete",
            Target = label,
            Effect = PlanEffect.Destructive,
            Detail = found.Id == Guid.Empty ? null : $"id {found.Id:D}",
            SolutionAware = false,
            Request = DeleteRequest(kind, found, spec),
            Action = DeleteAction(kind, found),
        });
        return new Plan(steps, lockKeys: locks);
    }

    private static OrganizationRequest? DeleteRequest(ComponentKind kind, FoundComponent found, RemoveSpec spec)
    {
        var table = spec.Table?.Trim().ToLowerInvariant();
        return kind switch
        {
            ComponentKind.Table => new DeleteEntityRequest { LogicalName = found.Label },
            ComponentKind.Column => new DeleteAttributeRequest { EntityLogicalName = table, LogicalName = found.Label.Split('.').Last() },
            ComponentKind.Relationship => new DeleteRelationshipRequest { Name = found.Label },
            ComponentKind.Key => new DeleteEntityKeyRequest { EntityLogicalName = table, Name = found.Label.Split('.').Last() },
            ComponentKind.Choice => new DeleteOptionSetRequest { Name = found.Label },
            ComponentKind.PluginAssembly or ComponentKind.PluginType or ComponentKind.PluginStep or ComponentKind.PluginImage or ComponentKind.EnvVar => null,
            _ => new DeleteRequest { Target = new EntityReference(found.RecordTable!, found.Id) },
        };
    }

    private static Func<StepContext, CancellationToken, Task>? DeleteAction(ComponentKind kind, FoundComponent found)
    {
        var id = found.Id;
        return kind switch
        {
            ComponentKind.PluginAssembly => (step, ct) => Plugins.PluginErrors.Run(() => new UnregisterService(new AgentPluginGateway(step.Client)).UnregisterAssemblyAsync(id, ct)),
            ComponentKind.PluginType => (step, ct) => Plugins.PluginErrors.Run(() => new UnregisterService(new AgentPluginGateway(step.Client)).UnregisterTypeAsync(id, ct)),
            ComponentKind.PluginStep => (step, ct) => Plugins.PluginErrors.Run(() => new UnregisterService(new AgentPluginGateway(step.Client)).UnregisterStepAsync(id, ct)),
            ComponentKind.PluginImage => (step, ct) => Plugins.PluginErrors.Run(() => new UnregisterService(new AgentPluginGateway(step.Client)).UnregisterImageAsync(id, ct)),
            ComponentKind.EnvVar => async (step, ct) =>
            {
                // A definition's value rows go first; Dataverse does not delete them with it everywhere.
                var query = new QueryExpression("environmentvariablevalue") { NoLock = true, ColumnSet = new ColumnSet(false) };
                query.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, id);
                foreach (var value in (await step.Client.RetrieveMultipleAsync(query, ct)).Entities)
                    await step.Client.DeleteAsync("environmentvariablevalue", value.Id, ct);
                await step.Client.DeleteAsync("environmentvariabledefinition", id, ct);
            },
            _ => null,
        };
    }

    private static async Task<Plan> ChoiceOptionAsync(RemoveSpec spec, IAgentClient client, CancellationToken ct)
    {
        var value = spec.Value ?? throw Invalid("choiceoption needs value.");
        string label;
        OrganizationRequest request;
        PublishTarget publish;
        IEnumerable<int> values;
        if (spec.Table is { } table)
        {
            var column = spec.Column ?? throw Invalid("A choiceoption on a column needs table and column.");
            var attribute = await ComponentKinds.FindAsync(client, ComponentKind.Column, column, table, ct);
            if (attribute is null) return new Plan([], [$"Column {table}.{column} was not found; nothing to remove."]);
            var response = (RetrieveAttributeResponse)await client.ExecuteAsync(new RetrieveAttributeRequest
            {
                EntityLogicalName = table.ToLowerInvariant(),
                LogicalName = column.ToLowerInvariant(),
                RetrieveAsIfPublished = true,
            }, ct);
            values = (response.AttributeMetadata as Microsoft.Xrm.Sdk.Metadata.EnumAttributeMetadata)?.OptionSet?.Options.Select(o => o.Value ?? 0)
                ?? throw Invalid($"{table}.{column} is not a choice column.");
            label = $"{table.ToLowerInvariant()}.{column.ToLowerInvariant()} {value}";
            request = new DeleteOptionValueRequest { EntityLogicalName = table.ToLowerInvariant(), AttributeLogicalName = column.ToLowerInvariant(), Value = value };
            publish = new PublishTarget(PublishKind.Entity, table.ToLowerInvariant());
        }
        else
        {
            var set = await Choices.ChoicePlanner.ReadAsync(client, spec.Name.Trim().ToLowerInvariant(), ct);
            if (set is null) return new Plan([], [$"Choice {spec.Name} was not found; nothing to remove."]);
            values = set.Options.Select(o => o.Value ?? 0);
            label = $"{set.Name} {value}";
            request = new DeleteOptionValueRequest { OptionSetName = set.Name, Value = value };
            publish = new PublishTarget(PublishKind.OptionSet, set.Name);
        }

        if (!values.Contains(value)) return new Plan([], [$"Option {label} does not exist; nothing to remove."]);
        return new Plan(
            [new PlanStep
            {
                Op = "deleteOption",
                Target = label,
                Effect = PlanEffect.Destructive,
                Detail = "Records with this value lose it.",
                Request = request,
                SolutionAware = false,
                Publishes = [publish],
            }],
            lockKeys: [$"remove:{label}"]);
    }

    private static async Task<Plan> SolutionAsync(RemoveSpec spec, IAgentClient client, CancellationToken ct)
    {
        var solution = await Solutions.SolutionPlanner.FindSolutionAsync(client, spec.Name, ct);
        if (solution is null) return new Plan([], [$"Solution {spec.Name} was not found; nothing to remove."]);
        var name = solution.GetAttributeValue<string>("uniquename") ?? spec.Name;
        if (solution.GetAttributeValue<bool?>("ismanaged") == true)
            return new Plan([PlanStep.Blocked("delete", $"solution {name}", $"Solution {name} is managed. Deleting it uninstalls everything in it; do that in the maker portal.")]);
        if (solution.GetAttributeValue<bool?>("isvisible") == false || name is "Default" or "Active" or "Basic")
            return new Plan([PlanStep.Blocked("delete", $"solution {name}", $"Solution {name} is a system solution.")]);
        return new Plan(
            [new PlanStep
            {
                Op = "delete",
                Target = $"solution {name}",
                Effect = PlanEffect.Destructive,
                Detail = "The solution goes; its components stay in the environment.",
                Request = new DeleteRequest { Target = new EntityReference("solution", solution.Id) },
                SolutionAware = false,
            }],
            lockKeys: [$"solution:{name.ToLowerInvariant()}"]);
    }

    private static async Task<Plan> SolutionComponentAsync(RemoveSpec spec, IAgentClient client, CancellationToken ct)
    {
        var solutionName = spec.Solution ?? throw Invalid("solutioncomponent needs solution.");
        var kind = spec.ComponentKind ?? throw Invalid("solutioncomponent needs componentKind.");
        var solution = await Solutions.SolutionPlanner.FindSolutionAsync(client, solutionName, ct)
            ?? throw new AgentProblemException(AgentFaults.NotFound($"Solution {solutionName} was not found."));
        var found = await ComponentKinds.FindAsync(client, kind, spec.Name, spec.Table, ct);
        if (found is null || !await ComponentKinds.InSolutionAsync(client, solution.Id, found.Id, ct))
            return new Plan([], [$"{ComponentKinds.Name(kind)} {spec.Name} is not in solution {solutionName}; nothing to remove."]);
        return new Plan(
            [new PlanStep
            {
                Op = "removeFromSolution",
                Target = $"{ComponentKinds.Name(kind)} {found.Label}",
                Effect = PlanEffect.Destructive,
                Detail = $"from solution {solutionName}; the component stays in the environment",
                Request = new RemoveSolutionComponentRequest { ComponentId = found.Id, ComponentType = found.ComponentType, SolutionUniqueName = solutionName },
                SolutionAware = false,
            }],
            lockKeys: [$"solution:{solutionName.ToLowerInvariant()}"]);
    }

    private async Task<Plan> ActiveLayerAsync(RemoveSpec spec, PlanContext context, CancellationToken ct)
    {
        var kind = spec.ComponentKind ?? throw Invalid("activelayer needs componentKind.");
        if (!context.Capabilities.HasTable("msdyn_componentlayer"))
            return new Plan([PlanStep.Unsupported("removeActiveLayer", spec.Name, "This environment does not expose solution layers.", "Import the managed solution again with overwriteUnmanagedCustomizations (solution_import).")]);
        var found = await ComponentKinds.FindAsync(context.Client, kind, spec.Name, spec.Table, ct)
            ?? throw new AgentProblemException(AgentFaults.NotFound($"{ComponentKinds.Name(kind)} {spec.Name} was not found."));
        var service = new SolutionLayersService(context.Client, layersCache, context.ConnectionKey);
        var layers = await service.GetLayersAsync(found.ComponentType, found.Id.ToString("D"), ct);
        if (layers.Problem is not null) throw new AgentProblemException(AgentFaults.FromExternal(layers.Problem.Status, layers.Problem.Code, layers.Problem.Message));
        var label = $"{ComponentKinds.Name(kind)} {found.Label}";
        if (!layers.Value!.HasActiveLayer) return new Plan([], [$"{label} has no unmanaged active layer; nothing to remove."]);
        if (!layers.Value.CanRemoveActive)
            return new Plan([PlanStep.Blocked("removeActiveLayer", label, $"{label} has only an unmanaged layer; delete it with remove kind {ComponentKinds.Name(kind)} instead.")]);
        var type = found.ComponentType;
        var id = found.Id.ToString("D");
        return new Plan(
            [new PlanStep
            {
                Op = "removeActiveLayer",
                Target = label,
                Effect = PlanEffect.Destructive,
                Detail = "Unmanaged customizations of the component are lost; the managed layers below take effect.",
                SolutionAware = false,
                Action = async (step, token) =>
                {
                    var result = await new SolutionLayersService(step.Client, layersCache, context.ConnectionKey).RemoveActiveAsync(new RemoveActiveBody(type, id), token);
                    if (result.Problem is not null) throw new AgentProblemException(AgentFaults.FromExternal(result.Problem.Status, result.Problem.Code, result.Problem.Message));
                },
            }],
            lockKeys: [$"remove:{id}"]);
    }

    private static string KindName(RemoveKind kind) =>
        typeof(RemoveKind).GetField(kind.ToString())!.GetCustomAttributes(typeof(JsonStringEnumMemberNameAttribute), false)
            .OfType<JsonStringEnumMemberNameAttribute>().Single().Name;

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
