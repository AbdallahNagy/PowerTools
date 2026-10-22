namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>
/// Rule elements an EnableRule or DisplayRule can hold, with their attributes. Written from Microsoft's
/// published ribbon schema documentation (RibbonCore.xsd). The editor builds its forms from this list and
/// validation uses it for required attributes.
/// </summary>
public static class RibbonRuleTypes
{
    public const string Enable = "enable";
    public const string Display = "display";
    public const string OrRule = "OrRule";

    private static readonly string[] Both = [Enable, Display];
    private static readonly string[] EnableOnly = [Enable];
    private static readonly string[] DisplayOnly = [Display];

    private static readonly string[] AppliesTo = ["PrimaryEntity", "SelectedEntity"];
    private static readonly string[] Privileges = ["Create", "Read", "Write", "Delete", "Assign", "Share", "Append", "AppendTo"];
    private static readonly string[] Depths = ["None", "Basic", "Local", "Deep", "Global"];

    private static RuleAttributeDto Text(string name, bool required = false) => new(name, "text", required, null);
    private static RuleAttributeDto Number(string name, bool required = false) => new(name, "int", required, null);
    private static RuleAttributeDto Flag(string name, bool required = false) => new(name, "bool", required, null);
    private static RuleAttributeDto Choice(string name, IReadOnlyList<string> values, bool required = false) =>
        new(name, "enum", required, values);

    private static RuleTypeDto Rule(string name, string[] usage, params RuleAttributeDto[] attributes) =>
        new(name, usage, [.. attributes, Flag("Default"), Flag("InvertResult")]);

    public static readonly IReadOnlyList<RuleTypeDto> All =
    [
        Rule("CommandClientTypeRule", Both, Choice("Type", ["Legacy", "Modern", "Refresh"], required: true)),
        Rule("CrmClientTypeRule", Both, Choice("Type", ["Web", "Outlook"], required: true)),
        Rule("CrmOfflineAccessStateRule", Both, Choice("State", ["Online", "Offline"], required: true)),
        Rule("CrmOutlookClientTypeRule", Both,
            Choice("Type", ["CrmForOutlook", "CrmForOutlookOfflineAccess"], required: true)),
        Rule("CustomRule", EnableOnly, Text("FunctionName", required: true), Text("Library", required: true)),
        Rule("EntityPrivilegeRule", DisplayOnly,
            Choice("PrivilegeType", Privileges, required: true),
            Choice("PrivilegeDepth", Depths, required: true),
            Text("EntityName"),
            Choice("AppliesTo", AppliesTo)),
        Rule("EntityPropertyRule", DisplayOnly,
            Choice("PropertyName", [
                "DuplicateDetectionEnabled", "GridFiltersEnabled", "HasActivities", "HasNotes", "HasStateCode",
                "IsActivity", "IsActivityParty", "IsConnectionsEnabled", "IsCustomizable", "IsDocumentManagementEnabled",
                "IsImportable", "IsIntersect", "IsMailMergeEnabled", "IsQuickCreateEnabled", "IsSLAEnabled",
                "IsStateModelAware", "IsUserEntity", "MailMergeEnabled", "WorksWithQueue",
            ], required: true),
            Flag("PropertyValue", required: true),
            Choice("AppliesTo", AppliesTo)),
        Rule("EntityRule", Both,
            Text("EntityName"),
            Choice("Context", ["Form", "HomePageGrid", "SubGridStandard", "SubGridAssociated", "Dashboard"]),
            Choice("AppliesTo", AppliesTo)),
        Rule("FormEntityContextRule", Both, Text("EntityName", required: true)),
        Rule("FormStateRule", Both,
            Choice("State", ["Create", "Existing", "ReadOnly", "Disabled", "BulkEdit", "Undefined"], required: true)),
        Rule("HideForTabletExperienceRule", DisplayOnly),
        Rule("MiscellaneousPrivilegeRule", DisplayOnly,
            Text("PrivilegeName", required: true),
            Choice("PrivilegeDepth", Depths)),
        Rule("OrganizationSettingRule", Both,
            Choice("Setting", [
                "IsSharepointEnabled", "IsSOPIntegrationEnabled", "IsAppMode", "IsFiscalCalendarDefined",
                "IsAutoSaveEnabled", "IsSocialInsightsEnabled",
            ], required: true)),
        Rule("OutlookItemTrackingRule", EnableOnly, Flag("TrackedInCrm", required: true), Choice("AppliesTo", AppliesTo)),
        Rule("OutlookRenderTypeRule", DisplayOnly, Choice("Type", ["Web", "Native"], required: true)),
        Rule("OutlookVersionRule", Both, Choice("Version", ["2003", "2007", "2010", "2013", "2016"], required: true)),
        Rule("PageRule", Both, Text("Address", required: true)),
        Rule("RecordPrivilegeRule", EnableOnly,
            Choice("PrivilegeType", Privileges, required: true),
            Choice("AppliesTo", AppliesTo)),
        Rule("ReferencingAttributeRequiredRule", Both),
        Rule("RelationshipTypeRule", Both,
            Choice("RelationshipType", ["NoRelationship", "OneToMany", "ManyToMany"], required: true),
            Flag("AllowCustomRelationship"),
            Choice("AppliesTo", AppliesTo)),
        Rule("SelectionCountRule", EnableOnly,
            Number("Minimum"),
            Number("Maximum"),
            Choice("AppliesTo", AppliesTo)),
        Rule("SkuRule", Both, Choice("Sku", ["All", "OnPremise", "Online", "Spla"], required: true)),
        Rule("ValueRule", Both, Text("Field", required: true), Text("Value", required: true)),
        Rule("ViewRule", EnableOnly, Flag("IsQueryView"), Flag("IsSystemView"), Flag("IsUserView"), Choice("AppliesTo", AppliesTo)),
        new(OrRule, Both, []),
    ];

    private static readonly Dictionary<string, RuleTypeDto> ByName =
        All.ToDictionary(rule => rule.Name, StringComparer.Ordinal);

    public static RuleTypeDto? Find(string name) => ByName.GetValueOrDefault(name);
}
