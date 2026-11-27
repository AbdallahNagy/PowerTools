using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Components.Shared;
using Dyno.Api.Tools.Agent.Components.WebResources;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.BusinessProcessFlows;

/// <summary>
/// Plans bpf_apply: a business process flow written as a workflow row (category 4) with the designer's XAML and client
/// data (see <see cref="BpfXaml"/>). Everything goes through SDK messages, so online and on-premises take the same
/// path. An active flow is deactivated while it is saved, as the designer does. Activating a flow creates the table
/// that holds each record's progress; that table joins the solution too, so the flow exports whole.
/// </summary>
public sealed class BpfPlanner : IComponentPlanner<BpfApplySpec>
{
    public const string Family = "bpf";

    public const int Category = 4;

    public async Task<Plan> PlanAsync(BpfApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var name = spec.Name?.Trim() ?? "";
        if (name.Length == 0) throw Invalid("name is required.");
        var table = spec.Table?.Trim().ToLowerInvariant() ?? "";
        if (table.Length == 0) throw Invalid("table is required.");
        var client = context.Client;
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var lockKeys = new List<string> { LockKey(name) };

        var existing = await ComponentKinds.FindAsync(client, ComponentKind.Process, name, null, ct);
        var row = existing?.Row;
        if (row is not null)
        {
            var category = row.GetAttributeValue<OptionSetValue>("category")?.Value;
            if (category != Category) throw Invalid($"{name} is a process of another kind, not a business process flow. Give another name.");
            if (row.GetAttributeValue<OptionSetValue>("businessprocesstype")?.Value == 1)
                throw Invalid($"{name} is a task flow; bpf_apply writes business process flows only.");
            var current = row.GetAttributeValue<string>("primaryentity");
            if (!string.Equals(current, table, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"{name} runs on {current}; table cannot change. Give another name for a flow on {table}.");
            if (existing!.Managed || !existing.Customizable)
                return new Plan([PlanStep.Blocked("updateBpf", name, $"{name} is managed; change it in its source environment.")], lockKeys: lockKeys);
        }

        if (row is null && spec.Stages is null) throw Invalid($"Business process flow {name} does not exist yet; a new flow needs stages.");
        var metadata = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Table {table} was not found.");
        var currentXaml = row?.GetAttributeValue<string>("xaml");
        var reading = currentXaml is null ? null : BpfXaml.Read(currentXaml);
        if (spec.Stages is not null && reading is { Problems.Count: > 0 })
            throw Invalid($"{name} has what bpf_apply cannot write back: {string.Join(" ", reading.Problems)} Change it in the designer.");

        var id = row?.Id ?? NewId(name, table);
        var language = await context.BaseLanguageAsync(ct);
        var stages = spec.Stages is null ? reading?.Stages ?? [] : Stages(spec.Stages, id, metadata, reading, language);
        var description = spec.Description ?? row?.GetAttributeValue<string>("description");
        var xaml = BpfXaml.Write(id, table, stages, language);
        var clientData = BpfXaml.ClientData(id, name, description, table, stages, language);

        var steps = new List<PlanStep>();
        if (metadata.IsBusinessProcessEnabled != true)
        {
            var update = new UpdateEntityRequest
            {
                Entity = new EntityMetadata { LogicalName = table, MetadataId = metadata.MetadataId, IsBusinessProcessEnabled = true },
                MergeLabels = true,
            };
            steps.Add(new PlanStep
            {
                Op = "enableBusinessProcessFlows",
                Target = table,
                Detail = "turns on business process flows for the table; this cannot be turned off",
                Request = update,
                SolutionAware = false,
                Publishes = [new PublishTarget(PublishKind.Entity, table)],
            });
        }

        var active = row?.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1;
        var wantActive = spec.State switch
        {
            BpfState.Active => true,
            BpfState.Draft => false,
            _ => row is null || active,
        };

        if (row is null)
        {
            var flow = new Entity("workflow", id)
            {
                ["name"] = name,
                ["type"] = new OptionSetValue(1),
                ["category"] = new OptionSetValue(Category),
                ["businessprocesstype"] = new OptionSetValue(0),
                ["mode"] = new OptionSetValue(0),
                ["scope"] = new OptionSetValue(4),
                ["runas"] = new OptionSetValue(1),
                ["ondemand"] = false,
                ["primaryentity"] = table,
                ["languagecode"] = language,
                ["xaml"] = xaml,
                ["clientdata"] = clientData,
            };
            if (description is not null) flow["description"] = description;
            steps.Add(new PlanStep
            {
                Op = "createBpf",
                Target = name,
                Detail = $"on {table}; {Summary(stages)}{(wantActive ? "; activated after, which creates the table that holds each record's progress" : "; left in draft")}",
                Request = new CreateRequest { Target = flow },
            });
            if (wantActive) steps.Add(Activate(name, id));
            return new Plan(steps, [], lockKeys);
        }

        var changes = new List<string>();
        var updateRow = new Entity("workflow", id);
        if (spec.Stages is not null && !Same(reading!.Stages, stages))
        {
            updateRow["xaml"] = xaml;
            updateRow["clientdata"] = clientData;
            changes.AddRange(StageChanges(reading.Stages, stages));
        }

        if (spec.Description is not null && spec.Description != (row.GetAttributeValue<string>("description") ?? ""))
        {
            updateRow["description"] = spec.Description;
            if (!updateRow.Contains("clientdata")) updateRow["clientdata"] = clientData;
            changes.Add("description");
        }

        var removed = reading?.Stages.Where(s => stages.All(w => w.Id != s.Id)).Select(s => s.Name).ToList() ?? [];
        if (changes.Count > 0)
        {
            steps.Add(new PlanStep
            {
                Op = "updateBpf",
                Target = name,
                Effect = removed.Count > 0 ? PlanEffect.Destructive : PlanEffect.Change,
                Detail = string.Join("; ", changes) + (active ? "; deactivated while it is saved" : "") + (wantActive ? "; active after" : "; left in draft"),
                Action = async (step, token) =>
                {
                    if (active) await SetStateAsync(step.Client, id, activate: false, token);
                    await step.Client.UpdateAsync(updateRow, token);
                    await WebResourcePlanner.AddToSolutionAsync(step, id, ComponentKinds.WorkflowType, token);
                    if (wantActive) await ActivateAsync(step, id, token);
                },
            });
        }
        else if (wantActive != active)
        {
            steps.Add(wantActive
                ? Activate(name, id)
                : new PlanStep
                {
                    Op = "deactivateBpf",
                    Target = name,
                    SolutionAware = false,
                    Action = (step, token) => SetStateAsync(step.Client, id, activate: false, token),
                });
        }

        var stateToken = Hash((currentXaml ?? "") + "|" + row.GetAttributeValue<string>("description"));
        return new Plan(steps, [], lockKeys, stateToken);
    }

    public static string LockKey(string name) => $"bpf:{name.ToLowerInvariant()}";

    // ── The stages the spec asks for ─────────────────────────────────────────

    /// <summary>
    /// The wanted stages. A stage with the name of a current stage keeps its id and category, and a step on a column
    /// the current stage has keeps its id, control and label; anything new gets an id from the flow, stage and column,
    /// so planning twice writes the same XAML.
    /// </summary>
    internal static List<BpfStageModel> Stages(IReadOnlyList<BpfStage> given, Guid flowId, EntityMetadata table, BpfReading? reading, int language)
    {
        if (given.Count == 0) throw Invalid("stages: a flow needs at least one stage.");
        if (given.Count > 30) throw Invalid("stages: a flow can have at most 30 stages.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var controls = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var result = new List<BpfStageModel>();
        foreach (var stage in given)
        {
            var stageName = stage.Name?.Trim() ?? "";
            if (stageName.Length == 0) throw Invalid("stages: every stage needs a name.");
            if (!names.Add(stageName)) throw Invalid($"stages: two stages are named {stageName}; stage names must be unique.");
            var current = reading?.Stages.FirstOrDefault(s => string.Equals(s.Name, stageName, StringComparison.OrdinalIgnoreCase));
            var stageId = current?.Id ?? IdOf($"bpf|{flowId:D}|stage|{stageName.ToLowerInvariant()}");
            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var steps = new List<BpfStepModel>();
            foreach (var step in stage.Steps ?? [])
            {
                var column = step.Column?.Trim().ToLowerInvariant() ?? "";
                if (column.Length == 0) throw Invalid($"Stage {stageName}: every step needs a column.");
                if (!columns.Add(column)) throw Invalid($"Stage {stageName}: column {column} appears twice.");
                var attribute = table.Attributes?.FirstOrDefault(a => string.Equals(a.LogicalName, column, StringComparison.OrdinalIgnoreCase))
                    ?? throw Invalid($"Stage {stageName}: {table.LogicalName} has no column {column}.");
                var classId = ClassId(attribute) ?? throw Invalid($"Stage {stageName}: {column} is a {attribute.AttributeType} column, which a stage step cannot show.");
                if (attribute.IsValidForUpdate == false && attribute.IsValidForCreate == false)
                    throw Invalid($"Stage {stageName}: {column} cannot be set by users, so it cannot be a step.");
                var had = current?.Steps.FirstOrDefault(s => s.Column == column);
                var displayName = Labels.Text(attribute.DisplayName, language) ?? attribute.DisplayName?.UserLocalizedLabel?.Label ?? column;
                var count = controls.TryGetValue(column, out var seen) ? seen : 0;
                controls[column] = count + 1;
                var controlId = count == 0 ? column : $"{column}{count}";
                steps.Add(new BpfStepModel(
                    had?.Id ?? IdOf($"bpf|{stageId:D}|step|{column}"),
                    column,
                    step.Label?.Trim() is { Length: > 0 } label ? label : had?.Label ?? displayName,
                    step.Required ?? had?.Required ?? false,
                    controlId,
                    had?.ClassId is { Length: > 0 } keptClass ? keptClass : classId,
                    displayName));
            }

            result.Add(new BpfStageModel(stageId, stageName, current is null ? "-1" : current.Category, steps));
        }

        return result;
    }

    /// <summary>The form control class the designer uses for a column of each type.</summary>
    internal static string? ClassId(AttributeMetadata attribute) => attribute switch
    {
        StringAttributeMetadata { FormatName.Value: "Email" } => "ada2203e-b4cd-49be-9ddf-234642b43b52",
        StringAttributeMetadata { FormatName.Value: "Url" } => "71716b6c-711e-476c-8ab8-5d11542bfb47",
        StringAttributeMetadata { FormatName.Value: "Phone" } => "8c10015a-b339-4982-9474-a95fe05631a5",
        StringAttributeMetadata { FormatName.Value: "TickerSymbol" } => "1e1fc551-f7a8-43af-ac34-a8dc35c7b6d4",
        StringAttributeMetadata { FormatName.Value: "TextArea" } => "e0dece4b-6fc8-4a8f-a065-082708572369",
        StringAttributeMetadata => "4273edbd-ac1d-40d3-9fb2-095c621b552d",
        MemoAttributeMetadata => "e0dece4b-6fc8-4a8f-a065-082708572369",
        IntegerAttributeMetadata => "c6d124ca-7eda-4a60-aea9-7fb8d318b68f",
        DecimalAttributeMetadata => "c3efe0c3-0ec6-42be-8349-cbd9079dfd8e",
        DoubleAttributeMetadata => "0d2c745a-e5a8-4c8f-ba63-c6d3bb604660",
        MoneyAttributeMetadata => "533b9e00-756b-4312-95a0-dc888637ac78",
        DateTimeAttributeMetadata => "5b773807-9fb2-42db-97c3-7a91eff8adff",
        BooleanAttributeMetadata => "67fac785-cd58-4f9f-abb3-4b7ddc6ed5ed",
        MultiSelectPicklistAttributeMetadata => "4aa28ab7-9c13-4f57-a73d-ad894d048b5f",
        StatusAttributeMetadata => "5d68b988-0661-4db2-bc3e-17598ad3be6c",
        PicklistAttributeMetadata => "3ef39988-22bb-4f0b-bbbe-64b5a3748aee",
        LookupAttributeMetadata => "270bd3db-d9af-4782-9025-509e298dec0a",
        _ => null,
    };

    private static bool Same(IReadOnlyList<BpfStageModel> current, IReadOnlyList<BpfStageModel> wanted) =>
        JsonSerializer.Serialize(current.Select(Shape)) == JsonSerializer.Serialize(wanted.Select(Shape));

    /// <summary>What a user sees of a stage; control ids and classes the designer varies do not count.</summary>
    private static object Shape(BpfStageModel stage) =>
        new { stage.Id, stage.Name, Steps = stage.Steps.Select(s => new { s.Id, s.Column, s.Label, s.Required }) };

    private static IEnumerable<string> StageChanges(IReadOnlyList<BpfStageModel> current, IReadOnlyList<BpfStageModel> wanted)
    {
        var added = wanted.Where(w => current.All(c => c.Id != w.Id)).Select(w => w.Name).ToList();
        var removed = current.Where(c => wanted.All(w => w.Id != c.Id)).Select(c => c.Name).ToList();
        var changed = wanted.Where(w => current.FirstOrDefault(c => c.Id == w.Id) is { } c
            && JsonSerializer.Serialize(Shape(c)) != JsonSerializer.Serialize(Shape(w))).Select(w => w.Name).ToList();
        if (added.Count > 0) yield return $"adds stage(s) {string.Join(", ", added)}";
        if (removed.Count > 0) yield return $"removes stage(s) {string.Join(", ", removed)}; records at a removed stage lose their place in the flow";
        if (changed.Count > 0) yield return $"changes the steps of {string.Join(", ", changed)}";
        var kept = wanted.Where(w => current.Any(c => c.Id == w.Id)).Select(w => w.Id).ToList();
        if (added.Count == 0 && removed.Count == 0 && !kept.SequenceEqual(current.Select(c => c.Id))) yield return "reorders the stages";
        yield return Summary(wanted);
    }

    private static string Summary(IReadOnlyList<BpfStageModel> stages) =>
        $"{stages.Count} stage(s): " + string.Join(" → ", stages.Select(s =>
            $"{s.Name} ({(s.Steps.Count == 0 ? "no steps" : string.Join(", ", s.Steps.Select(t => t.Required ? $"{t.Column}*" : t.Column)))})"));

    // ── Saving ───────────────────────────────────────────────────────────────

    private static PlanStep Activate(string name, Guid id) => new()
    {
        Op = "activateBpf",
        Target = name,
        Detail = "creates the table that holds each record's progress the first time, and adds it to the solution",
        Action = (step, token) => ActivateAsync(step, id, token),
    };

    /// <summary>Activates the flow, then adds the table that holds its progress to the solution.</summary>
    private static async Task ActivateAsync(StepContext step, Guid id, CancellationToken ct)
    {
        await SetStateAsync(step.Client, id, activate: true, ct);
        if (string.IsNullOrWhiteSpace(step.SolutionUniqueName)) return;
        var saved = await step.Client.RetrieveAsync("workflow", id, new ColumnSet("uniquename"), ct);
        if (saved.GetAttributeValue<string>("uniquename") is not { Length: > 0 } backing) return;
        var response = (RetrieveEntityResponse)await step.Client.ExecuteAsync(
            new RetrieveEntityRequest { LogicalName = backing, EntityFilters = EntityFilters.Entity }, ct);
        if (response.EntityMetadata.MetadataId is { } metadataId)
            await WebResourcePlanner.AddToSolutionAsync(step, metadataId, 1, ct);
    }

    private static Task SetStateAsync(IAgentClient client, Guid id, bool activate, CancellationToken ct) =>
        client.ExecuteAsync(new SetStateRequest
        {
            EntityMoniker = new EntityReference("workflow", id),
            State = new OptionSetValue(activate ? 1 : 0),
            Status = new OptionSetValue(activate ? 2 : 1),
        }, ct);

    // ── Reading a flow back ──────────────────────────────────────────────────

    /// <summary>The flow in the shape bpf_apply takes (without solution), for inspect_solution kind bpf.</summary>
    public static Dictionary<string, object?> Describe(Entity row)
    {
        var result = new Dictionary<string, object?>
        {
            ["name"] = row.GetAttributeValue<string>("name"),
            ["table"] = row.GetAttributeValue<string>("primaryentity"),
        };
        if (row.GetAttributeValue<string>("description") is { Length: > 0 } description) result["description"] = description;
        var reading = BpfXaml.Read(row.GetAttributeValue<string>("xaml") ?? "");
        result["stages"] = reading.Stages.Select(stage => new Dictionary<string, object?>
        {
            ["name"] = stage.Name,
            ["steps"] = stage.Steps.Select(step => new Dictionary<string, object?>
            {
                ["column"] = step.Column,
                ["label"] = step.Label,
                ["required"] = step.Required,
            }).ToList(),
        }).ToList();
        result["state"] = row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1 ? "active" : "draft";
        if (row.GetAttributeValue<string>("uniquename") is { Length: > 0 } backing) result["progressTable"] = backing;
        if (reading.Problems.Count > 0) result["problems"] = reading.Problems;
        return result;
    }

    /// <summary>A new flow's id comes from its name and table, so planning twice gives the same XAML and hash.</summary>
    private static Guid NewId(string name, string table) => IdOf($"bpf|{table}|{name.ToLowerInvariant()}");

    private static Guid IdOf(string text) => new(MD5.HashData(Encoding.UTF8.GetBytes(text)));

    private static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..12];

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
