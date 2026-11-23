using System.Text.Json;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Inspect;
using Dyno.Api.Tools.Agent.Components.Tables;
using Xunit;
using static Dyno.Api.Tests.Tools.Agent.Components.SchemaWorld;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class SchemaInspectorTests
{
    private readonly SchemaWorld world = new();

    private async Task<object> Inspect(string kind, string? name = null, string? table = null, string? filter = null, int? top = null)
    {
        var result = await new SchemaInspector(world.Client).InspectAsync(
            new InspectSchemaBody { Kind = kind, Name = name, Table = table, Filter = filter, Top = top }, CancellationToken.None);
        Assert.Null(result.Problem);
        return result.Value!;
    }

    [Fact]
    public async Task A_table_is_described_as_a_spec_that_applies_as_unchanged()
    {
        world.AddTable("account", primary: "name");
        var spec = new TableApplySpec
        {
            Solution = "Core",
            Table = new TableDefinition { SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects", Description = "Work", AuditEnabled = true, Notes = true },
            Columns =
            [
                new() { SchemaName = "new_Code", Type = ColumnType.Text, DisplayName = "Code", MaxLength = 20, Format = TextFormat.Email },
                new() { SchemaName = "new_Budget", Type = ColumnType.Money, DisplayName = "Budget", Precision = 2, MinValue = 0, MaxValue = 1000 },
                new() { SchemaName = "new_Due", Type = ColumnType.DateOnly, DisplayName = "Due", Behavior = DateBehavior.DateOnly },
                new() { SchemaName = "new_Stage", Type = ColumnType.Choice, DisplayName = "Stage", Options = [new() { Label = "A" }, new() { Label = "B" }] },
                new() { SchemaName = "new_Active", Type = ColumnType.Boolean, DisplayName = "Active", TrueLabel = "On", FalseLabel = "Off" },
                new() { SchemaName = "new_AccountId", Type = ColumnType.Lookup, DisplayName = "Account", Target = "account" },
            ],
            Keys = [new KeyDefinition { SchemaName = "new_ByCode", Columns = ["new_code"] }],
        };
        await world.ApplyAsync(spec);

        var described = (TableDescription)await Inspect("table", "new_project");

        Assert.Equal("new_project", described.LogicalName);
        Assert.Equal(["new_accountid", "new_active", "new_budget", "new_code", "new_due", "new_stage"], described.Columns.Select(c => c.SchemaName.ToLowerInvariant()));
        var stage = described.Columns.Single(c => c.SchemaName == "new_Stage");
        Assert.Equal([(100000000, "A"), (100000001, "B")], stage.Options!.Select(o => (o.Value!.Value, o.Label)));
        Assert.Equal("new_ByCode", Assert.Single(described.Keys).SchemaName);

        // Read it, send it back: nothing to do.
        var again = new TableApplySpec { Solution = "Core", Table = described.Table, Columns = [.. described.Columns], Keys = [.. described.Keys] };
        var plan = await world.PlanAsync(again);
        Assert.True(plan.IsEmpty, string.Join("; ", plan.Steps.Select(s => $"{s.Op} {s.Target} {s.Detail}{s.Reason}")));
    }

    [Fact]
    public async Task A_described_column_leaves_out_what_does_not_apply()
    {
        world.AddTable("new_Project");
        world.AddColumn("new_project", new IntegerAttributeMetadata { SchemaName = "new_Count", MinValue = 0, MaxValue = 9, DisplayName = new Label("Count", English) });

        var column = await Inspect("column", "new_count", "new_project");
        var json = JsonSerializer.Serialize(column, new JsonSerializerOptions(JsonSerializerOptions.Web) { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull });

        Assert.Equal("""{"schemaName":"new_Count","type":"integer","displayName":"Count","description":"","requiredLevel":"none","auditEnabled":false,"minValue":0,"maxValue":9}""", json);
    }

    [Fact]
    public async Task Tables_are_listed_with_a_filter_and_a_limit()
    {
        world.AddTable("new_Project");
        world.AddTable("new_Program", display: "Program");
        world.AddTable("contact", display: "Contact");
        world.Client.OnExecute = request => request is RetrieveAllEntitiesRequest
            ? new RetrieveAllEntitiesResponse { Results = new ParameterCollection { ["EntityMetadata"] = world.Tables.Values.ToArray() } }
            : new OrganizationResponse();

        var list = (InspectListDto)await Inspect("table", filter: "new_pro", top: 1);

        Assert.Equal((2, true), (list.Total, list.Truncated));
        Assert.Equal("new_program", ((TableListItem)Assert.Single(list.Items)).LogicalName);
    }

    [Fact]
    public async Task Relationships_and_keys_of_a_table_are_listed()
    {
        world.AddTable("contact", primary: "fullname");
        await world.ApplyAsync(new TableApplySpec
        {
            Solution = "Core",
            Table = new TableDefinition { SchemaName = "new_Project", DisplayName = "Project", PluralName = "Projects" },
            ManyToMany = [new ManyToManyDefinition { SchemaName = "new_project_contact", Table = "contact" }],
        });
        world.AddKey("new_project", "new_ByName", EntityKeyIndexStatus.Failed, "new_name");

        var relationship = (RelationshipItem)await Inspect("relationship", "new_project_contact", "new_project");
        var keys = (InspectListDto)await Inspect("key", table: "new_project");

        Assert.Equal(("manyToMany", "new_project", "contact"), (relationship.Type, relationship.Table1, relationship.Table2));
        var key = (KeyItem)Assert.Single(keys.Items);
        Assert.Equal(("new_ByName", "failed"), (key.SchemaName, key.Status));
        Assert.Equal(["new_name"], key.Columns);
    }

    [Fact]
    public async Task A_global_choice_is_described_with_its_options()
    {
        var set = Options((1, "Low"), (2, "High"));
        set.Name = "new_priority";
        set.IsGlobal = true;
        world.GlobalChoices["new_priority"] = set;

        var choice = (ChoiceItem)await Inspect("choice", "new_priority");

        Assert.Equal([(1, "Low"), (2, "High")], choice.Options!.Select(o => (o.Value!.Value, o.Label)));
    }

    [Fact]
    public async Task A_role_is_described_with_its_privileges_by_name_and_depth()
    {
        var roleId = Guid.NewGuid();
        var read = Guid.NewGuid();
        var write = Guid.NewGuid();
        world.Client.ByEntity["role"] = [new Entity("role", roleId) { ["name"] = "Salesperson", ["ismanaged"] = false }];
        world.Client.ByEntity["privilege"] =
        [
            new Entity("privilege", read) { ["name"] = "prvReadAccount" },
            new Entity("privilege", write) { ["name"] = "prvWriteAccount" },
        ];
        world.Client.OnExecute = request => request is RetrieveRolePrivilegesRoleRequest
            ? new RetrieveRolePrivilegesRoleResponse
            {
                Results = new ParameterCollection
                {
                    ["RolePrivileges"] = new[]
                    {
                        new RolePrivilege { PrivilegeId = write, Depth = PrivilegeDepth.Basic },
                        new RolePrivilege { PrivilegeId = read, Depth = PrivilegeDepth.Global },
                    },
                },
            }
            : new OrganizationResponse();

        var role = (RoleItem)await Inspect("role", "Salesperson");

        Assert.Equal([new RolePrivilegeItem("prvReadAccount", "global"), new RolePrivilegeItem("prvWriteAccount", "basic")], role.Privileges);
    }

    [Theory]
    [InlineData("form", null, "kind must be one of")]
    [InlineData("column", null, "needs table")]
    [InlineData("table", "new_nothing", "was not found")]
    public async Task Bad_requests_say_what_to_change(string kind, string? name, string message)
    {
        var result = await new SchemaInspector(world.Client).InspectAsync(new InspectSchemaBody { Kind = kind, Name = name }, CancellationToken.None);

        Assert.Contains(message, result.Problem!.Message);
    }
}
