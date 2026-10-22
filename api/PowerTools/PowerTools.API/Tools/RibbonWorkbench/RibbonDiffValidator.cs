namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>Everything validation needs for one diff.</summary>
public sealed class DiffValidationContext
{
    /// <summary>Table logical name, or <c>applicationribbon</c>.</summary>
    public required string Key { get; init; }
    public required RibbonNodeDto Diff { get; init; }
    /// <summary>The published ribbon of the table (or the application). Null when it was not read.</summary>
    public BaseRibbonDto? Base { get; init; }
    public BaseRibbonDto? ApplicationBase { get; init; }
    /// <summary>The application diff in effect: the edited one when it is part of the request, else the loaded one.</summary>
    public RibbonNodeDto? ApplicationDiff { get; init; }
    public string? PublisherPrefix { get; init; }
    /// <summary>Set when the diff must not be written, with the reason.</summary>
    public string? ReadOnlyReason { get; init; }
}

/// <summary>Checks an edited RibbonDiffXml before a slow export and import.</summary>
public static class RibbonDiffValidator
{
    public const string WebResourcePrefix = "$webresource:";
    public const string LocLabelPrefix = "$LocLabels:";

    private static readonly string[] ParameterNames =
        ["BoolParameter", "CrmParameter", "DecimalParameter", "IntParameter", "StringParameter"];

