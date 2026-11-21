using System.ComponentModel;
using System.Text.RegularExpressions;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Solutions;

[Description("The desired state of a solution: its publisher, the solution, a patch, the components in it, and a roll-up of its patches.")]
public sealed class SolutionApplySpec : IApplySpec
{
    [Description("A publisher to create or update.")]
    public PublisherDefinition? Publisher { get; init; }

    public required SolutionDefinition Solution { get; init; }

    [Description("Components that must be in the solution. Components already in it are skipped; none are removed.")]
    public List<SolutionComponentDefinition>? Components { get; init; }

    [Description("A patch of the solution with this version. Created when the solution has none with it.")]
    public PatchDefinition? Patch { get; init; }

    [Description("Destructive: rolls the solution's patches into it with a new version (clone). The patches are deleted.")]
    public RollUpDefinition? RollUp { get; init; }

    string? IApplySpec.Solution => null;
}

public sealed class PublisherDefinition
{
    public required string UniqueName { get; init; }

    public string? DisplayName { get; init; }

    [Description("Customization prefix, 2 to 8 letters or digits, starting with a letter.")]
    public string? Prefix { get; init; }

    [Description("Option value prefix, 10000 to 99999.")]
    public int? OptionValuePrefix { get; init; }

    public string? Description { get; init; }
}

public sealed class SolutionDefinition
{
    public required string UniqueName { get; init; }

    [Description("Needed for a new solution.")]
    public string? DisplayName { get; init; }

    [Description("Unique name of the publisher. Needed for a new solution; fixed afterwards.")]
    public string? Publisher { get; init; }

    [Description("Like 1.0.0.0.")]
    public string? Version { get; init; }

    public string? Description { get; init; }
}

public sealed class SolutionComponentDefinition
{
    public required ComponentKind Kind { get; init; }

    [Description("Logical, unique or schema name (by kind), or the id.")]
    public required string Name { get; init; }

    [Description("Table logical name, for column, key, form and view.")]
    public string? Table { get; init; }

    [Description("Also add the components it needs. Default false.")]
    public bool? AddRequired { get; init; }
}

public sealed class PatchDefinition
{
    [Description("The patch version, same major and minor as the solution, for example 1.0.1.0.")]
    public required string Version { get; init; }

    public string? DisplayName { get; init; }
}

public sealed class RollUpDefinition
{
    [Description("The solution's new version, for example 2.0.0.0.")]
    public required string Version { get; init; }

    public string? DisplayName { get; init; }
}

/// <summary>
/// Plans solution_apply in this order: publisher, solution, patch, components, roll-up. Every check reads the
/// environment, so a spec sent again plans nothing.
/// </summary>
public sealed partial class SolutionPlanner : IComponentPlanner<SolutionApplySpec>
{
    public const string Family = "solution";

