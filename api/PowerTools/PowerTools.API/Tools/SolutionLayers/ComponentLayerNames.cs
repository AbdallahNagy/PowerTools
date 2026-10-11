namespace PowerTools.API.Tools.SolutionLayers;

/// <summary>A component type the picker can search, with the value msdyn_componentlayer is filtered by.</summary>
public sealed record ComponentLayerType(int ComponentType, string Name, string LayerName, string Label);

/// <summary>One row of solutioncomponentdefinition.</summary>
public sealed record ComponentDefinition(int ComponentType, string Name, string? PrimaryEntityName);

/// <summary>
/// Maps solution component type numbers to the msdyn_solutioncomponentname value used to read layers.
/// Written for Power Tools from the documented solutioncomponent.componenttype choice values.
/// </summary>
public static class ComponentLayerNames
{
    public const int Entity = 1;
    public const int Attribute = 2;
    public const int OptionSet = 9;
    public const int EntityRelationship = 10;
    public const int Role = 20;
    public const int SavedQuery = 26;
    public const int Workflow = 29;
    public const int SavedQueryVisualization = 59;
    public const int SystemForm = 60;
    public const int WebResource = 61;
    public const int PluginAssembly = 91;
    public const int SdkMessageProcessingStep = 92;
    public const int CanvasApp = 300;

    /// <summary>
    /// Model-driven apps have no documented componenttype number, so their number is read from
    /// solutioncomponentdefinition (the row whose primary table is appmodule) for each connection.
    /// </summary>
    public const string AppModuleName = "AppModule";
    public const string AppModuleTable = "appmodule";

    /// <summary>Classic types whose numbers are documented. Kept in picker order.</summary>
    private static readonly ComponentLayerType[] Classic =
    [
        new(Entity, "Entity", "Entity", "Table"),
        new(Attribute, "Attribute", "Attribute", "Column"),
        new(OptionSet, "OptionSet", "OptionSet", "Choice"),
        new(EntityRelationship, "EntityRelationship", "EntityRelationship", "Relationship"),
        new(Role, "Role", "Role", "Security role"),
        new(SystemForm, "SystemForm", "SystemForm", "Form"),
        new(SavedQuery, "SavedQuery", "SavedQuery", "View"),
        new(SavedQueryVisualization, "SavedQueryVisualization", "SavedQueryVisualization", "Chart"),
        new(WebResource, "WebResource", "WebResource", "Web resource"),
        new(Workflow, "Workflow", "Workflow", "Process"),
    ];

    private static readonly ComponentLayerType[] ClassicTail =
    [
        new(PluginAssembly, "PluginAssembly", "PluginAssembly", "Plug-in assembly"),
        new(SdkMessageProcessingStep, "SdkMessageProcessingStep", "SdkMessageProcessingStep", "Plug-in step"),
        new(CanvasApp, "CanvasApp", "CanvasApp", "Canvas app"),
    ];

    public static string? ClassicLayerName(int componentType) =>
        Classic.Concat(ClassicTail).FirstOrDefault(type => type.ComponentType == componentType)?.LayerName;

    /// <summary>
    /// The searchable types for one connection. Model-driven apps are included only when the
    /// connection's definitions name their type number. Without definitions, only classic types are listed.
    /// </summary>
    public static IReadOnlyList<ComponentLayerType> Searchable(IReadOnlyList<ComponentDefinition>? definitions)
    {
        var list = new List<ComponentLayerType>(Classic);
        var appModule = AppModuleType(definitions);
        if (appModule is int number)
            list.Add(new ComponentLayerType(number, AppModuleName, AppModuleName, "Model-driven app"));
        list.AddRange(ClassicTail);
        return list;
    }

    public static int? AppModuleType(IReadOnlyList<ComponentDefinition>? definitions) =>
        definitions?
            .Where(definition => string.Equals(
                definition.PrimaryEntityName,
                AppModuleTable,
                StringComparison.OrdinalIgnoreCase))
            .Select(definition => (int?)definition.ComponentType)
            .FirstOrDefault();

    /// <summary>
    /// The msdyn_solutioncomponentname value for a type number: the classic map first, then
    /// the model-driven app row, then solutioncomponentdefinition.name. Null when unknown.
    /// </summary>
    public static string? LayerName(int componentType, IReadOnlyList<ComponentDefinition>? definitions)
    {
        var classic = ClassicLayerName(componentType);
        if (classic is not null)
            return classic;

        if (AppModuleType(definitions) == componentType)
            return AppModuleName;

        var name = definitions?.FirstOrDefault(definition => definition.ComponentType == componentType)?.Name;
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}