    /// <summary>Web resource names referenced by JavaScript actions and custom rules.</summary>
    public static IReadOnlySet<string> WebResources(RibbonNodeDto diff)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var node in diff.Descendants())
        {
            if (node.Name is not ("JavaScriptFunction" or "CustomRule")) continue;
            var library = node.Attr("Library");
            if (library is not null && library.StartsWith(WebResourcePrefix, StringComparison.OrdinalIgnoreCase))
            {
                var name = library[WebResourcePrefix.Length..].Trim();
                if (name.Length > 0) names.Add(name);
            }
        }

        return names;
    }

    public static IReadOnlyList<ProblemDto> Validate(DiffValidationContext context, IReadOnlySet<string> existingWebResources)
    {
        var problems = new List<ProblemDto>();
        var key = context.Key;
        void Error(string? item, string text) => problems.Add(new ProblemDto(ProblemSeverities.Error, key, item, text));
        void Warn(string? item, string text) => problems.Add(new ProblemDto(ProblemSeverities.Warning, key, item, text));

        if (context.ReadOnlyReason is { } reason)
        {
            Error(null, reason);
            return problems;
        }

        var diff = context.Diff;
        if (diff.Name != "RibbonDiffXml")
        {
            Error(null, "The command bar definition must be a RibbonDiffXml element.");
            return problems;
        }

        var commands = Section(diff, "CommandDefinitions", "CommandDefinition");
        var enableRules = Section(diff.Element("RuleDefinitions"), "EnableRules", "EnableRule");
        var displayRules = Section(diff.Element("RuleDefinitions"), "DisplayRules", "DisplayRule");
        var labels = Section(diff, "LocLabels", "LocLabel");
        var customActions = diff.Element("CustomActions")?.Elements("CustomAction").ToList() ?? [];
        var hideActions = diff.Element("CustomActions")?.Elements("HideCustomAction").ToList() ?? [];

        var appEnable = Section(context.ApplicationDiff?.Element("RuleDefinitions"), "EnableRules", "EnableRule");
        var appDisplay = Section(context.ApplicationDiff?.Element("RuleDefinitions"), "DisplayRules", "DisplayRule");
        var appCommands = Section(context.ApplicationDiff, "CommandDefinitions", "CommandDefinition");
        var appLabels = Section(context.ApplicationDiff, "LocLabels", "LocLabel");

        var knownCommands = Ids(commands, appCommands, context.Base?.Commands, context.ApplicationBase?.Commands);
        var knownEnable = Ids(enableRules, appEnable, context.Base?.EnableRules, context.ApplicationBase?.EnableRules);
        var knownDisplay = Ids(displayRules, appDisplay, context.Base?.DisplayRules, context.ApplicationBase?.DisplayRules);
        var knownLabels = Ids(labels, appLabels, null, null);
        var baseIds = Ids(null, null, context.Base?.Commands, context.ApplicationBase?.Commands);
        baseIds.UnionWith(Ids(null, null, context.Base?.EnableRules, context.ApplicationBase?.EnableRules));
        baseIds.UnionWith(Ids(null, null, context.Base?.DisplayRules, context.ApplicationBase?.DisplayRules));

        void CheckPrefix(string id)
        {
            if (string.IsNullOrWhiteSpace(context.PublisherPrefix)) return;
            if (id.StartsWith("Mscrm.", StringComparison.OrdinalIgnoreCase) || baseIds.Contains(id)) return;
            var prefix = context.PublisherPrefix.Trim();
            if (id.StartsWith(prefix + ".", StringComparison.OrdinalIgnoreCase)
                || id.StartsWith(prefix + "_", StringComparison.OrdinalIgnoreCase)) return;
            Warn(id, $"{id} does not start with the publisher prefix {prefix}.");
        }

        // Custom actions and their controls.
        var actionIds = new HashSet<string>(StringComparer.Ordinal);
        var controlIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var action in customActions)
        {
            var id = action.Attr("Id");
            if (string.IsNullOrWhiteSpace(id))
            {
                Error(null, "A custom action has no Id.");
                continue;
            }

            if (!actionIds.Add(id)) Error(id, $"The id {id} is used by more than one custom action.");
            if (string.IsNullOrWhiteSpace(action.Attr("Location"))) Error(id, $"Custom action {id} has no Location.");
            CheckPrefix(id);

            var definition = action.Element("CommandUIDefinition");
            var content = definition?.Children.Where(child => child.Name != RibbonXml.CommentName).ToList() ?? [];
            if (content.Count != 1)
            {
                Error(id, $"Custom action {id} must define exactly one element.");
                continue;
            }

            foreach (var node in content.Concat(content[0].Descendants()))
            {
                var controlId = node.Attr("Id");
                if (controlId is null) continue;
                if (!controlIds.Add(controlId)) Error(controlId, $"The id {controlId} is used by more than one control.");
                if (node.Attr("Command") is { Length: > 0 } command && !knownCommands.Contains(command))
                    Error(controlId, $"Command {command} is not defined.");
            }
        }

        var hideIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var hide in hideActions)
        {
            var id = hide.Attr("HideActionId");
            if (string.IsNullOrWhiteSpace(id))
            {
                Error(hide.Attr("Location"), "A hide action has no HideActionId.");
                continue;
            }

            if (!hideIds.Add(id)) Error(id, $"The id {id} is used by more than one hide action.");
            if (string.IsNullOrWhiteSpace(hide.Attr("Location"))) Error(id, $"Hide action {id} has no Location.");
        }

        // Commands.
        CheckDuplicates(commands, "command", Error);
        foreach (var command in commands)
        {
            var id = command.Attr("Id");
            if (string.IsNullOrWhiteSpace(id))
            {
                Error(null, "A command has no Id.");
                continue;
            }

            CheckPrefix(id);
            foreach (var reference in command.Element("EnableRules")?.Elements("EnableRule") ?? [])
            {
                var rule = reference.Attr("Id");
                if (!string.IsNullOrWhiteSpace(rule) && !knownEnable.Contains(rule))
                    Error(id, $"Enable rule {rule} is not defined.");
            }

            foreach (var reference in command.Element("DisplayRules")?.Elements("DisplayRule") ?? [])
            {
                var rule = reference.Attr("Id");
                if (!string.IsNullOrWhiteSpace(rule) && !knownDisplay.Contains(rule))
                    Error(id, $"Display rule {rule} is not defined.");
            }

            foreach (var action in command.Element("Actions")?.Children ?? [])
            {
                switch (action.Name)
                {
                    case "JavaScriptFunction":
                        if (string.IsNullOrWhiteSpace(action.Attr("FunctionName")))
                            Error(id, $"A JavaScript action of {id} has no function name.");
                        CheckLibrary(id, action, existingWebResources, Error, Warn);
                        CheckParameters(id, action, Error);
                        break;
                    case "Url":
                        if (string.IsNullOrWhiteSpace(action.Attr("Address")))
                            Error(id, $"A URL action of {id} has no address.");
                        break;
                }
            }
        }

        // Rules.
        CheckRules(enableRules, RibbonRuleTypes.Enable, "enable rule", existingWebResources, CheckPrefix, Error, Warn);
        CheckRules(displayRules, RibbonRuleTypes.Display, "display rule", existingWebResources, CheckPrefix, Error, Warn);

        // Labels.
        CheckDuplicates(labels, "label", Error);
        foreach (var label in labels)
        {
            var id = label.Attr("Id");
            if (string.IsNullOrWhiteSpace(id))
            {
                Error(null, "A label has no Id.");
                continue;
            }

            CheckPrefix(id);
            var titles = label.Element("Titles")?.Elements("Title").ToList() ?? [];
            if (titles.Count == 0) Error(id, $"Label {id} has no text.");
            foreach (var title in titles)
            {
                if (!int.TryParse(title.Attr("languagecode"), out var lcid) || lcid <= 0)
                    Error(id, $"Label {id} has a text with no valid language.");
            }
        }

        foreach (var node in diff.Descendants())
        {
            foreach (var value in node.Attributes.Values)
            {
                if (!value.StartsWith(LocLabelPrefix, StringComparison.Ordinal)) continue;
                var labelId = value[LocLabelPrefix.Length..];
                if (!knownLabels.Contains(labelId))
                    Error(node.Attr("Id") ?? labelId, $"Label {labelId} is not defined.");
            }
        }

        return problems;
    }

    private static void CheckRules(
        IReadOnlyList<RibbonNodeDto> rules,
        string usage,
        string noun,
        IReadOnlySet<string> existingWebResources,
        Action<string> checkPrefix,
        Action<string?, string> error,
        Action<string?, string> warn)
    {
        CheckDuplicates(rules, noun, error);
        foreach (var rule in rules)
        {
            var id = rule.Attr("Id");
            if (string.IsNullOrWhiteSpace(id))
            {
                error(null, $"An {noun} has no Id.");
                continue;
            }

            checkPrefix(id);
            CheckSteps(id, rule.Children, usage, existingWebResources, error, warn);
        }
    }

    private static void CheckSteps(
        string id,
        IEnumerable<RibbonNodeDto> steps,
        string usage,
        IReadOnlySet<string> existingWebResources,
        Action<string?, string> error,
        Action<string?, string> warn)
    {
        foreach (var step in steps)
        {
            if (step.Name == RibbonXml.CommentName) continue;
            var type = RibbonRuleTypes.Find(step.Name);
            if (type is null)
            {
                warn(id, $"Rule {id} uses {step.Name}, which the editor does not check.");
                continue;
            }

            if (!type.Usage.Contains(usage))
            {
                error(id, $"{step.Name} cannot be used in {(usage == RibbonRuleTypes.Enable ? "an enable" : "a display")} rule.");
                continue;
            }

            if (type.Name == RibbonRuleTypes.OrRule)
            {
                var groups = step.Elements("Or").ToList();
                if (groups.Count == 0) error(id, $"An OR group in {id} has no alternatives.");
                foreach (var group in groups) CheckSteps(id, group.Children, usage, existingWebResources, error, warn);
                continue;
            }

            foreach (var attribute in type.Attributes.Where(attribute => attribute.Required))
            {
                if (string.IsNullOrWhiteSpace(step.Attr(attribute.Name)))
                    error(id, $"{step.Name} in {id} needs {attribute.Name}.");
            }

            if (type.Name == "CustomRule")
                CheckLibrary(id, step, existingWebResources, error, warn);
        }
    }

    private static void CheckLibrary(
        string id,
        RibbonNodeDto node,
        IReadOnlySet<string> existingWebResources,
        Action<string?, string> error,
        Action<string?, string> warn)
    {
        var library = node.Attr("Library");
        if (string.IsNullOrWhiteSpace(library))
        {
            error(id, $"A JavaScript call in {id} has no library.");
            return;
        }

        if (!library.StartsWith(WebResourcePrefix, StringComparison.OrdinalIgnoreCase)) return;
        var name = library[WebResourcePrefix.Length..].Trim();
        if (name.Length > 0 && !existingWebResources.Contains(name))
            warn(id, $"Web resource {name} was not found in this environment.");
    }

    private static void CheckParameters(string id, RibbonNodeDto action, Action<string?, string> error)
    {
        foreach (var parameter in action.Children)
        {
            if (parameter.Name == RibbonXml.CommentName || !ParameterNames.Contains(parameter.Name)) continue;
            if (parameter.Name != "StringParameter" && string.IsNullOrWhiteSpace(parameter.Attr("Value")))
                error(id, $"A {parameter.Name.Replace("Parameter", "", StringComparison.Ordinal)} parameter of {id} has no value.");
        }
    }

    private static void CheckDuplicates(IReadOnlyList<RibbonNodeDto> nodes, string noun, Action<string?, string> error)
    {
        foreach (var group in nodes
            .Select(node => node.Attr("Id"))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .GroupBy(id => id!, StringComparer.Ordinal)
            .Where(group => group.Count() > 1))
        {
            error(group.Key, $"The id {group.Key} is used by more than one {noun}.");
        }
    }

    private static IReadOnlyList<RibbonNodeDto> Section(RibbonNodeDto? parent, string container, string item) =>
        parent?.Element(container)?.Elements(item).ToList() ?? [];

    private static HashSet<string> Ids(
        IEnumerable<RibbonNodeDto>? first,
        IEnumerable<RibbonNodeDto>? second,
        IEnumerable<RibbonNodeDto>? third,
        IEnumerable<RibbonNodeDto>? fourth)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var source in new[] { first, second, third, fourth })
        {
            foreach (var node in source ?? [])
            {
                if (node.Attr("Id") is { Length: > 0 } id) ids.Add(id);
            }
        }

        return ids;
    }
}