    [GeneratedRegex(@"^\d+\.\d+\.\d+\.\d+$")]
    private static partial Regex VersionPattern();

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex UniqueNamePattern();

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9]{1,7}$")]
    private static partial Regex PrefixPattern();

    private static readonly HashSet<string> SystemSolutions = new(StringComparer.OrdinalIgnoreCase) { "Default", "Active", "Basic" };

    public async Task<Plan> PlanAsync(SolutionApplySpec spec, PlanContext context, CancellationToken ct)
    {
        Validate(spec);
        var client = context.Client;
        var steps = new List<PlanStep>();
        var name = spec.Solution.UniqueName.Trim();
        var locks = new List<string> { $"solution:{name.ToLowerInvariant()}" };

        if (spec.Publisher is { } publisher) await PublisherAsync(client, publisher, steps, ct);

        var solution = await FindSolutionAsync(client, name, ct);
        if (solution is null)
        {
            var publisherName = spec.Solution.Publisher ?? spec.Publisher?.UniqueName
                ?? throw Invalid($"Solution {name} does not exist yet; a new solution needs solution.publisher.");
            if (string.IsNullOrWhiteSpace(spec.Solution.DisplayName)) throw Invalid($"Solution {name} does not exist yet; a new solution needs displayName.");
            var publisherRow = await FindAsync(client, "publisher", "uniquename", publisherName, ct);
            if (publisherRow is null && !string.Equals(publisherName, spec.Publisher?.UniqueName, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"Publisher {publisherName} does not exist. Give publisher to create it.");
            var version = spec.Solution.Version ?? "1.0.0.0";
            steps.Add(new PlanStep
            {
                Op = "createSolution",
                Target = name,
                Detail = $"{spec.Solution.DisplayName}; publisher {publisherName}; version {version}{(spec.Solution.Description is null ? "" : $"; {spec.Solution.Description}")}",
                SolutionAware = false,
                Action = async (step, token) =>
                {
                    var owner = await FindAsync(step.Client, "publisher", "uniquename", publisherName, token)
                        ?? throw Invalid($"Publisher {publisherName} does not exist.");
                    var row = new Entity("solution")
                    {
                        ["uniquename"] = name,
                        ["friendlyname"] = spec.Solution.DisplayName,
                        ["version"] = version,
                        ["publisherid"] = owner.ToEntityReference(),
                    };
                    if (spec.Solution.Description is not null) row["description"] = spec.Solution.Description;
                    step.Ids.Add((await step.Client.CreateAsync(row, token)).ToString("D"));
                },
            });
        }
        else
        {
            if (solution.GetAttributeValue<bool?>("ismanaged") == true)
                return new Plan([PlanStep.Blocked("updateSolution", name, $"Solution {name} is managed; it can only change by importing a new version.")], lockKeys: locks);
            if (SystemSolutions.Contains(name) || solution.GetAttributeValue<EntityReference>("parentsolutionid") is not null)
                throw Invalid($"Solution {name} is a system solution or a patch; apply its parent solution instead.");

            var update = new Entity("solution", solution.Id);
            var changes = new List<string>();
            Compare(solution, update, changes, "friendlyname", spec.Solution.DisplayName, "name");
            Compare(solution, update, changes, "version", spec.Solution.Version, "version");
            Compare(solution, update, changes, "description", spec.Solution.Description, "description");
            if (spec.Solution.Publisher is { } wanted
                && solution.GetAttributeValue<EntityReference>("publisherid") is { } owner
                && await client.RetrieveAsync("publisher", owner.Id, new ColumnSet("uniquename"), ct) is { } current
                && !string.Equals(current.GetAttributeValue<string>("uniquename"), wanted, StringComparison.OrdinalIgnoreCase))
            {
                steps.Add(PlanStep.Blocked("updateSolution", name, $"The publisher of a solution cannot change (it is {current.GetAttributeValue<string>("uniquename")})."));
            }

            if (changes.Count > 0)
            {
                steps.Add(new PlanStep
                {
                    Op = "updateSolution",
                    Target = name,
                    Detail = string.Join("; ", changes),
                    Request = new UpdateRequest { Target = update },
                    SolutionAware = false,
                });
            }
        }

        if (spec.Patch is { } patch) await PatchAsync(client, name, solution, patch, steps, ct);

        foreach (var (component, index) in (spec.Components ?? []).Select((c, i) => (c, i)))
        {
            var found = await ComponentKinds.FindAsync(client, component.Kind, component.Name, component.Table, ct);
            var label = $"{ComponentKinds.Name(component.Kind)} {found?.Label ?? component.Name}";
            if (found is null)
            {
                steps.Add(PlanStep.Blocked("addComponent", label, $"components[{index}]: {label} was not found."));
                continue;
            }

            if (found.ComponentType == 0)
            {
                steps.Add(PlanStep.Unsupported("addComponent", label, $"This environment has no solution component type for {ComponentKinds.Name(component.Kind)}."));
                continue;
            }

            if (solution is not null && await ComponentKinds.InSolutionAsync(client, solution.Id, found.Id, ct)) continue;
            steps.Add(new PlanStep
            {
                Op = "addComponent",
                Target = label,
                Detail = $"type {found.ComponentType}; id {found.Id:D}{(component.AddRequired == true ? "; with required components" : "")}",
                Request = new AddSolutionComponentRequest
                {
                    ComponentId = found.Id,
                    ComponentType = found.ComponentType,
                    SolutionUniqueName = name,
                    AddRequiredComponents = component.AddRequired ?? false,
                },
                SolutionAware = false,
            });
        }

        if (spec.RollUp is { } rollUp) await RollUpAsync(client, name, solution, rollUp, steps, ct);
        return new Plan(steps, lockKeys: locks);
    }

    private static async Task PublisherAsync(IAgentClient client, PublisherDefinition publisher, List<PlanStep> steps, CancellationToken ct)
    {
        var name = publisher.UniqueName.Trim();
        if (string.Equals(name, AgentPublishers.MicrosoftPublisher, StringComparison.OrdinalIgnoreCase))
            throw Invalid("Microsoft's publisher cannot be changed.");
        var row = await FindAsync(client, "publisher", "uniquename", name, ct);
        if (row is null)
        {
            if (publisher.Prefix is null || publisher.DisplayName is null || publisher.OptionValuePrefix is null)
                throw Invalid($"Publisher {name} does not exist yet; a new publisher needs displayName, prefix and optionValuePrefix.");
            var entity = new Entity("publisher")
            {
                ["uniquename"] = name,
                ["friendlyname"] = publisher.DisplayName,
                ["customizationprefix"] = publisher.Prefix.ToLowerInvariant(),
                ["customizationoptionvalueprefix"] = publisher.OptionValuePrefix,
            };
            if (publisher.Description is not null) entity["description"] = publisher.Description;
            steps.Add(new PlanStep
            {
                Op = "createPublisher",
                Target = name,
                Detail = $"{publisher.DisplayName}; prefix {publisher.Prefix.ToLowerInvariant()}; option values {publisher.OptionValuePrefix}",
                Request = new CreateRequest { Target = entity },
                SolutionAware = false,
            });
            return;
        }

        var update = new Entity("publisher", row.Id);
        var changes = new List<string>();
        Compare(row, update, changes, "friendlyname", publisher.DisplayName, "name");
        Compare(row, update, changes, "customizationprefix", publisher.Prefix?.ToLowerInvariant(), "prefix");
        Compare(row, update, changes, "description", publisher.Description, "description");
        if (publisher.OptionValuePrefix is { } prefix && row.GetAttributeValue<int?>("customizationoptionvalueprefix") != prefix)
        {
            update["customizationoptionvalueprefix"] = prefix;
            changes.Add($"option values {row.GetAttributeValue<int?>("customizationoptionvalueprefix")} → {prefix}");
        }

        if (changes.Count == 0) return;
        steps.Add(new PlanStep
        {
            Op = "updatePublisher",
            Target = name,
            Detail = string.Join("; ", changes),
            Request = new UpdateRequest { Target = update },
            SolutionAware = false,
        });
    }

    private static async Task PatchAsync(IAgentClient client, string name, Entity? solution, PatchDefinition patch, List<PlanStep> steps, CancellationToken ct)
    {
        if (solution is not null)
        {
            var query = new QueryExpression("solution") { NoLock = true, ColumnSet = new ColumnSet("version", "uniquename") };
            query.Criteria.AddCondition("parentsolutionid", ConditionOperator.Equal, solution.Id);
            var patches = (await client.RetrieveMultipleAsync(query, ct)).Entities;
            if (patches.Any(p => p.GetAttributeValue<string>("version") == patch.Version)) return;
        }

        steps.Add(new PlanStep
        {
            Op = "createPatch",
            Target = name,
            Detail = $"version {patch.Version}{(patch.DisplayName is null ? "" : $"; {patch.DisplayName}")}",
            SolutionAware = false,
            Action = async (step, token) =>
            {
                var response = await step.Client.ExecuteAsync(new CloneAsPatchRequest
                {
                    ParentSolutionUniqueName = name,
                    DisplayName = patch.DisplayName ?? $"{name} patch",
                    VersionNumber = patch.Version,
                }, token);
                if (response.Results.TryGetValue("SolutionId", out var id) && id is Guid guid) step.Ids.Add(guid.ToString("D"));
            },
        });
    }


    private static async Task RollUpAsync(IAgentClient client, string name, Entity? solution, RollUpDefinition rollUp, List<PlanStep> steps, CancellationToken ct)
    {
        if (solution is not null)
        {
            var query = new QueryExpression("solution") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("version") };
            query.Criteria.AddCondition("parentsolutionid", ConditionOperator.Equal, solution.Id);
            var hasPatches = (await client.RetrieveMultipleAsync(query, ct)).Entities.Count > 0;
            if (!hasPatches && solution.GetAttributeValue<string>("version") == rollUp.Version) return;
        }

        steps.Add(new PlanStep
        {
            Op = "rollUpPatches",
            Target = name,
            Effect = PlanEffect.Destructive,
            Detail = $"new version {rollUp.Version}; the patches are merged into the solution and deleted",
            SolutionAware = false,
            Request = new CloneAsSolutionRequest
            {
                ParentSolutionUniqueName = name,
                DisplayName = rollUp.DisplayName ?? solution?.GetAttributeValue<string>("friendlyname") ?? name,
                VersionNumber = rollUp.Version,
            },
        });
    }

    private static void Compare(Entity row, Entity update, List<string> changes, string column, string? wanted, string what)
    {
        if (wanted is null || string.Equals(row.GetAttributeValue<string>(column) ?? "", wanted, StringComparison.Ordinal)) return;
        update[column] = wanted;
        changes.Add($"{what} {row.GetAttributeValue<string>(column)} → {wanted}");
    }

    private static void Validate(SolutionApplySpec spec)
    {
        var name = spec.Solution?.UniqueName ?? throw Invalid("solution is required.");
        if (!UniqueNamePattern().IsMatch(name.Trim())) throw Invalid("solution.uniqueName may only hold letters, digits and underscores, and must not start with a digit.");
        foreach (var (version, what) in new[] { (spec.Solution.Version, "solution.version"), (spec.Patch?.Version, "patch.version"), (spec.RollUp?.Version, "rollUp.version") })
            if (version is not null && !VersionPattern().IsMatch(version)) throw Invalid($"{what} must look like 1.0.0.0.");
        if (spec.Publisher is { } publisher)
        {
            if (!UniqueNamePattern().IsMatch(publisher.UniqueName.Trim())) throw Invalid("publisher.uniqueName may only hold letters, digits and underscores.");
            if (publisher.Prefix is { } prefix && (!PrefixPattern().IsMatch(prefix) || prefix.StartsWith("mscrm", StringComparison.OrdinalIgnoreCase)))
                throw Invalid("publisher.prefix must be 2 to 8 letters or digits, start with a letter, and not start with mscrm.");
            if (publisher.OptionValuePrefix is < 10000 or > 99999) throw Invalid("publisher.optionValuePrefix must be from 10000 to 99999.");
        }

        if (spec.Patch is not null && spec.RollUp is not null) throw Invalid("Give patch or rollUp, not both.");
    }

    internal static async Task<Entity?> FindSolutionAsync(IAgentClient client, string name, CancellationToken ct) =>
        await FindAsync(client, "solution", "uniquename", name, ct);

    private static async Task<Entity?> FindAsync(IAgentClient client, string table, string column, string value, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition(column, ConditionOperator.Equal, value.Trim());
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
