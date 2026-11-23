using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Components.Shared;
using Dyno.Api.Tools.Agent.Components.WebResources;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.Security;

[JsonConverter(typeof(JsonStringEnumConverter<AccessDepth>))]
public enum AccessDepth
{
    [JsonStringEnumMemberName("none")] None,
    [JsonStringEnumMemberName("basic")] Basic,
    [JsonStringEnumMemberName("local")] Local,
    [JsonStringEnumMemberName("deep")] Deep,
    [JsonStringEnumMemberName("global")] Global,
}

[Description("A security role and field security profiles. Leave a property out to keep it. Privileges, members and column permissions left out are kept.")]
public sealed class RoleApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the role and profiles go into.")]
    public required string Solution { get; init; }

    public RoleSpec? Role { get; init; }

    public List<FieldSecurityProfileSpec>? FieldSecurityProfiles { get; init; }
}

[Description("Depths: basic is the user's own records, local their business unit, deep it and its child units, global the organization; none takes the privilege away.")]
public sealed class RoleSpec
{
    [Description("The role's name; an existing root role matches by name.")]
    public required string Name { get; init; }

    public string? Description { get; init; }

    [Description("For a new role: the business unit's name. Default: the root business unit. Cannot change.")]
    public string? BusinessUnit { get; init; }

    [Description("Privileges on tables, by table and access right.")]
    public List<TablePrivileges>? Tables { get; init; }

    [Description("Any privilege by name, such as prvExportToExcel, in the shape inspect_schema kind role lists them.")]
    public List<NamedPrivilege>? Privileges { get; init; }

    [Description("Users to give the role: id, domain name or primary email.")]
    public List<string>? Users { get; init; }

    [Description("Teams to give the role: id or name.")]
    public List<string>? Teams { get; init; }
}

public sealed class TablePrivileges
{
    [Description("Table logical name.")]
    public required string Table { get; init; }

    public AccessDepth? Create { get; init; }
    public AccessDepth? Read { get; init; }
    public AccessDepth? Write { get; init; }
    public AccessDepth? Delete { get; init; }
    public AccessDepth? Append { get; init; }
    public AccessDepth? AppendTo { get; init; }
    public AccessDepth? Assign { get; init; }
    public AccessDepth? Share { get; init; }
}

public sealed class NamedPrivilege
{
    public required string Name { get; init; }

    public required AccessDepth Depth { get; init; }
}

[Description("A field security profile: which secured columns its members may read, create and update. A column that is not secured yet is secured first.")]
public sealed class FieldSecurityProfileSpec
{
    public required string Name { get; init; }

    public string? Description { get; init; }

    public List<ColumnPermission>? Columns { get; init; }

    [Description("Users to add: id, domain name or primary email.")]
    public List<string>? Users { get; init; }

    [Description("Teams to add: id or name.")]
    public List<string>? Teams { get; init; }
}

public sealed class ColumnPermission
{
    [Description("Table logical name.")]
    public required string Table { get; init; }

    [Description("Column logical name.")]
    public required string Column { get; init; }

    [Description("Default false.")]
    public bool? Read { get; init; }

    [Description("Default false.")]
    public bool? Create { get; init; }

    [Description("Default false.")]
    public bool? Update { get; init; }
}

/// <summary>
/// Plans role_apply: a root security role, its privileges at a depth, who has it, and field security profiles with
/// their column permissions and members. Taking a privilege away is destructive; nothing left out is taken away.
/// </summary>
public sealed class RolePlanner : IComponentPlanner<RoleApplySpec>
{
    public const string Family = "role";

    public const int FieldSecurityProfileType = 70;

    private const int Allowed = 4;

    private sealed record Privilege(Guid Id, string Name, bool Basic, bool Local, bool Deep, bool Global);

