using System.IO.Compression;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Processes;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class ProcessPlannerTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<ProcessApplySpec>(ProcessPlanner.Family, new ProcessPlanner((_, _) => Task.CompletedTask, TimeSpan.Zero));
    private static readonly Guid AdminId = Guid.Parse("6f9619ff-8b86-d011-b42d-00c04fc964ff");
    private readonly RowWorld world = new();

    /// <summary>The solution files the world imported, in order.</summary>
    private readonly List<byte[]> imports = [];

    public ProcessPlannerTests()
    {
        world.Schema.AddTable("new_Permit", "Permit", "Permits");
        world.Schema.AddColumn("new_permit", new PicklistAttributeMetadata { SchemaName = "new_Status" });
        world.Schema.AddColumn("new_permit", new BooleanAttributeMetadata { SchemaName = "new_Urgent" });
        world.Schema.AddColumn("new_permit", new LookupAttributeMetadata { SchemaName = "new_ApplicantId", Targets = ["contact"] });
        world.Schema.AddTable("Contact", "Contact", "Contacts", primary: "fullname");
        world.Schema.AddColumn("contact", new StringAttributeMetadata { SchemaName = "EMailAddress1" });
        world.Schema.AddTable("new_Note", "Note", "Notes");
        world.OnExecute = Import;
    }

    private const string Steps = """
        [
          { "label": "Mark reviewed", "update": { "values": { "new_status": 2, "new_name": { "concat": ["Reviewed: ", { "column": "new_name" }] } } } },
          { "create": { "table": "new_note", "values": { "new_name": { "column": "emailaddress1", "from": "new_applicantid", "default": "no email" } } } },
          {
            "label": "Urgent?",
            "if": {
              "condition": { "all": [ { "column": "new_urgent", "operator": "equals", "value": true }, { "column": "new_applicantid", "operator": "notNull" } ] },
              "then": [
                { "sendEmail": { "from": { "lookup": { "table": "systemuser", "id": "6f9619ff-8b86-d011-b42d-00c04fc964ff", "name": "Admin" } },
                                 "to": [ { "column": "new_applicantid" } ], "subject": "Your permit", "body": { "column": "new_name" } } },
                { "assign": { "owner": { "lookup": { "table": "systemuser", "id": "6f9619ff-8b86-d011-b42d-00c04fc964ff" } } } }
              ],
              "elseIf": [ { "condition": { "column": "new_status", "operator": "in", "values": [1, 3] }, "then": [ { "setState": { "state": 1, "status": 2 } } ] } ],
              "else": [ { "stop": { "status": "succeeded", "message": "Nothing to do" } } ]
            }
          }
        ]
        """;

    private static ProcessApplySpec Spec(string steps = Steps, ProcessState? state = null, ProcessMode? mode = null) => new()
    {
        Solution = "Core",
        Name = "Permit review",
        Kind = ProcessKind.Workflow,
        Table = "new_permit",
        Mode = mode,
        Triggers = new ProcessTriggers { OnCreate = true, OnUpdate = ["new_status"] },
        Steps = JsonSerializer.Deserialize<List<ProcessStep>>(steps, JsonSerializerOptions.Web),
        State = state,
    };

    private Task<Plan> PlanAsync(ProcessApplySpec spec) => new ProcessPlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private Entity Process => world.Table("workflow").Single();

    [Fact]
    public async Task Creates_a_workflow_through_a_solution_import_adds_it_to_the_solution_and_then_plans_nothing()
    {
        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal("createProcess", Assert.Single(result.Steps).Op);
        var file = Assert.Single(imports);
        var customizations = Entry(file, "customizations.xml");
        Assert.Equal("new_Permit", customizations.Descendants("PrimaryEntity").Single().Value);
        Assert.Equal("new_status", customizations.Descendants("TriggerOnUpdateAttributeList").Single().Value);
        Assert.Equal("new", Entry(file, "solution.xml").Descendants("CustomizationPrefix").Single().Value);

        Assert.Equal(1, Process.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Contains(world.Table("solutioncomponent"), c => (Guid)c["objectid"] == Process.Id && (Guid)c["solutionid"] == world.CoreSolutionId);
        Assert.DoesNotContain(world.Table("solution"), s => s.GetAttributeValue<string>("uniquename").StartsWith(ProcessPlanner.PackagePrefix, StringComparison.Ordinal));
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task The_saved_xaml_reads_back_as_the_steps_that_were_sent()
    {
        await world.ApplyAsync(Family, Spec());

        var described = ProcessPlanner.Describe(Process);
        var steps = Assert.IsType<JsonElement>(described["steps"]);

        Assert.Equal("Mark reviewed", steps[0].GetProperty("label").GetString());
        Assert.Equal("Reviewed: ", steps[0].GetProperty("update").GetProperty("values").GetProperty("new_name").GetProperty("concat")[0].GetString());
        Assert.Equal("new_applicantid", steps[1].GetProperty("create").GetProperty("values").GetProperty("new_name").GetProperty("from").GetString());
        var branch = steps[2].GetProperty("if");
        Assert.Equal(2, branch.GetProperty("condition").GetProperty("all").GetArrayLength());
        Assert.Equal(AdminId.ToString("D"), branch.GetProperty("then")[1].GetProperty("assign").GetProperty("owner").GetProperty("lookup").GetProperty("id").GetString());
        Assert.Equal("Nothing to do", branch.GetProperty("else")[0].GetProperty("stop").GetProperty("message").GetString());
        Assert.Equal("activated", described["state"]);
        Assert.Empty((await PlanAsync(Spec(JsonSerializer.Serialize(steps)))).Steps);
    }

    [Fact]
    public async Task Changing_an_activated_workflow_saves_it_in_draft_and_activates_it_again()
    {
        await world.ApplyAsync(Family, Spec());
        var changed = Steps.Replace("Reviewed: ", "Checked: ");

        var step = Assert.Single((await PlanAsync(Spec(changed))).Steps);
        Assert.Equal("updateProcess", step.Op);
        Assert.Contains("deactivated while it is saved", step.Detail);
        var result = await world.ApplyAsync(Family, Spec(changed));

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(2, imports.Count);
        Assert.Contains("Checked: ", Process.GetAttributeValue<string>("xaml"));
        Assert.Equal(1, Process.GetAttributeValue<OptionSetValue>("statecode").Value);
    }

    [Fact]
    public async Task State_draft_alone_only_deactivates()
    {
        await world.ApplyAsync(Family, Spec());

        var result = await world.ApplyAsync(Family, Spec(state: ProcessState.Draft));

        Assert.Equal("deactivateProcess", Assert.Single(result.Steps).Op);
        Assert.Single(imports);
        Assert.Equal(0, Process.GetAttributeValue<OptionSetValue>("statecode").Value);
    }

    [Fact]
    public async Task A_failed_import_reports_the_import_error_and_leaves_the_workflow_activated()
    {
        await world.ApplyAsync(Family, Spec());
        failImport = "The workflow could not be compiled.";

        var result = await world.ApplyAsync(Family, Spec(Steps.Replace("Reviewed: ", "Checked: ")));

        Assert.NotEqual(ApplyOutcome.Applied, result.Outcome);
        Assert.Contains("could not be compiled", JsonSerializer.Serialize(result));
        Assert.Equal(1, Process.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.DoesNotContain("Checked: ", Process.GetAttributeValue<string>("xaml"));
        Assert.DoesNotContain(world.Table("solution"), s => s.GetAttributeValue<string>("uniquename").StartsWith(ProcessPlanner.PackagePrefix, StringComparison.Ordinal));
    }

    [Fact]
    public async Task An_action_gets_its_arguments_and_a_message_name_with_the_publisher_prefix()
    {
        var spec = new ProcessApplySpec
        {
            Solution = "Core",
            Name = "Notify applicant",
            Kind = ProcessKind.Action,
            Table = "new_permit",
            Arguments = [new ProcessArgument { Name = "Reason", Type = ProcessArgumentType.String, Required = true }],
            Steps = JsonSerializer.Deserialize<List<ProcessStep>>("""[ { "update": { "values": { "new_name": { "argument": "Reason" } } } } ]""", JsonSerializerOptions.Web),
        };

        await world.ApplyAsync(Family, spec);

        var customizations = Entry(Assert.Single(imports), "customizations.xml");
        Assert.Equal("3", customizations.Descendants("Category").Single().Value);
        Assert.Equal("NotifyApplicant", customizations.Descendants("UniqueName").Single().Value);
        var reading = ProcessXamlReader.Read(Process.GetAttributeValue<string>("xaml"));
        Assert.Equal("Reason", Assert.Single(reading.Arguments).Name);
        Assert.Equal("new_permit", reading.Table);
    }

    [Fact]
    public async Task An_action_unique_name_without_the_publisher_prefix_is_refused()
    {
        var spec = new ProcessApplySpec
        {
            Solution = "Core",
            Name = "Notify applicant",
            Kind = ProcessKind.Action,
            Table = "new_permit",
            UniqueName = "contoso_NotifyApplicant",
            Steps = [],
        };

        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(spec));

        Assert.Contains("new_", error.Problem.Message);
    }

    [Fact]
    public async Task A_child_workflow_is_found_by_name_and_an_unknown_one_is_refused()
    {
        var child = world.Add(new Entity("workflow", Guid.NewGuid())
        {
            ["name"] = "Close tasks", ["type"] = new OptionSetValue(1), ["category"] = new OptionSetValue(0),
            ["subprocess"] = true, ["primaryentity"] = "new_permit",
        });

        var plan = await PlanAsync(Spec("""[ { "childWorkflow": "Close tasks" } ]"""));
        var error = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(Spec("""[ { "childWorkflow": "Missing" } ]""")));

        Assert.Equal("createProcess", Assert.Single(plan.Steps).Op);
        Assert.Contains("Missing", error.Problem.Message);
        await world.ApplyAsync(Family, Spec("""[ { "childWorkflow": "Close tasks" } ]"""));
        Assert.Contains(child.Id.ToString("D"), world.Table("workflow").Single(w => w.GetAttributeValue<string>("name") == "Permit review").GetAttributeValue<string>("xaml"));
    }

    [Fact]
    public async Task Kind_and_table_cannot_change_and_a_managed_process_is_blocked()
    {
        await world.ApplyAsync(Family, Spec());

        var kind = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(new ProcessApplySpec
        {
            Solution = "Core", Name = "Permit review", Kind = ProcessKind.Action, Table = "new_permit", Steps = [],
        }));
        Assert.Contains("kind cannot change", kind.Problem.Message);

        Process["ismanaged"] = true;
        var step = Assert.Single((await PlanAsync(Spec(Steps.Replace("Reviewed", "Seen")))).Steps);
        Assert.Equal(PlanStepKind.Blocked, step.Kind);
    }

    [Fact]
    public async Task A_kept_step_survives_a_change_to_the_steps_around_it()
    {
        // An exported action whose custom step reads its outputs back, which Power Tools keeps as it is.
        var xaml = ProcessXamlTests.Fixture("ActionLocalPermitWarning1Applicant");
        world.Schema.AddTable("contoso_LocalPermitRequest", "Request", "Requests");
        world.Add(new Entity("workflow", Guid.NewGuid())
        {
            ["name"] = "Warning", ["type"] = new OptionSetValue(1), ["category"] = new OptionSetValue(3), ["mode"] = new OptionSetValue(0),
            ["primaryentity"] = "contoso_localpermitrequest", ["xaml"] = xaml, ["statecode"] = new OptionSetValue(1),
            ["ismanaged"] = false,
        });
        var described = ProcessPlanner.Describe(Process);
        var steps = JsonSerializer.Deserialize<List<ProcessStep>>(JsonSerializer.Serialize(described["steps"]), JsonSerializerOptions.Web)!;
        var kept = Assert.Single(steps).Keep;
        Assert.NotNull(kept);
        var spec = new ProcessApplySpec
        {
            Solution = "Core", Name = "Warning", Kind = ProcessKind.Action, Table = "contoso_localpermitrequest", UniqueName = "contoso_Warning",
            Steps = [.. steps, new ProcessStep { Update = new ProcessRecordUpdate { Values = new() { ["contoso_name"] = JsonSerializer.SerializeToElement("Warned") } } }],
        };
        world.Add(new Entity("sdkmessage", Guid.NewGuid()) { ["name"] = "contoso_Warning" });
        Process["sdkmessageid"] = new EntityReference("sdkmessage", world.Table("sdkmessage").Single().Id);

        Assert.Empty((await PlanAsync(new ProcessApplySpec
        {
            Solution = "Core", Name = "Warning", Kind = ProcessKind.Action, Table = "contoso_localpermitrequest", Steps = steps,
        })).Steps);
        await world.ApplyAsync(Family, spec);

        var saved = Process.GetAttributeValue<string>("xaml");
        Assert.Contains("Fabrikam.Notifications.Steps.CustomNotification", saved);
        Assert.Contains("CustomActivityStep1EmailReference_localParameter", saved);
        Assert.Contains("UpdateStep2", saved);
    }

    [Fact]
    public async Task A_delete_trigger_and_a_user_scope_it_cannot_set_are_flagged_and_kept_on_save()
    {
        await world.ApplyAsync(Family, Spec());
        Process["triggerondelete"] = true;
        Process["scope"] = new OptionSetValue(1);

        var described = ProcessPlanner.Describe(Process);
        await world.ApplyAsync(Family, Spec(Steps.Replace("Reviewed: ", "Checked: ")));

        Assert.Contains("delete", (string)described["note"]!);
        Assert.Contains("user", (string)described["note"]!);
        Assert.Equal("realtime", described["mode"]);
        var saved = Entry(imports[^1], "customizations.xml");
        Assert.Equal("1", saved.Descendants("TriggerOnDelete").Single().Value);
        Assert.Equal("1", saved.Descendants("Scope").Single().Value);
    }

    // ── The import Dataverse runs ────────────────────────────────────────────

    private string? failImport;

    private OrganizationResponse? Import(OrganizationRequest request)
    {
        if (request is not Microsoft.Xrm.Sdk.Messages.ExecuteAsyncRequest { Request: Microsoft.Crm.Sdk.Messages.ImportSolutionRequest import }) return null;
        imports.Add(import.CustomizationFile);
        var operation = Guid.NewGuid();
        var solutionName = Entry(import.CustomizationFile, "solution.xml").Descendants("UniqueName").First().Value;
        world.Add(new Entity("solution", Guid.NewGuid()) { ["uniquename"] = solutionName, ["ismanaged"] = false });
        if (failImport is not null)
        {
            world.Add(new Entity("asyncoperation", operation) { ["statecode"] = new OptionSetValue(3), ["statuscode"] = new OptionSetValue(31), ["message"] = failImport });
            return new Microsoft.Xrm.Sdk.Messages.ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operation } };
        }

        var definition = Entry(import.CustomizationFile, "customizations.xml").Descendants("Workflow").Single();
        var id = Guid.Parse(definition.Attribute("WorkflowId")!.Value);
        var file = definition.Element("XamlFileName")!.Value.TrimStart('/');
        var existing = world.Table("workflow").FirstOrDefault(w => w.Id == id);
        // Dataverse refuses to overwrite an activated process.
        Assert.False(existing?.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1, "The import ran over an activated process.");
        var row = existing ?? world.Add(new Entity("workflow", id));
        string Value(string name) => definition.Element(name)?.Value ?? "";
        row["name"] = definition.Attribute("Name")!.Value;
        row["type"] = new OptionSetValue(1);
        row["category"] = new OptionSetValue(int.Parse(Value("Category")));
        row["mode"] = new OptionSetValue(int.Parse(Value("Mode")));
        row["primaryentity"] = Value("PrimaryEntity").ToLowerInvariant();
        row["xaml"] = Entry(import.CustomizationFile, file, xml: false);
        row["ondemand"] = Value("OnDemand") == "1";
        row["subprocess"] = Value("Subprocess") == "1";
        row["triggeroncreate"] = Value("TriggerOnCreate") == "1";
        row["triggeronupdateattributelist"] = definition.Element("TriggerOnUpdateAttributeList")?.Value;
        row["runas"] = new OptionSetValue(int.Parse(Value("RunAs")));
        row["description"] = definition.Element("Descriptions")?.Element("Description")?.Attribute("description")?.Value;
        row["ismanaged"] = false;
        var activate = import.PublishWorkflows && Value("StateCode") == "1";
        row["statecode"] = new OptionSetValue(activate ? 1 : 0);
        row["statuscode"] = new OptionSetValue(activate ? 2 : 1);
        world.Add(new Entity("asyncoperation", operation) { ["statecode"] = new OptionSetValue(3), ["statuscode"] = new OptionSetValue(30) });
        return new Microsoft.Xrm.Sdk.Messages.ExecuteAsyncResponse { Results = new ParameterCollection { ["AsyncJobId"] = operation } };
    }

    private static XDocument Entry(byte[] file, string name) => XDocument.Parse(Entry(file, name, xml: true));

    private static string Entry(byte[] file, string name, bool xml)
    {
        using var zip = new ZipArchive(new MemoryStream(file), ZipArchiveMode.Read);
        using var reader = new StreamReader(zip.GetEntry(name)!.Open());
        return reader.ReadToEnd();
    }
}
