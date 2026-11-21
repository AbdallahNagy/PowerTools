using System.ComponentModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Choices;

[Description("The desired state of a global choice. Options left out are kept.")]
public sealed class ChoiceApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the changes go into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    [Description("Name of the global choice with the publisher prefix, for example con_priority.")]
    public required string Name { get; init; }

    [Description("Needed for a new choice.")]
    public string? DisplayName { get; init; }

    public string? Description { get; init; }

    [Description("Options. One without a value is matched by its label; a new one gets the next value from the publisher's prefix.")]
    public List<ChoiceOption>? Options { get; init; }

    [Description("Order the options as listed (options not listed come after them).")]
    public bool? Ordered { get; init; }
}

public sealed class ChoiceOption
{
    public int? Value { get; init; }

    public required string Label { get; init; }

    public string? Description { get; init; }

    [Description("Color as #RRGGBB.")]
    public string? Color { get; init; }
}

/// <summary>
/// Plans choice_apply: creates a global choice or brings its label, options (label, description, color) and order to
/// the spec. Options the spec leaves out are kept; removing one goes through remove kind choiceoption.
/// </summary>
public sealed class ChoicePlanner : IComponentPlanner<ChoiceApplySpec>
{
    public const string Family = "choice";

    public async Task<Plan> PlanAsync(ChoiceApplySpec spec, PlanContext context, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(spec.Name)) throw Invalid("name is required.");
        var options = spec.Options ?? [];
        foreach (var option in options)
        {
            if (string.IsNullOrWhiteSpace(option.Label)) throw Invalid("Every option needs a label.");
            if (option.Color is { } color && !System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9A-Fa-f]{6}$"))
                throw Invalid($"Option '{option.Label}': color must look like #1A2B3C.");
        }

        Duplicates(options.Select(o => o.Label), "label");
        Duplicates(options.Where(o => o.Value is not null).Select(o => o.Value!.Value.ToString()), "value");

        var solution = await context.SolutionAsync(spec.Solution, ct);
        var language = await context.BaseLanguageAsync(ct);
        var name = spec.Name.Trim().ToLowerInvariant();
        var current = await ReadAsync(context.Client, name, ct);
        var steps = new List<PlanStep>();
        var publish = new[] { new PublishTarget(PublishKind.OptionSet, name) };

        if (current is null)
        {
            if (solution.CheckSchemaName(spec.Name.Trim()) is { } problem) throw new AgentProblemException(problem);
            if (string.IsNullOrWhiteSpace(spec.DisplayName)) throw Invalid($"Choice {name} does not exist yet; a new choice needs displayName.");
            var set = new OptionSetMetadata
            {
                Name = name,
                IsGlobal = true,
                OptionSetType = OptionSetType.Picklist,
                DisplayName = Labels.Make(spec.DisplayName, language),
                Description = Labels.Make(spec.Description ?? "", language),
            };
            var next = NextValue(solution, options.Select(o => o.Value).OfType<int>());
            foreach (var option in options)
            {
                var value = option.Value ?? next();
                set.Options.Add(new OptionMetadata(Labels.Make(option.Label, language), value)
                {
                    Description = option.Description is null ? null : Labels.Make(option.Description, language),
                    Color = option.Color,
                });
            }

            steps.Add(new PlanStep
            {
                Op = "createChoice",
                Target = name,
                Detail = $"label {spec.DisplayName}; options {string.Join(", ", set.Options.Select(o => $"{o.Value} {Labels.Text(o.Label, language)}{(o.Color is null ? "" : $" {o.Color}")}"))}",
                Request = new CreateOptionSetRequest { OptionSet = set },
                Publishes = publish,
            });
            return new Plan(steps, lockKeys: [LockKey(name)]);
        }

        if (current.IsCustomizable?.Value == false)
            return new Plan([PlanStep.Blocked("updateChoice", name, $"Choice {name} is managed and not customizable.")], lockKeys: [LockKey(name)]);

        var labelChanged = spec.DisplayName is { } display && !Labels.Matches(current.DisplayName, display, language);
        var descriptionChanged = spec.Description is { } description && !Labels.Matches(current.Description, description, language);
        if (labelChanged || descriptionChanged)
        {
            steps.Add(new PlanStep
            {
                Op = "updateChoice",
                Target = name,
                Detail = string.Join("; ", new[]
                {
                    labelChanged ? $"label {Labels.Text(current.DisplayName, language)} → {spec.DisplayName}" : null,
                    descriptionChanged ? $"description → {spec.Description}" : null,
                }.Where(s => s is not null)),
                Request = new UpdateOptionSetRequest
                {
                    OptionSet = new OptionSetMetadata
                    {
                        Name = name,
                        IsGlobal = true,
                        DisplayName = labelChanged ? Labels.Make(spec.DisplayName!, language) : current.DisplayName,
                        Description = descriptionChanged ? Labels.Make(spec.Description!, language) : current.Description,
                    },
                    MergeLabels = true,
                },
                Publishes = publish,
            });
        }