    public async Task<Plan> PlanAsync(RoleApplySpec spec, PlanContext context, CancellationToken ct)
    {
        if (spec.Role is null && spec.FieldSecurityProfiles is not { Count: > 0 }) throw Invalid("Give role, fieldSecurityProfiles, or both.");
        await context.SolutionAsync(spec.Solution, ct);
        var steps = new List<PlanStep>();
        var locks = new List<string>();
        if (spec.Role is { } role) await PlanRoleAsync(role, context, steps, locks, ct);
        foreach (var profile in spec.FieldSecurityProfiles ?? []) await PlanProfileAsync(profile, context, steps, locks, ct);
        return new Plan(steps, lockKeys: locks);
    }

    // ── Role ─────────────────────────────────────────────────────────────────

    private static async Task PlanRoleAsync(RoleSpec spec, PlanContext context, List<PlanStep> steps, List<string> locks, CancellationToken ct)
    {
        var client = context.Client;
        var name = spec.Name?.Trim() ?? "";
        if (name.Length == 0) throw Invalid("role.name is required.");
        locks.Add($"role:{name.ToLowerInvariant()}");
        var wanted = await WantedPrivilegesAsync(spec, context, ct);
        var users = await UsersAsync(client, spec.Users, ct);
        var teams = await TeamsAsync(client, spec.Teams, ct);
        var found = await ComponentKinds.FindAsync(client, ComponentKind.Role, name, null, ct);

        Guid roleId;
        Dictionary<Guid, PrivilegeDepth> current;
        if (found is null)
        {
            roleId = Guid.NewGuid();
            current = [];
            var businessUnit = await BusinessUnitAsync(client, spec.BusinessUnit, ct);
            var created = new Entity("role", roleId) { ["name"] = name, ["businessunitid"] = new EntityReference("businessunit", businessUnit.Id) };
            if (spec.Description is not null) created["description"] = spec.Description;
            steps.Add(new PlanStep
            {
                Op = "createRole",
                Target = name,
                Detail = $"in business unit {businessUnit.Name}",
                Request = new CreateRequest { Target = created },
            });
        }
        else
        {
            roleId = found.Id;
            if (!found.Customizable)
            {
                steps.Add(PlanStep.Blocked("updateRole", name, $"Role {name} is managed and not customizable."));
                return;
            }

            if (spec.BusinessUnit is { } unit)
            {
                var wantedUnit = await BusinessUnitAsync(client, unit, ct);
                if (found.Row?.GetAttributeValue<EntityReference>("businessunitid")?.Id is { } now && now != wantedUnit.Id)
                    steps.Add(PlanStep.Blocked("updateRole", name, $"A role's business unit cannot change; {name} is in another business unit than {wantedUnit.Name}."));
            }

            if (spec.Description is { } description && description != found.Row?.GetAttributeValue<string>("description"))
            {
                var update = new Entity("role", roleId) { ["description"] = description };
                steps.Add(new PlanStep
                {
                    Op = "updateRole",
                    Target = name,
                    Detail = "description",
                    Action = async (step, token) =>
                    {
                        await step.Client.UpdateAsync(update, token);
                        await WebResourcePlanner.AddToSolutionAsync(step, roleId, ComponentKinds.RoleType, token);
                    },
                });
            }

            var response = (RetrieveRolePrivilegesRoleResponse)await client.ExecuteAsync(new RetrieveRolePrivilegesRoleRequest { RoleId = roleId }, ct);
            current = (response.RolePrivileges ?? []).GroupBy(p => p.PrivilegeId).ToDictionary(g => g.Key, g => g.Max(p => p.Depth));
        }

        var add = new List<RolePrivilege>();
        var addDetail = new List<string>();
        // A lower depth takes access away, like a removed privilege, so it is its own destructive step.
        var lower = new List<RolePrivilege>();
        var lowerDetail = new List<string>();
        var remove = new List<(Guid Id, string Name)>();
        foreach (var (privilege, depth) in wanted)
        {
            var has = current.TryGetValue(privilege.Id, out var now) ? now : (PrivilegeDepth?)null;
            if (depth == AccessDepth.None)
            {
                if (has is not null) remove.Add((privilege.Id, privilege.Name));
                continue;
            }

            var sdkDepth = ToSdk(depth);
            if (has == sdkDepth) continue;
            var change = $"{privilege.Name}: {(has is null ? "none" : Name(has.Value))} → {Name(sdkDepth)}";
            if (has is { } before && sdkDepth < before)
            {
                lower.Add(new RolePrivilege { PrivilegeId = privilege.Id, Depth = sdkDepth });
                lowerDetail.Add(change);
                continue;
            }

            add.Add(new RolePrivilege { PrivilegeId = privilege.Id, Depth = sdkDepth });
            addDetail.Add(change);
        }

        if (add.Count > 0)
        {
            var request = new AddPrivilegesRoleRequest { RoleId = roleId, Privileges = [.. add] };
            steps.Add(new PlanStep
            {
                Op = "setPrivileges",
                Target = name,
                Detail = string.Join("\n", addDetail),
                Action = async (step, token) =>
                {
                    await step.Client.ExecuteAsync(request, token);
                    await WebResourcePlanner.AddToSolutionAsync(step, roleId, ComponentKinds.RoleType, token);
                },
            });
        }

        if (lower.Count > 0)
        {
            // AddPrivilegesRole adds a privilege the role already has at its own depth, so lowering one means
            // removing it and adding it again at the lower depth.
            var lowered = lower.ToList();
            steps.Add(new PlanStep
            {
                Op = "lowerPrivileges",
                Target = name,
                Effect = PlanEffect.Destructive,
                Detail = $"Users with only this role lose access: {string.Join("\n", lowerDetail)}",
                Action = async (step, token) =>
                {
                    foreach (var privilege in lowered)
                        await step.Client.ExecuteAsync(new RemovePrivilegeRoleRequest { RoleId = roleId, PrivilegeId = privilege.PrivilegeId }, token);
                    await step.Client.ExecuteAsync(new AddPrivilegesRoleRequest { RoleId = roleId, Privileges = [.. lowered] }, token);
                    await WebResourcePlanner.AddToSolutionAsync(step, roleId, ComponentKinds.RoleType, token);
                },
            });
        }

        if (remove.Count > 0)
        {
            steps.Add(new PlanStep
            {
                Op = "removePrivileges",
                Target = name,
                Effect = PlanEffect.Destructive,
                Detail = $"Users with only this role lose: {string.Join(", ", remove.Select(r => r.Name))}",
                Action = async (step, token) =>
                {
                    foreach (var (id, _) in remove)
                        await step.Client.ExecuteAsync(new RemovePrivilegeRoleRequest { RoleId = roleId, PrivilegeId = id }, token);
                },
                SolutionAware = false,
            });
        }

        var copies = found is null ? [] : await RoleCopiesAsync(client, roleId, ct);
        foreach (var user in users)
        {
            if (found is not null && await HasLinkAsync(client, "systemuserroles", "systemuserid", user.Id, "roleid", copies, ct)) continue;
            steps.Add(AssignStep("assignRole", name, roleId, user, "systemuser", "systemuserroles_association"));
        }

        foreach (var team in teams)
        {
            if (found is not null && await HasLinkAsync(client, "teamroles", "teamid", team.Id, "roleid", copies, ct)) continue;
            steps.Add(AssignStep("assignRoleToTeam", name, roleId, team, "team", "teamroles_association"));
        }
    }

