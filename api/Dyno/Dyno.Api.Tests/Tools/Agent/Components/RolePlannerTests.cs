using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Security;
using Dyno.Api.Tools.Agent.Kernel;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

public sealed class RolePlannerTests
{
    private static readonly IApplyFamily Family = new ApplyFamily<RoleApplySpec>(RolePlanner.Family, new RolePlanner());
    private readonly RowWorld world = new();
    private readonly Entity root;
    private readonly Entity user;
    private readonly Entity team;
    private readonly Dictionary<PrivilegeType, Guid> account = [];
    private readonly Entity export;

    public RolePlannerTests()
    {
        var table = world.Schema.AddTable("account", "Account", "Accounts", primary: "name");
        var privileges = new[] { PrivilegeType.Create, PrivilegeType.Read, PrivilegeType.Write, PrivilegeType.Delete }.Select(type =>
        {
            var privilege = (SecurityPrivilegeMetadata)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(SecurityPrivilegeMetadata));
            SchemaWorld.Set(privilege, "PrivilegeId", account[type] = Guid.NewGuid());
            SchemaWorld.Set(privilege, "PrivilegeType", type);
            SchemaWorld.Set(privilege, "Name", $"prv{type}Account");
            SchemaWorld.Set(privilege, "CanBeBasic", true);
            SchemaWorld.Set(privilege, "CanBeLocal", true);
            SchemaWorld.Set(privilege, "CanBeDeep", true);
            SchemaWorld.Set(privilege, "CanBeGlobal", true);
            return privilege;
        }).ToArray();
        SchemaWorld.Set(table, "Privileges", privileges);
        world.Schema.AddColumn("account", new StringAttributeMetadata { SchemaName = "new_secret" });
        export = world.Add(new Entity("privilege") { ["name"] = "prvExportToExcel", ["canbebasic"] = false, ["canbelocal"] = false, ["canbedeep"] = false, ["canbeglobal"] = true });
        root = world.Add(new Entity("businessunit") { ["name"] = "Contoso" });
        user = world.Add(new Entity("systemuser") { ["fullname"] = "Dana", ["domainname"] = "dana@contoso.com", ["businessunitid"] = root.ToEntityReference() });
        team = world.Add(new Entity("team") { ["name"] = "Sales", ["businessunitid"] = root.ToEntityReference() });
    }

    private Task<Plan> PlanAsync(RoleApplySpec spec) => new RolePlanner().PlanAsync(spec, world.Context(), CancellationToken.None);

    private static RoleApplySpec Spec(AccessDepth read = AccessDepth.Global, AccessDepth? delete = null) => new()
    {
        Solution = "Core",
        Role = new RoleSpec
        {
            Name = "Project manager",
            Tables = [new TablePrivileges { Table = "account", Read = read, Write = AccessDepth.Local, Delete = delete }],
            Privileges = [new NamedPrivilege { Name = "prvExportToExcel", Depth = AccessDepth.Global }],
            Users = ["dana@contoso.com"],
            Teams = ["Sales"],
        },
    };

    private Entity Role => world.Table("role").Single();

    [Fact]
    public async Task Creates_the_role_with_its_privileges_and_gives_it_to_the_user_and_team()
    {
        var result = await world.ApplyAsync(Family, Spec());

        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(root.Id, Role.GetAttributeValue<EntityReference>("businessunitid").Id);
        var granted = world.RolePrivileges[Role.Id];
        Assert.Equal(PrivilegeDepth.Global, granted[account[PrivilegeType.Read]]);
        Assert.Equal(PrivilegeDepth.Local, granted[account[PrivilegeType.Write]]);
        Assert.Equal(PrivilegeDepth.Global, granted[export.Id]);
        Assert.Contains(("systemuserroles_association", user.Id, Role.Id), world.Links);
        Assert.Contains(("teamroles_association", team.Id, Role.Id), world.Links);
        Assert.Empty((await PlanAsync(Spec())).Steps);
    }

    [Fact]
    public async Task A_lower_depth_and_none_take_access_away_as_destructive_steps()
    {
        await world.ApplyAsync(Family, Spec(delete: AccessDepth.Basic));

        var plan = await PlanAsync(Spec(read: AccessDepth.Basic, delete: AccessDepth.None));

        Assert.Equal(["lowerPrivileges", "removePrivileges"], plan.Steps.Select(s => s.Op));
        Assert.Contains("prvReadAccount: global → basic", plan.Steps[0].Detail);
        Assert.All(plan.Steps, s => Assert.Equal(PlanEffect.Destructive, s.Effect));
        var result = await world.ApplyAsync(Family, Spec(read: AccessDepth.Basic, delete: AccessDepth.None));
        Assert.Equal(ApplyOutcome.Applied, result.Outcome);
        Assert.Equal(PrivilegeDepth.Basic, world.RolePrivileges[Role.Id][account[PrivilegeType.Read]]);
        Assert.False(world.RolePrivileges[Role.Id].ContainsKey(account[PrivilegeType.Delete]));
        Assert.Contains(world.Writes.OfType<AddSolutionComponentRequest>(), r => r.ComponentId == Role.Id && r.ComponentType == 20);
    }

    [Fact]
    public async Task A_depth_the_privilege_does_not_allow_is_refused_with_the_depths_it_allows()
    {
        var spec = new RoleApplySpec
        {
            Solution = "Core",
            Role = new RoleSpec { Name = "R", Privileges = [new NamedPrivilege { Name = "prvExportToExcel", Depth = AccessDepth.Basic }] },
        };

        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(spec));

        Assert.Contains("it allows global", problem.Problem.Message);
    }

    [Fact]
    public async Task A_field_security_profile_secures_the_column_sets_permissions_and_adds_members()
    {
        var spec = new RoleApplySpec
        {
            Solution = "Core",
            FieldSecurityProfiles =
            [
                new FieldSecurityProfileSpec
                {
                    Name = "Finance",
                    Columns = [new ColumnPermission { Table = "account", Column = "new_secret", Read = true, Update = true }],
                    Users = [user.Id.ToString()],
                },
            ],
        };

        var plan = await PlanAsync(spec);
        Assert.Equal(["createFieldSecurityProfile", "secureColumn", "addColumnPermission", "addProfileMember"], plan.Steps.Select(s => s.Op));
        await world.ApplyAsync(Family, spec);

        Assert.True(world.Schema.Column("account", "new_secret").IsSecured);
        var permission = world.Table("fieldpermission").Single();
        Assert.Equal(4, permission.GetAttributeValue<OptionSetValue>("canread").Value);
        Assert.Equal(0, permission.GetAttributeValue<OptionSetValue>("cancreate").Value);
        var profile = world.Table("fieldsecurityprofile").Single();
        Assert.Contains(("systemuserprofiles_association", profile.Id, user.Id), world.Links);
        Assert.Empty((await PlanAsync(spec)).Steps);
    }

    [Fact]
    public async Task Taking_a_column_right_away_is_destructive_and_shows_before_and_after()
    {
        FieldSecurityProfileSpec Profile(bool update) => new()
        {
            Name = "Finance",
            Columns = [new ColumnPermission { Table = "account", Column = "new_secret", Read = true, Update = update }],
        };
        await world.ApplyAsync(Family, new RoleApplySpec { Solution = "Core", FieldSecurityProfiles = [Profile(update: true)] });

        var step = Assert.Single((await PlanAsync(new RoleApplySpec { Solution = "Core", FieldSecurityProfiles = [Profile(update: false)] })).Steps);

        Assert.Equal("updateColumnPermission", step.Op);
        Assert.Equal(PlanEffect.Destructive, step.Effect);
        Assert.Equal("read, update → read", step.Detail);
    }

    [Fact]
    public async Task An_unknown_user_is_refused()
    {
        var spec = new RoleApplySpec { Solution = "Core", Role = new RoleSpec { Name = "R", Users = ["nobody@contoso.com"] } };

        var problem = await Assert.ThrowsAsync<AgentProblemException>(() => PlanAsync(spec));

        Assert.Contains("nobody@contoso.com", problem.Problem.Message);
    }
}
