using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Components.WebResources;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Processes;

/// <summary>
/// Plans process_apply: a classic workflow or custom process action written from typed steps. The XAML is the
/// designer's own (see <see cref="ProcessXamlWriter"/>) and it is saved the way the designer's exports move between
/// environments, by importing an unmanaged solution that holds only this process. That is one path for online and
/// on-premises. The process then joins the target solution, the temporary solution is deleted, and the process is
/// activated or left in draft.
/// </summary>
public sealed class ProcessPlanner(
    Func<TimeSpan, CancellationToken, Task>? delay = null,
    TimeSpan? pollInterval = null) : IComponentPlanner<ProcessApplySpec>
{
    public const string Family = "process";

    public const int WorkflowCategory = 0;
    public const int ActionCategory = 3;

    /// <summary>The temporary solution's name starts with this; a leftover one is safe to delete.</summary>
    public const string PackagePrefix = "PowerToolsProcess";

    public async Task<Plan> PlanAsync(ProcessApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var name = spec.Name?.Trim() ?? "";
        if (name.Length == 0) throw Invalid("name is required.");
        var table = spec.Table?.Trim().ToLowerInvariant() ?? "";
        if (table.Length == 0) throw Invalid("table is required.");
        var client = context.Client;
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var lockKeys = new List<string> { LockKey(name), Locks.PublishKey(context.ConnectionKey) };

        var existing = await ComponentKinds.FindAsync(client, ComponentKind.Process, name, null, ct);
        var row = existing?.Row;
        if (row is not null)
        {
            var category = row.GetAttributeValue<OptionSetValue>("category")?.Value;
            if (category is not (WorkflowCategory or ActionCategory))
                throw Invalid($"{name} is a {CategoryName(category)}, not a classic workflow or action; process_apply writes only those.");
            var kind = category == ActionCategory ? ProcessKind.Action : ProcessKind.Workflow;
            if (kind != spec.Kind) throw Invalid($"{name} is a {KindName(kind)}; kind cannot change. Give another name for a new {KindName(spec.Kind)}.");
            var current = row.GetAttributeValue<string>("primaryentity");
            if (!string.Equals(current, table, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"{name} runs on {current}; table cannot change. Give another name for a process on {table}.");
            if (existing!.Managed || !existing.Customizable)
                return new Plan([PlanStep.Blocked("updateProcess", name, $"{name} is managed; change it in its source environment.")], lockKeys: lockKeys);
        }

        var primary = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Table {table} was not found.");
        var currentXaml = row?.GetAttributeValue<string>("xaml");
        var reading = currentXaml is null ? null : ProcessXamlReader.Read(currentXaml);
        if (spec.Steps is null && row is null) throw Invalid($"Process {name} does not exist yet; a new process needs steps.");
        if (spec.Steps is not null && reading is { Problems.Count: > 0 })
            throw Invalid($"{name} has what process_apply cannot write back: {string.Join(" ", reading.Problems)} Change it in the classic designer.");
        if (spec.Kind == ProcessKind.Workflow && spec.Arguments is { Count: > 0 }) throw Invalid("arguments are for actions.");

        var id = row?.Id ?? NewId(name, table);
        var wanted = await WantedAsync(spec, name, table, primary.SchemaName ?? table, solution, row, context, ct);
        string xaml;
        if (spec.Steps is null)
        {
            xaml = currentXaml ?? "";
        }
        else
        {
            var catalog = await CatalogAsync(spec, table, primary, wanted.Mode, reading, context, ct);
            xaml = ProcessXamlWriter.Write(id, spec.Steps, catalog);
        }

        var definition = wanted with { Id = id, Xaml = xaml };
        var changes = new List<string>();
        if (row is null)
        {
            changes.Add(Summary(definition, spec.Steps!.Count));
        }
        else
        {
            if (spec.Steps is not null && !SameSteps(currentXaml, xaml)) changes.Add($"steps: {spec.Steps.Count} step(s), xaml sha256 {Hash(xaml)}");
            changes.AddRange(PropertyChanges(row, definition));
        }

        var activated = row?.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1;
        var steps = new List<PlanStep>();
        if (changes.Count > 0)
        {
            var publisher = solution.Publisher;
            var version = context.Capabilities.Version;
            var language = await context.BaseLanguageAsync(ct);
            var package = definition with { LanguageCode = language };
            steps.Add(new PlanStep
            {
                Op = row is null ? "createProcess" : "updateProcess",
                Target = name,
                Detail = string.Join("; ", changes) + (activated ? "; deactivated while it is saved" : "") + (definition.Activated ? "; activated after" : "; left in draft"),
                Action = (step, token) => SaveAsync(step, package, publisher, version, activated, token),
            });
        }
        else if (definition.Activated != activated)
        {
            steps.Add(new PlanStep
            {
                Op = definition.Activated ? "activateProcess" : "deactivateProcess",
                Target = name,
                SolutionAware = false,
                Action = (step, token) => SetStateAsync(step.Client, id, definition.Activated, token),
            });
        }

        var stateToken = Hash(currentXaml ?? "");
        return new Plan(steps, [], lockKeys, stateToken);
    }

    public static string LockKey(string name) => $"process:{name.ToLowerInvariant()}";

    /// <summary>A new process's id comes from its name and table, so planning twice gives the same XAML and hash.</summary>
    private static Guid NewId(string name, string table) =>
        new(MD5.HashData(Encoding.UTF8.GetBytes($"process|{table}|{name.ToLowerInvariant()}")));

    // ── What the spec asks for ───────────────────────────────────────────────

    private static async Task<ProcessDefinition> WantedAsync(
        ProcessApplySpec spec, string name, string table, string schemaName, SolutionContext solution, Entity? row, PlanContext context, CancellationToken ct)
    {
        var action = spec.Kind == ProcessKind.Action;
        if (action && (spec.Mode is not null || spec.Triggers is not null || spec.RunAs is not null))
            throw Invalid("mode, triggers and runAs are for workflows; an action runs when its message is called.");
        var mode = action ? ProcessMode.Background
            : spec.Mode ?? (row?.GetAttributeValue<OptionSetValue>("mode")?.Value == 0 ? ProcessMode.Background : ProcessMode.Realtime);
        if (mode == ProcessMode.Background && spec.RunAs is not null) throw Invalid("runAs is for real-time workflows; a background workflow runs as its owner.");

        var triggers = spec.Triggers;
        var onUpdate = triggers?.OnUpdate?.Select(c => c.Trim().ToLowerInvariant()).Where(c => c.Length > 0).Distinct().ToList()
            ?? (row?.GetAttributeValue<string>("triggeronupdateattributelist") is { Length: > 0 } list ? [.. list.Split(',')] : []);
        if (triggers?.OnUpdate is { Count: 0 }) onUpdate = [];
        if (onUpdate.Count > 0)
        {
            var metadata = await context.Metadata.TableAsync(table, ct);
            foreach (var column in onUpdate)
            {
                if (metadata?.Attributes?.Any(a => a.LogicalName == column) != true) throw Invalid($"triggers.onUpdate: {table} has no column {column}.");
            }
        }

        string? uniqueName = null;
        Guid? messageId = null;
        if (action)
        {
            var currentMessage = row is null ? null : await MessageNameAsync(context.Client, row, ct);
            var given = spec.UniqueName?.Trim();
            var wantedName = given ?? currentMessage ?? $"{solution.Prefix}_{Pascal(name)}";
            if (currentMessage is not null && !string.Equals(currentMessage, wantedName, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"{name} has the message {currentMessage}; uniqueName cannot change.");
            var prefix = $"{solution.Prefix}_";
            if (currentMessage is null && !wantedName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"uniqueName must start with the publisher prefix {prefix}, for example {prefix}{Pascal(name)}.");
            var separator = wantedName.IndexOf('_');
            uniqueName = wantedName[(separator + 1)..];
            if (uniqueName.Length == 0 || !uniqueName.All(char.IsAsciiLetterOrDigit))
                throw Invalid($"uniqueName {wantedName}: after the prefix use letters and digits only.");
            messageId = row?.GetAttributeValue<EntityReference>("sdkmessageid")?.Id;
        }

        var activated = spec.State switch
        {
            ProcessState.Activated => true,
            ProcessState.Draft => false,
            _ => row is null || row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1,
        };

        return new ProcessDefinition
        {
            Id = Guid.Empty,
            Name = name,
            Kind = spec.Kind,
            PrimaryEntity = schemaName,
            Xaml = "",
            Mode = mode,
            OnDemand = !action && (triggers?.OnDemand ?? row?.GetAttributeValue<bool?>("ondemand") ?? (triggers is null)),
            AsChild = !action && (triggers?.AsChild ?? row?.GetAttributeValue<bool?>("subprocess") ?? false),
            OnCreate = !action && (triggers?.OnCreate ?? row?.GetAttributeValue<bool?>("triggeroncreate") ?? false),
            OnUpdate = action ? [] : onUpdate,
            RunAs = mode == ProcessMode.Realtime && !action
                ? spec.RunAs ?? (row?.GetAttributeValue<OptionSetValue>("runas")?.Value == 1 ? ProcessRunAs.User : ProcessRunAs.Owner)
                : ProcessRunAs.Owner,
            Activated = activated,
            Description = spec.Description ?? row?.GetAttributeValue<string>("description"),
            UniqueName = uniqueName,
            SdkMessageId = messageId,
        };
    }

    private static IEnumerable<string> PropertyChanges(Entity row, ProcessDefinition wanted)
    {
        var mode = row.GetAttributeValue<OptionSetValue>("mode")?.Value == 1 ? ProcessMode.Realtime : ProcessMode.Background;
        if (wanted.Kind == ProcessKind.Workflow && mode != wanted.Mode) yield return $"mode {ModeName(wanted.Mode)}";
        if (wanted.Kind == ProcessKind.Workflow)
        {
            if ((row.GetAttributeValue<bool?>("ondemand") ?? false) != wanted.OnDemand) yield return $"on demand {Yes(wanted.OnDemand)}";
            if ((row.GetAttributeValue<bool?>("subprocess") ?? false) != wanted.AsChild) yield return $"as child {Yes(wanted.AsChild)}";
            if ((row.GetAttributeValue<bool?>("triggeroncreate") ?? false) != wanted.OnCreate) yield return $"on create {Yes(wanted.OnCreate)}";
            var update = row.GetAttributeValue<string>("triggeronupdateattributelist") ?? "";
            if (!string.Equals(update, string.Join(",", wanted.OnUpdate), StringComparison.OrdinalIgnoreCase))
                yield return $"on update {(wanted.OnUpdate.Count == 0 ? "no" : string.Join(", ", wanted.OnUpdate))}";
            if (wanted.Mode == ProcessMode.Realtime)
            {
                var runAs = row.GetAttributeValue<OptionSetValue>("runas")?.Value == 1 ? ProcessRunAs.User : ProcessRunAs.Owner;
                if (runAs != wanted.RunAs) yield return $"runs as {(wanted.RunAs == ProcessRunAs.User ? "the user who made the change" : "the owner")}";
            }
        }

        if ((row.GetAttributeValue<string>("description") ?? "") != (wanted.Description ?? "")) yield return "description";
    }

    private static string Summary(ProcessDefinition process, int steps)
    {
        var parts = new List<string> { $"{KindName(process.Kind)} on {process.PrimaryEntity.ToLowerInvariant()}" };
        if (process.Kind == ProcessKind.Workflow)
        {
            parts.Add(ModeName(process.Mode));
            var triggers = new List<string>();
            if (process.OnDemand) triggers.Add("on demand");
            if (process.AsChild) triggers.Add("as child");
            if (process.OnCreate) triggers.Add("on create");
            if (process.OnUpdate.Count > 0) triggers.Add($"on update of {string.Join(", ", process.OnUpdate)}");
            parts.Add($"starts {(triggers.Count == 0 ? "never (no trigger)" : string.Join(", ", triggers))}");
            if (process.Mode == ProcessMode.Realtime) parts.Add(process.RunAs == ProcessRunAs.User ? "runs as the user" : "runs as the owner");
        }
        else
        {
            parts.Add($"message {process.UniqueName}");
        }

        parts.Add($"{steps} step(s), xaml sha256 {Hash(process.Xaml)}");
        return string.Join("; ", parts);
    }

    /// <summary>Same steps when both read back the same, so numbering and spelling the designer varies do not count.</summary>
    private static bool SameSteps(string? current, string wanted)
    {
        if (current is null) return false;
        var a = ProcessXamlReader.Read(current);
        var b = ProcessXamlReader.Read(wanted);
        return a.Steps.ToJsonString() == b.Steps.ToJsonString()
            && JsonSerializer.Serialize(a.Arguments) == JsonSerializer.Serialize(b.Arguments);
    }

    // ── What the steps need from the environment ─────────────────────────────

    private static async Task<ProcessCatalog> CatalogAsync(
        ProcessApplySpec spec, string table, Microsoft.Xrm.Sdk.Metadata.EntityMetadata primary, ProcessMode mode, ProcessReading? reading, PlanContext context, CancellationToken ct)
    {
        var catalog = new ProcessCatalog { Table = table, Kind = spec.Kind, Mode = mode };
        catalog.Tables[table] = primary;
        var uses = new Uses();
        uses.Collect(spec.Steps!);

        foreach (var lookup in uses.Lookups)
        {
            var target = catalog.LookupTarget(lookup, $"lookup {lookup}");
            await AddTableAsync(catalog, target, context, ct);
        }

        foreach (var created in uses.Tables) await AddTableAsync(catalog, created, context, ct);
        if (uses.Email) await AddTableAsync(catalog, "email", context, ct);

        if (spec.Kind == ProcessKind.Action)
        {
            foreach (var argument in spec.Arguments ?? reading?.Arguments ?? [])
            {
                if (argument.Name is "Target" or "InputEntities" or "CreatedEntities") throw Invalid($"argument name {argument.Name} is reserved.");
                if (argument.Type == ProcessArgumentType.EntityReference && string.IsNullOrWhiteSpace(argument.Table))
                    throw Invalid($"argument {argument.Name}: an entityReference argument needs table.");
                catalog.Arguments.Add(argument);
            }
        }

        if (uses.ChildWorkflows.Count > 0) await ChildWorkflowsAsync(context.Client, table, uses.ChildWorkflows, catalog, ct);
        if (uses.Actions.Count > 0) await MessagesAsync(context.Client, uses.Actions, catalog, ct);
        if (uses.CustomTypes.Count > 0) await CustomTypesAsync(context.Client, uses.CustomTypes, catalog, ct);
        if (reading is not null)
        {
            foreach (var (step, element) in reading.Keeps) catalog.Keeps[step] = element;
            catalog.WorkflowVariables.AddRange(reading.WorkflowVariables);
        }

        return catalog;
    }

    private static async Task AddTableAsync(ProcessCatalog catalog, string table, PlanContext context, CancellationToken ct)
    {
        table = table.Trim().ToLowerInvariant();
        if (catalog.Tables.ContainsKey(table)) return;
        if (await context.Metadata.TableAsync(table, ct) is { } metadata) catalog.Tables[table] = metadata;
    }

    private static async Task ChildWorkflowsAsync(IAgentClient client, string table, HashSet<string> wanted, ProcessCatalog catalog, CancellationToken ct)
    {
        var query = new QueryExpression("workflow") { NoLock = true, ColumnSet = new ColumnSet("name", "workflowid") };
        query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
        query.Criteria.AddCondition("category", ConditionOperator.Equal, WorkflowCategory);
        query.Criteria.AddCondition("subprocess", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("primaryentity", ConditionOperator.Equal, table);
        foreach (var found in (await client.RetrieveMultipleAsync(query, ct)).Entities)
        {
            if (found.GetAttributeValue<string>("name") is { } childName && wanted.Contains(childName))
            {
                if (catalog.ChildWorkflows.TryGetValue(childName, out var other) && other != found.Id)
                    throw Invalid($"More than one child workflow on {table} is named {childName}; give its id.");
                catalog.ChildWorkflows[childName] = found.Id;
            }

            catalog.ChildWorkflows[found.Id.ToString("D")] = found.Id;
        }
    }

    private static async Task MessagesAsync(IAgentClient client, HashSet<string> names, ProcessCatalog catalog, CancellationToken ct)
    {
        var messages = new QueryExpression("sdkmessage") { NoLock = true, ColumnSet = new ColumnSet("name") };
        messages.Criteria.AddCondition("name", ConditionOperator.In, names.Cast<object>().ToArray());
        var found = (await client.RetrieveMultipleAsync(messages, ct)).Entities;
        if (found.Count == 0) return;

        var actions = new QueryExpression("workflow") { NoLock = true, ColumnSet = new ColumnSet("primaryentity", "sdkmessageid") };
        actions.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
        actions.Criteria.AddCondition("category", ConditionOperator.Equal, ActionCategory);
        actions.Criteria.AddCondition("statecode", ConditionOperator.Equal, 1);
        actions.Criteria.AddCondition("sdkmessageid", ConditionOperator.In, found.Select(m => (object)m.Id).ToArray());
        foreach (var action in (await client.RetrieveMultipleAsync(actions, ct)).Entities)
        {
            var message = found.First(m => m.Id == action.GetAttributeValue<EntityReference>("sdkmessageid")?.Id);
            var bound = action.GetAttributeValue<string>("primaryentity");
            catalog.Messages[message.GetAttributeValue<string>("name")] = (message.Id, bound is null or "none" ? null : bound);
        }
    }

    private static async Task CustomTypesAsync(IAgentClient client, HashSet<string> types, ProcessCatalog catalog, CancellationToken ct)
    {
        var query = new QueryExpression("plugintype")
        {
            NoLock = true,
            ColumnSet = new ColumnSet("typename", "assemblyname", "version", "culture", "publickeytoken"),
        };
        query.Criteria.AddCondition("typename", ConditionOperator.In, types.Cast<object>().ToArray());
        query.Criteria.AddCondition("isworkflowactivity", ConditionOperator.Equal, true);
        foreach (var type in (await client.RetrieveMultipleAsync(query, ct)).Entities)
        {
            var typeName = type.GetAttributeValue<string>("typename");
            var culture = type.GetAttributeValue<string>("culture") is { Length: > 0 } c ? c : "neutral";
            var token = type.GetAttributeValue<string>("publickeytoken") is { Length: > 0 } t ? t : "null";
            catalog.CustomTypes[typeName] =
                $"{typeName}, {type.GetAttributeValue<string>("assemblyname")}, Version={type.GetAttributeValue<string>("version")}, Culture={culture}, PublicKeyToken={token}";
        }
    }

    private static async Task<string?> MessageNameAsync(IAgentClient client, Entity row, CancellationToken ct)
    {
        if (row.GetAttributeValue<EntityReference>("sdkmessageid") is not { } message) return null;
        var found = await client.RetrieveAsync("sdkmessage", message.Id, new ColumnSet("name"), ct);
        return found.GetAttributeValue<string>("name");
    }

    /// <summary>The lookups, tables, child workflows, actions and custom steps the steps name.</summary>
    private sealed class Uses
    {
        public HashSet<string> Lookups { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> ChildWorkflows { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> Actions { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> CustomTypes { get; } = new(StringComparer.Ordinal);
        public bool Email { get; private set; }

        public void Collect(IEnumerable<ProcessStep>? steps)
        {
            foreach (var step in steps ?? [])
            {
                Record(step.Update?.Record);
                Values(step.Update?.Values?.Values);
                if (step.Create is { } create)
                {
                    Tables.Add(create.Table);
                    Values(create.Values?.Values);
                }

                if (step.SendEmail is { } email)
                {
                    Email = true;
                    Values([.. Optional(email.From), .. email.To ?? [], .. email.Cc ?? [], email.Subject, .. Optional(email.Body), .. Optional(email.Regarding)]);
                    Values(email.Values?.Values);
                }

                if (step.Assign is { } assign)
                {
                    Record(assign.Record);
                    Values([assign.Owner]);
                }

                Record(step.SetState?.Record);
                if (step.ChildWorkflow is { } child) ChildWorkflows.Add(child.Trim());
                if (step.Action is { } action)
                {
                    Actions.Add(action.Name.Trim());
                    Record(action.Record);
                }

                if (step.CustomActivity is { } custom)
                {
                    CustomTypes.Add(custom.Type.Trim());
                    Values(custom.Inputs?.Select(i => i.Value));
                }

                if (step.If is { } branch)
                {
                    Condition(branch.Condition);
                    Collect(branch.Then);
                    foreach (var elseIf in branch.ElseIf ?? [])
                    {
                        Condition(elseIf.Condition);
                        Collect(elseIf.Then);
                    }

                    Collect(branch.Else);
                }
            }
        }

        private static IEnumerable<JsonElement> Optional(JsonElement? value) => value is { } v ? [v] : [];

        private void Record(string? record)
        {
            if (!string.IsNullOrWhiteSpace(record) && !string.Equals(record.Trim(), "primary", StringComparison.OrdinalIgnoreCase)) Lookups.Add(record.Trim());
        }

        private void Condition(ProcessCondition? condition)
        {
            if (condition is null) return;
            Record(condition.From);
            foreach (var part in (condition.All ?? []).Concat(condition.Any ?? [])) Condition(part);
        }

        private void Values(IEnumerable<JsonElement>? values)
        {
            foreach (var value in values ?? [])
            {
                if (value.ValueKind != JsonValueKind.Object) continue;
                if (value.TryGetProperty("from", out var from) && from.ValueKind == JsonValueKind.String) Record(from.GetString());
                if (value.TryGetProperty("concat", out var parts) && parts.ValueKind == JsonValueKind.Array) Values(parts.EnumerateArray().ToList());
            }
        }
    }

    // ── Saving ───────────────────────────────────────────────────────────────

    private async Task SaveAsync(StepContext step, ProcessDefinition process, PublisherInfo publisher, string version, bool wasActivated, CancellationToken ct)
    {
        var client = step.Client;
        var packageName = $"{PackagePrefix}{process.Id:N}";
        // An activated process is saved in draft, as the designer does; the import activates it again when asked.
        if (wasActivated) await SetStateAsync(client, process.Id, activate: false, ct);
        try
        {
            var file = ProcessPackage.Build(packageName, publisher, version, process);
            var outcome = await new AsyncJobs(client, delay, pollInterval).ImportAsync(file, new ImportOptions(PublishWorkflows: process.Activated), null, ct);
            if (!outcome.Succeeded)
                throw new AgentProblemException(new AgentProblem(StatusCodes.Status502BadGateway, "DataverseFault", $"Saving {process.Name} failed: {outcome.Message}"));
        }
        catch when (wasActivated)
        {
            await SetStateAsync(client, process.Id, activate: true, CancellationToken.None);
            throw;
        }
        finally
        {
            await DeletePackageAsync(client, packageName, CancellationToken.None);
        }

        await WebResourcePlanner.AddToSolutionAsync(step, process.Id, ComponentKinds.WorkflowType, ct);
        var saved = await client.RetrieveAsync("workflow", process.Id, new ColumnSet("statecode"), ct);
        if ((saved.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1) != process.Activated)
            await SetStateAsync(client, process.Id, process.Activated, ct);
    }

    /// <summary>Deletes the temporary solution; the process it brought in stays.</summary>
    private static async Task DeletePackageAsync(IAgentClient client, string packageName, CancellationToken ct)
    {
        var query = new QueryExpression("solution") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("solutionid") };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, packageName);
        foreach (var found in (await client.RetrieveMultipleAsync(query, ct)).Entities) await client.DeleteAsync("solution", found.Id, ct);
    }

    private static Task SetStateAsync(IAgentClient client, Guid id, bool activate, CancellationToken ct) =>
        client.ExecuteAsync(new SetStateRequest
        {
            EntityMoniker = new EntityReference("workflow", id),
            State = new OptionSetValue(activate ? 1 : 0),
            Status = new OptionSetValue(activate ? 2 : 1),
        }, ct);

    // ── Reading a process back ───────────────────────────────────────────────

    /// <summary>
    /// The process in the shape process_apply takes (without solution), for inspect_solution kind process. Child
    /// workflows are named when names are given, so the result can be changed and sent back.
    /// </summary>
    public static Dictionary<string, object?> Describe(Entity row, IReadOnlyDictionary<Guid, string>? childNames = null, string? messageName = null)
    {
        var category = row.GetAttributeValue<OptionSetValue>("category")?.Value;
        var result = new Dictionary<string, object?>
        {
            ["name"] = row.GetAttributeValue<string>("name"),
            ["kind"] = category == ActionCategory ? "action" : category == WorkflowCategory ? "workflow" : CategoryName(category),
            ["table"] = row.GetAttributeValue<string>("primaryentity"),
        };
        if (row.GetAttributeValue<string>("description") is { Length: > 0 } description) result["description"] = description;
        if (category is not (WorkflowCategory or ActionCategory))
        {
            result["note"] = "process_apply writes only classic workflows and actions.";
            return result;
        }

        if (category == WorkflowCategory)
        {
            var realtime = row.GetAttributeValue<OptionSetValue>("mode")?.Value == 1;
            result["mode"] = realtime ? "realtime" : "background";
            var triggers = new Dictionary<string, object?>
            {
                ["onDemand"] = row.GetAttributeValue<bool?>("ondemand") ?? false,
                ["asChild"] = row.GetAttributeValue<bool?>("subprocess") ?? false,
                ["onCreate"] = row.GetAttributeValue<bool?>("triggeroncreate") ?? false,
            };
            if (row.GetAttributeValue<string>("triggeronupdateattributelist") is { Length: > 0 } update) triggers["onUpdate"] = update.Split(',');
            if (row.GetAttributeValue<bool?>("triggerondelete") == true) result["note"] = "It also starts on delete, which process_apply does not write yet; saving it from process_apply drops that trigger.";
            result["triggers"] = triggers;
            if (realtime) result["runAs"] = row.GetAttributeValue<OptionSetValue>("runas")?.Value == 1 ? "user" : "owner";
        }
        else if (messageName is not null)
        {
            result["uniqueName"] = messageName;
        }

        var reading = ProcessXamlReader.Read(row.GetAttributeValue<string>("xaml") ?? "");
        if (category == ActionCategory) result["arguments"] = JsonSerializer.SerializeToElement(reading.Arguments, JsonSerializerOptions.Web);
        if (childNames is not null) NameChildren(reading.Steps, childNames);
        result["steps"] = JsonSerializer.Deserialize<JsonElement>(reading.Steps.ToJsonString());
        result["state"] = row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1 ? "activated" : "draft";
        if (reading.Problems.Count > 0) result["problems"] = reading.Problems;
        return result;
    }

    private static void NameChildren(JsonNode? node, IReadOnlyDictionary<Guid, string> names)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj["childWorkflow"] is JsonValue value && Guid.TryParse(value.GetValue<string>(), out var id) && names.TryGetValue(id, out var name))
                    obj["childWorkflow"] = name;
                foreach (var (_, child) in obj.ToList()) NameChildren(child, names);
                break;
            case JsonArray array:
                foreach (var child in array) NameChildren(child, names);
                break;
        }
    }

    /// <summary>"Notify applicant" becomes NotifyApplicant.</summary>
    private static string Pascal(string name)
    {
        var words = System.Text.RegularExpressions.Regex.Split(name, "[^A-Za-z0-9]+").Where(w => w.Length > 0);
        var joined = string.Concat(words.Select(w => char.ToUpperInvariant(w[0]) + w[1..]));
        return joined.Length == 0 ? "Action" : joined;
    }

    private static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..12];

    private static string KindName(ProcessKind kind) => kind == ProcessKind.Action ? "custom process action" : "classic workflow";

    private static string ModeName(ProcessMode mode) => mode == ProcessMode.Realtime ? "real-time" : "background";

    private static string Yes(bool value) => value ? "yes" : "no";

    private static string CategoryName(int? category) => category switch
    {
        1 => "dialog",
        2 => "business rule",
        4 => "business process flow",
        5 => "cloud flow",
        6 => "desktop flow",
        _ => $"process of category {category}",
    };

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