        var existing = current.Options.ToList();
        var nextValue = NextValue(solution, existing.Select(o => o.Value).OfType<int>().Concat(options.Select(o => o.Value).OfType<int>()));
        var wantedOrder = new List<int>();
        foreach (var option in options)
        {
            var found = option.Value is { } value
                ? existing.FirstOrDefault(o => o.Value == value)
                : existing.FirstOrDefault(o => string.Equals(Labels.Text(o.Label, language), option.Label, StringComparison.Ordinal));
            if (found is null)
            {
                var added = option.Value ?? nextValue();
                wantedOrder.Add(added);
                steps.Add(new PlanStep
                {
                    Op = "addOption",
                    Target = $"{name} {added}",
                    Detail = $"{option.Label}{(option.Color is null ? "" : $" {option.Color}")}{(option.Description is null ? "" : $"; {option.Description}")}",
                    Request = WithColor(new InsertOptionValueRequest
                    {
                        OptionSetName = name,
                        Value = added,
                        Label = Labels.Make(option.Label, language),
                        Description = option.Description is null ? null : Labels.Make(option.Description, language),
                    }, option.Color),
                    Publishes = publish,
                });
                continue;
            }

            wantedOrder.Add(found.Value!.Value);
            var changes = new List<string>();
            if (!Labels.Matches(found.Label, option.Label, language)) changes.Add($"label {Labels.Text(found.Label, language)} → {option.Label}");
            if (option.Description is not null && !Labels.Matches(found.Description, option.Description, language)) changes.Add($"description → {option.Description}");
            if (option.Color is not null && !string.Equals(found.Color, option.Color, StringComparison.OrdinalIgnoreCase)) changes.Add($"color {found.Color ?? "none"} → {option.Color}");
            if (changes.Count == 0) continue;
            if (found.IsManaged == true && current.IsCustomizable?.Value == false)
            {
                steps.Add(PlanStep.Blocked("updateOption", $"{name} {found.Value}", "The option is managed and cannot change."));
                continue;
            }

            steps.Add(new PlanStep
            {
                Op = "updateOption",
                Target = $"{name} {found.Value}",
                Detail = string.Join("; ", changes),
                Request = WithColor(new UpdateOptionValueRequest
                {
                    OptionSetName = name,
                    Value = found.Value!.Value,
                    Label = Labels.Make(option.Label, language),
                    Description = option.Description is null ? null : Labels.Make(option.Description, language),
                    MergeLabels = true,
                }, option.Color),
                Publishes = publish,
            });
        }

        if (spec.Ordered == true)
        {
            var rest = existing.Select(o => o.Value!.Value).Where(v => !wantedOrder.Contains(v));
            var order = wantedOrder.Concat(rest).ToArray();
            var now = existing.Select(o => o.Value!.Value).ToArray();
            if (!order.SequenceEqual(now))
            {
                steps.Add(new PlanStep
                {
                    Op = "orderOptions",
                    Target = name,
                    Detail = string.Join(", ", order),
                    Request = new OrderOptionRequest { OptionSetName = name, Values = order },
                    Publishes = publish,
                });
            }
        }

        return new Plan(steps, lockKeys: [LockKey(name)]);
    }

    public static string LockKey(string name) => $"optionset:{name}";

    /// <summary>The option messages take a color as a parameter the SDK classes do not expose.</summary>
    internal static OrganizationRequest WithColor(OrganizationRequest request, string? color)
    {
        if (color is not null) request.Parameters["Color"] = color;
        return request;
    }

    /// <summary>The global choice, or null when it does not exist.</summary>
    internal static async Task<OptionSetMetadata?> ReadAsync(IAgentClient client, string name, CancellationToken ct)
    {
        try
        {
            var response = (RetrieveOptionSetResponse)await client.ExecuteAsync(new RetrieveOptionSetRequest { Name = name, RetrieveAsIfPublished = true }, ct);
            return response.OptionSetMetadata as OptionSetMetadata;
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            return null;
        }
    }

    /// <summary>Hands out free values from the publisher's option value prefix (prefix × 10000 upwards).</summary>
    internal static Func<int> NextValue(SolutionContext solution, IEnumerable<int> used)
    {
        var taken = used.ToHashSet();
        var next = checked(solution.OptionValuePrefix * 10000);
        return () =>
        {
            while (taken.Contains(next)) next++;
            taken.Add(next);
            return next;
        };
    }

    private static void Duplicates(IEnumerable<string> values, string what)
    {
        var duplicate = values.GroupBy(v => v, StringComparer.Ordinal).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null) throw Invalid($"Two options have the {what} '{duplicate.Key}'.");
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