    private static PlanStep AssignStep(string op, string role, Guid roleId, Principal principal, string table, string relationship) => new()
    {
        Op = op,
        Target = $"{role} → {principal.Name}",
        SolutionAware = false,
        Action = async (step, token) =>
        {
            // A user or team gets the copy of the role in its own business unit.
            var query = new QueryExpression("role") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("roleid") };
            query.Criteria.AddCondition("parentrootroleid", ConditionOperator.Equal, roleId);
            query.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, principal.BusinessUnitId);
            var copy = (await step.Client.RetrieveMultipleAsync(query, token)).Entities.FirstOrDefault()?.Id ?? roleId;
            await step.Client.ExecuteAsync(new AssociateRequest
            {
                Target = new EntityReference(table, principal.Id),
                Relationship = new Relationship(relationship),
                RelatedEntities = [new EntityReference("role", copy)],
            }, token);
        },
    };

    /// <summary>The privileges the spec names, each with the depth it wants and checked against the depths it allows.</summary>
    private static async Task<List<(Privilege Privilege, AccessDepth Depth)>> WantedPrivilegesAsync(RoleSpec spec, PlanContext context, CancellationToken ct)
    {
        var wanted = new List<(Privilege, AccessDepth)>();
        foreach (var table in spec.Tables ?? [])
        {
            var logical = table.Table.Trim().ToLowerInvariant();
            var metadata = await context.Metadata.TableAsync(logical, ct) ?? throw Invalid($"Table {logical} does not exist.");
            var rights = new (PrivilegeType Type, AccessDepth? Depth)[]
            {
                (PrivilegeType.Create, table.Create), (PrivilegeType.Read, table.Read), (PrivilegeType.Write, table.Write),
                (PrivilegeType.Delete, table.Delete), (PrivilegeType.Append, table.Append), (PrivilegeType.AppendTo, table.AppendTo),
                (PrivilegeType.Assign, table.Assign), (PrivilegeType.Share, table.Share),
            };
            foreach (var (type, depth) in rights)
            {
                if (depth is null) continue;
                var meta = (metadata.Privileges ?? []).FirstOrDefault(p => p.PrivilegeType == type)
                    ?? throw Invalid($"Table {logical} has no {type} privilege (an organization-owned table has no assign or share).");
                wanted.Add((new Privilege(meta.PrivilegeId, meta.Name, meta.CanBeBasic, meta.CanBeLocal, meta.CanBeDeep, meta.CanBeGlobal), depth.Value));
            }
        }

        var named = spec.Privileges ?? [];
        if (named.Count > 0)
        {
            var query = new QueryExpression("privilege") { NoLock = true, ColumnSet = new ColumnSet("name", "canbebasic", "canbelocal", "canbedeep", "canbeglobal") };
            query.Criteria.AddCondition("name", ConditionOperator.In, named.Select(p => (object)p.Name.Trim()).ToArray());
            var rows = (await context.Client.RetrieveMultipleAsync(query, ct)).Entities;
            foreach (var item in named)
            {
                var row = rows.FirstOrDefault(r => string.Equals(r.GetAttributeValue<string>("name"), item.Name.Trim(), StringComparison.OrdinalIgnoreCase))
                    ?? throw Invalid($"There is no privilege named {item.Name}.");
                wanted.Add((new Privilege(row.Id, row.GetAttributeValue<string>("name"),
                    row.GetAttributeValue<bool?>("canbebasic") ?? false, row.GetAttributeValue<bool?>("canbelocal") ?? false,
                    row.GetAttributeValue<bool?>("canbedeep") ?? false, row.GetAttributeValue<bool?>("canbeglobal") ?? false), item.Depth));
            }
        }

        var twice = wanted.GroupBy(w => w.Item1.Id).FirstOrDefault(g => g.Count() > 1);
        if (twice is not null) throw Invalid($"The spec gives {twice.First().Item1.Name} twice.");
        foreach (var (privilege, depth) in wanted)
        {
            var allowed = depth switch
            {
                AccessDepth.None => true,
                AccessDepth.Basic => privilege.Basic,
                AccessDepth.Local => privilege.Local,
                AccessDepth.Deep => privilege.Deep,
                _ => privilege.Global,
            };
            if (!allowed)
            {
                var depths = new[] { (privilege.Basic, "basic"), (privilege.Local, "local"), (privilege.Deep, "deep"), (privilege.Global, "global") }
                    .Where(d => d.Item1).Select(d => d.Item2);
                throw Invalid($"{privilege.Name} cannot be given at depth {depth.ToString().ToLowerInvariant()}; it allows {string.Join(", ", depths)}.");
            }
        }

        return wanted;
    }

    // ── Field security profiles ──────────────────────────────────────────────

    private static async Task PlanProfileAsync(FieldSecurityProfileSpec spec, PlanContext context, List<PlanStep> steps, List<string> locks, CancellationToken ct)
    {
        var client = context.Client;
        var name = spec.Name?.Trim() ?? "";
        if (name.Length == 0) throw Invalid("Every field security profile needs a name.");
        locks.Add($"fieldsecurityprofile:{name.ToLowerInvariant()}");
        var users = await UsersAsync(client, spec.Users, ct);
        var teams = await TeamsAsync(client, spec.Teams, ct);

        var query = new QueryExpression("fieldsecurityprofile") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name", "description", "iscustomizable") };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, name);
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count > 1) throw Invalid($"More than one field security profile is named {name}.");
        var profile = rows.FirstOrDefault();
        var profileId = profile?.Id ?? Guid.NewGuid();
        if (profile is null)
        {
            var created = new Entity("fieldsecurityprofile", profileId) { ["name"] = name };
            if (spec.Description is not null) created["description"] = spec.Description;
            steps.Add(new PlanStep { Op = "createFieldSecurityProfile", Target = name, Request = new CreateRequest { Target = created } });
        }
        else if (profile.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
        {
            steps.Add(PlanStep.Blocked("updateFieldSecurityProfile", name, $"Field security profile {name} is managed and not customizable."));
            return;
        }
        else if (spec.Description is { } description && description != profile.GetAttributeValue<string>("description"))
        {
            var update = new Entity("fieldsecurityprofile", profileId) { ["description"] = description };
            steps.Add(new PlanStep
            {
                Op = "updateFieldSecurityProfile",
                Target = name,
                Detail = "description",
                Action = async (step, token) =>
                {
                    await step.Client.UpdateAsync(update, token);
                    await WebResourcePlanner.AddToSolutionAsync(step, profileId, FieldSecurityProfileType, token);
                },
            });
        }

        var secured = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var permission in spec.Columns ?? [])
        {
            var table = permission.Table.Trim().ToLowerInvariant();
            var column = permission.Column.Trim().ToLowerInvariant();
            var metadata = await context.Metadata.TableAsync(table, ct) ?? throw Invalid($"Table {table} does not exist.");
            var attribute = (metadata.Attributes ?? []).FirstOrDefault(a => string.Equals(a.LogicalName, column, StringComparison.OrdinalIgnoreCase))
                ?? throw Invalid($"Table {table} has no column {column}.");
            if (attribute.IsSecured != true && secured.Add($"{table}.{column}"))
            {
                if (attribute.CanBeSecuredForRead == false && attribute.CanBeSecuredForUpdate == false && attribute.CanBeSecuredForCreate == false)
                {
                    steps.Add(PlanStep.Blocked("secureColumn", $"{table}.{column}", $"Column {table}.{column} cannot be secured."));
                    continue;
                }

                steps.Add(new PlanStep
                {
                    Op = "secureColumn",
                    Target = $"{table}.{column}",
                    // Everyone outside a profile that allows it stops seeing the column's values.
                    Effect = PlanEffect.Destructive,
                    Detail = "turn on column security; only members of a profile that allows it can then see the column's values",
                    Action = async (step, token) =>
                    {
                        var read = (RetrieveAttributeResponse)await step.Client.ExecuteAsync(
                            new RetrieveAttributeRequest { EntityLogicalName = table, LogicalName = column, RetrieveAsIfPublished = true }, token);
                        var attributeNow = read.AttributeMetadata;
                        attributeNow.IsSecured = true;
                        var request = new UpdateAttributeRequest { EntityName = table, Attribute = attributeNow, MergeLabels = true };
                        if (!string.IsNullOrWhiteSpace(step.SolutionUniqueName)) request.SolutionUniqueName = step.SolutionUniqueName;
                        await step.Client.ExecuteAsync(request, token);
                    },
                    Publishes = [new PublishTarget(PublishKind.Entity, table)],
                });
            }

            var wanted = (Read: permission.Read == true, Create: permission.Create == true, Update: permission.Update == true);
            Entity? existing = null;
            if (profile is not null)
            {
                var permissions = new QueryExpression("fieldpermission") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("canread", "cancreate", "canupdate") };
                permissions.Criteria.AddCondition("fieldsecurityprofileid", ConditionOperator.Equal, profileId);
                permissions.Criteria.AddCondition("entityname", ConditionOperator.Equal, table);
                permissions.Criteria.AddCondition("attributelogicalname", ConditionOperator.Equal, column);
                existing = (await client.RetrieveMultipleAsync(permissions, ct)).Entities.FirstOrDefault();
            }

            bool Is(string col) => existing?.GetAttributeValue<OptionSetValue>(col)?.Value == Allowed;
            if (existing is not null && Is("canread") == wanted.Read && Is("cancreate") == wanted.Create && Is("canupdate") == wanted.Update) continue;
            var row = new Entity("fieldpermission", existing?.Id ?? Guid.Empty)
            {
                ["canread"] = new OptionSetValue(wanted.Read ? Allowed : 0),
                ["cancreate"] = new OptionSetValue(wanted.Create ? Allowed : 0),
                ["canupdate"] = new OptionSetValue(wanted.Update ? Allowed : 0),
            };
            if (existing is null)
            {
                row["fieldsecurityprofileid"] = new EntityReference("fieldsecurityprofile", profileId);
                row["entityname"] = table;
                row["attributelogicalname"] = column;
            }

            static string Rights(bool read, bool create, bool update)
            {
                var list = string.Join(", ", new[] { read ? "read" : null, create ? "create" : null, update ? "update" : null }.OfType<string>());
                return list.Length == 0 ? "no access" : list;
            }

            var rights = Rights(wanted.Read, wanted.Create, wanted.Update);
            // Taking a right away from the profile's members is destructive.
            var takesAway = existing is not null
                && ((Is("canread") && !wanted.Read) || (Is("cancreate") && !wanted.Create) || (Is("canupdate") && !wanted.Update));
            steps.Add(new PlanStep
            {
                Op = existing is null ? "addColumnPermission" : "updateColumnPermission",
                Target = $"{name}: {table}.{column}",
                Effect = takesAway ? PlanEffect.Destructive : PlanEffect.Change,
                Detail = existing is null ? rights : $"{Rights(Is("canread"), Is("cancreate"), Is("canupdate"))} → {rights}",
                Request = existing is null ? new CreateRequest { Target = row } : new UpdateRequest { Target = row },
                SolutionAware = false,
            });
        }

        foreach (var user in users)
        {
            if (profile is not null && await HasLinkAsync(client, "systemuserprofiles", "systemuserid", user.Id, "fieldsecurityprofileid", [profileId], ct)) continue;
            steps.Add(MemberStep(name, profileId, user, "systemuser", "systemuserprofiles_association"));
        }

        foreach (var team in teams)
        {
            if (profile is not null && await HasLinkAsync(client, "teamprofiles", "teamid", team.Id, "fieldsecurityprofileid", [profileId], ct)) continue;
            steps.Add(MemberStep(name, profileId, team, "team", "teamprofiles_association"));
        }
    }

    private static PlanStep MemberStep(string profile, Guid profileId, Principal principal, string table, string relationship) => new()
    {
        Op = "addProfileMember",
        Target = $"{profile} → {principal.Name}",
        SolutionAware = false,
        Request = new AssociateRequest
        {
            Target = new EntityReference("fieldsecurityprofile", profileId),
            Relationship = new Relationship(relationship),
            RelatedEntities = [new EntityReference(table, principal.Id)],
        },
    };

    // ── Lookups ──────────────────────────────────────────────────────────────

    private sealed record Principal(Guid Id, string Name, Guid BusinessUnitId);

    private static async Task<List<Principal>> UsersAsync(IAgentClient client, List<string>? users, CancellationToken ct)
    {
        var found = new List<Principal>();
        foreach (var user in users ?? [])
        {
            var key = user.Trim();
            var query = new QueryExpression("systemuser") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("fullname", "domainname", "businessunitid") };
            if (Guid.TryParse(key, out var id)) query.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, id);
            else
            {
                var filter = new FilterExpression(LogicalOperator.Or);
                filter.AddCondition("domainname", ConditionOperator.Equal, key);
                filter.AddCondition("internalemailaddress", ConditionOperator.Equal, key);
                query.Criteria.AddFilter(filter);
            }

            var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
            if (rows.Count == 0) throw Invalid($"There is no user {key}. Give the id, domain name or primary email.");
            if (rows.Count > 1) throw Invalid($"More than one user matches {key}; give the id.");
            found.Add(new Principal(rows[0].Id, rows[0].GetAttributeValue<string>("fullname") ?? key, rows[0].GetAttributeValue<EntityReference>("businessunitid")?.Id ?? Guid.Empty));
        }

        return found;
    }

    private static async Task<List<Principal>> TeamsAsync(IAgentClient client, List<string>? teams, CancellationToken ct)
    {
        var found = new List<Principal>();
        foreach (var team in teams ?? [])
        {
            var key = team.Trim();
            var query = new QueryExpression("team") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name", "businessunitid") };
            if (Guid.TryParse(key, out var id)) query.Criteria.AddCondition("teamid", ConditionOperator.Equal, id);
            else query.Criteria.AddCondition("name", ConditionOperator.Equal, key);
            var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
            if (rows.Count == 0) throw Invalid($"There is no team {key}.");
            if (rows.Count > 1) throw Invalid($"More than one team is named {key}; give the id.");
            found.Add(new Principal(rows[0].Id, rows[0].GetAttributeValue<string>("name") ?? key, rows[0].GetAttributeValue<EntityReference>("businessunitid")?.Id ?? Guid.Empty));
        }

        return found;
    }

    private static async Task<(Guid Id, string Name)> BusinessUnitAsync(IAgentClient client, string? name, CancellationToken ct)
    {
        var query = new QueryExpression("businessunit") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("name") };
        if (name is null) query.Criteria.AddCondition("parentbusinessunitid", ConditionOperator.Null);
        else query.Criteria.AddCondition("name", ConditionOperator.Equal, name.Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0) throw Invalid(name is null ? "The root business unit was not found." : $"There is no business unit named {name}.");
        if (rows.Count > 1) throw Invalid($"More than one business unit is named {name}.");
        return (rows[0].Id, rows[0].GetAttributeValue<string>("name") ?? name ?? "root");
    }

    /// <summary>The role and its copies in the other business units.</summary>
    private static async Task<List<Guid>> RoleCopiesAsync(IAgentClient client, Guid roleId, CancellationToken ct)
    {
        var query = new QueryExpression("role") { NoLock = true, ColumnSet = new ColumnSet("roleid") };
        query.Criteria.AddCondition("parentrootroleid", ConditionOperator.Equal, roleId);
        var ids = (await client.RetrieveMultipleAsync(query, ct)).Entities.Select(r => r.Id).ToList();
        if (!ids.Contains(roleId)) ids.Add(roleId);
        return ids;
    }

    private static async Task<bool> HasLinkAsync(
        IAgentClient client, string intersect, string fromColumn, Guid from, string toColumn, List<Guid> to, CancellationToken ct)
    {
        var query = new QueryExpression(intersect) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(toColumn) };
        query.Criteria.AddCondition(fromColumn, ConditionOperator.Equal, from);
        query.Criteria.AddCondition(toColumn, ConditionOperator.In, to.Cast<object>().ToArray());
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.Count > 0;
    }

    private static PrivilegeDepth ToSdk(AccessDepth depth) => depth switch
    {
        AccessDepth.Basic => PrivilegeDepth.Basic,
        AccessDepth.Local => PrivilegeDepth.Local,
        AccessDepth.Deep => PrivilegeDepth.Deep,
        _ => PrivilegeDepth.Global,
    };

    private static string Name(PrivilegeDepth depth) => depth.ToString().ToLowerInvariant();

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
