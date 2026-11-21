using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tests.Tools.Agent.Kernel;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tests.Tools.Agent.Components;

/// <summary>
/// An in-memory environment of rows behind an agent client: creates, updates, deletes, links and solution messages
/// change the rows the way Dataverse does, so a plan can be applied and planned again. Metadata messages go to a
/// <see cref="SchemaWorld"/>, and global choices are kept in its <see cref="SchemaWorld.GlobalChoices"/>.
/// </summary>
internal sealed class RowWorld : IAgentClient
{
    public SchemaWorld Schema { get; } = new();

    public Dictionary<string, List<Entity>> Rows { get; } = new(StringComparer.OrdinalIgnoreCase);

    public HashSet<(string Relationship, Guid From, Guid To)> Links { get; } = [];

    public List<OrganizationRequest> Executed { get; } = [];

    /// <summary>Components that depend on an id, answered by RetrieveDependenciesForDelete.</summary>
    public Dictionary<Guid, int> Dependents { get; } = [];

    public Func<OrganizationRequest, Exception?>? Fail { get; set; }

    public HashSet<string> Features { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>The privileges of each role, as RetrieveRolePrivilegesRole answers them.</summary>
    public Dictionary<Guid, Dictionary<Guid, PrivilegeDepth>> RolePrivileges { get; } = [];

    /// <summary>What ValidateApp answers.</summary>
    public List<ValidationIssue> AppIssues { get; } = [];

    /// <summary>The intersect table each many-to-many relationship keeps its links in.</summary>
    private static readonly Dictionary<string, string> Intersects = new(StringComparer.OrdinalIgnoreCase)
    {
        ["systemuserroles_association"] = "systemuserroles",
        ["teamroles_association"] = "teamroles",
        ["systemuserprofiles_association"] = "systemuserprofiles",
        ["teamprofiles_association"] = "teamprofiles",
        ["appmoduleroles_association"] = "appmoduleroles",
    };

    public RowWorld()
    {
        foreach (var publisher in Schema.Client.Publishers) Add(publisher);
        foreach (var solution in Schema.Client.Solutions) Add(solution);
        Add(new Entity("organization", Guid.NewGuid()) { ["languagecode"] = SchemaWorld.English });
    }

    public Guid CoreSolutionId => Table("solution").Single(s => s.GetAttributeValue<string>("uniquename") == "Core").Id;

    public Capabilities Capabilities() => new("9.2", Features, ExportSolutionAsync: false);

    public PlanContext Context() => new(this, Capabilities(), "https://rows.crm.dynamics.com");

    public ApplyKernel Kernel(IApplyFamily family) =>
        new(family, Context, new KernelOptions(TimeSpan.FromSeconds(5), KernelFakes.NoWaitRetry()));

    public async Task<ApplyResult> ApplyAsync(IApplyFamily family, IApplySpec spec)
    {
        var kernel = Kernel(family);
        var preview = await kernel.PlanAsync(spec, CancellationToken.None);
        return await kernel.ApplyAsync(spec, preview.Hash, CancellationToken.None);
    }

    public List<Entity> Table(string table) => Rows.TryGetValue(table, out var rows) ? rows : Rows[table] = [];

    public Entity Add(Entity row)
    {
        if (row.Id == Guid.Empty) row.Id = Guid.NewGuid();
        row[PowerTools.API.Tools.Agent.Components.Shared.ComponentKinds.IdColumn(row.LogicalName)] = row.Id;
        Table(row.LogicalName).Add(row);
        return row;
    }

    public Entity Row(string table, Guid id) => Table(table).Single(r => r.Id == id);

    public List<OrganizationRequest> Writes =>
        Executed.Where(r => !r.RequestName.StartsWith("Retrieve", StringComparison.Ordinal)).ToList();

    // ── IAgentClient ─────────────────────────────────────────────────────────

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Executed.Add(request);
        if (!request.RequestName.StartsWith("Retrieve", StringComparison.Ordinal) && Fail?.Invoke(request) is { } error) throw error;
        return Task.FromResult(Handle(request));
    }

    /// <summary>Answers a request the world does not model (for example a solution import); null passes it on.</summary>
    public Func<OrganizationRequest, OrganizationResponse?>? OnExecute { get; set; }

    private OrganizationResponse Handle(OrganizationRequest request)
    {
        if (OnExecute?.Invoke(request) is { } answered) return answered;
        switch (request)
        {
            case CreateRequest create:
                return new CreateResponse { Results = new ParameterCollection { ["id"] = Create(create.Target) } };
            case UpdateRequest update:
                Update(update.Target);
                return new UpdateResponse();
            case DeleteRequest delete:
                Delete(delete.Target.LogicalName, delete.Target.Id);
                return new DeleteResponse();
            case UpsertRequest upsert:
            {
                var existing = Match(upsert.Target);
                if (existing is not null)
                {
                    upsert.Target.Id = existing.Id;
                    Update(upsert.Target);
                }

                var id = existing?.Id ?? Create(upsert.Target);
                return new UpsertResponse { Results = new ParameterCollection { ["RecordCreated"] = existing is null, ["Target"] = new EntityReference(upsert.Target.LogicalName, id) } };
            }

            case AssociateRequest associate:
                foreach (var related in associate.RelatedEntities)
                {
                    Links.Add((associate.Relationship.SchemaName, associate.Target.Id, related.Id));
                    if (Intersects.TryGetValue(associate.Relationship.SchemaName, out var intersect))
                    {
                        Table(intersect).Add(new Entity(intersect, Guid.NewGuid())
                        {
                            [$"{associate.Target.LogicalName}id"] = associate.Target.Id,
                            [$"{related.LogicalName}id"] = related.Id,
                        });
                    }
                }

                return new AssociateResponse();
            case RetrieveUnpublishedMultipleRequest unpublished:
                return new RetrieveUnpublishedMultipleResponse
                {
                    Results = new ParameterCollection { ["EntityCollection"] = RetrieveMultipleAsync(unpublished.Query, CancellationToken.None).Result },
                };
            case RetrieveRolePrivilegesRoleRequest privileges:
                return new RetrieveRolePrivilegesRoleResponse
                {
                    Results = new ParameterCollection
                    {
                        ["RolePrivileges"] = RolePrivileges.GetValueOrDefault(privileges.RoleId, [])
                            .Select(p => new RolePrivilege { PrivilegeId = p.Key, Depth = p.Value }).ToArray(),
                    },
                };
            case AddPrivilegesRoleRequest add:
            {
                if (!RolePrivileges.TryGetValue(add.RoleId, out var granted)) RolePrivileges[add.RoleId] = granted = [];
                foreach (var privilege in add.Privileges) granted[privilege.PrivilegeId] = privilege.Depth;
                return new AddPrivilegesRoleResponse();
            }

            case RemovePrivilegeRoleRequest remove:
                RolePrivileges.GetValueOrDefault(remove.RoleId)?.Remove(remove.PrivilegeId);
                return new RemovePrivilegeRoleResponse();
            case AddAppComponentsRequest add:
                foreach (var component in add.Components)
                {
                    Add(new Entity("appmodulecomponent")
                    {
                        ["appmoduleidunique"] = add.AppId,
                        ["objectid"] = component.Id,
                        ["componenttype"] = new OptionSetValue(component.LogicalName switch
                        {
                            "entity" => 1, "systemform" => 60, "savedquery" => 26, "savedqueryvisualization" => 59, "sitemap" => 62, _ => 0,
                        }),
                    });
                }

                return new AddAppComponentsResponse();
            case ValidateAppRequest:
                return new ValidateAppResponse
                {
                    Results = new ParameterCollection
                    {
                        ["AppValidationResponse"] = new AppValidationResponse { ValidationSuccess = AppIssues.Count == 0, ValidationIssueList = [.. AppIssues] },
                    },
                };
            case DisassociateRequest disassociate:
                foreach (var related in disassociate.RelatedEntities) Links.Remove((disassociate.Relationship.SchemaName, disassociate.Target.Id, related.Id));
                return new DisassociateResponse();
            case ExecuteTransactionRequest transaction:
            {
                var responses = new OrganizationResponseCollection();
                foreach (var inner in transaction.Requests) responses.Add(Handle(inner));
                return new ExecuteTransactionResponse { Results = new ParameterCollection { ["Responses"] = responses } };
            }

            case RetrieveUnpublishedRequest unpublished:
                return new RetrieveUnpublishedResponse { Results = new ParameterCollection { ["Entity"] = Row(unpublished.Target.LogicalName, unpublished.Target.Id) } };
            case SetStateRequest state:
                Update(new Entity(state.EntityMoniker.LogicalName, state.EntityMoniker.Id) { ["statecode"] = state.State, ["statuscode"] = state.Status });
                return new SetStateResponse();
            case AddSolutionComponentRequest add:
                Add(new Entity("solutioncomponent")
                {
                    ["solutionid"] = SolutionId(add.SolutionUniqueName),
                    ["objectid"] = add.ComponentId,
                    ["componenttype"] = new OptionSetValue(add.ComponentType),
                });
                return new AddSolutionComponentResponse();
            case RemoveSolutionComponentRequest remove:
                Table("solutioncomponent").RemoveAll(r => (Guid)r["solutionid"] == SolutionId(remove.SolutionUniqueName) && (Guid)r["objectid"] == remove.ComponentId);
                return new RemoveSolutionComponentResponse();
            case CloneAsPatchRequest patch:
            {
                var parent = Table("solution").Single(s => s.GetAttributeValue<string>("uniquename") == patch.ParentSolutionUniqueName);
                var created = Add(new Entity("solution")
                {
                    ["uniquename"] = $"{patch.ParentSolutionUniqueName}_Patch_{Table("solution").Count}",
                    ["friendlyname"] = patch.DisplayName,
                    ["version"] = patch.VersionNumber,
                    ["parentsolutionid"] = parent.ToEntityReference(),
                    ["publisherid"] = parent["publisherid"],
                    ["ismanaged"] = false,
                });
                return new CloneAsPatchResponse { Results = new ParameterCollection { ["SolutionId"] = created.Id } };
            }

            case CloneAsSolutionRequest clone:
            {
                var parent = Table("solution").Single(s => s.GetAttributeValue<string>("uniquename") == clone.ParentSolutionUniqueName);
                Table("solution").RemoveAll(s => s.GetAttributeValue<EntityReference>("parentsolutionid")?.Id == parent.Id);
                parent["version"] = clone.VersionNumber;
                return new CloneAsSolutionResponse { Results = new ParameterCollection { ["SolutionId"] = parent.Id } };
            }

            case RetrieveDependenciesForDeleteRequest dependencies:
            {
                var count = Dependents.GetValueOrDefault(dependencies.ObjectId);
                var rows = Enumerable.Range(0, count).Select(_ => new Entity("dependency")
                {
                    ["dependentcomponenttype"] = new OptionSetValue(60),
                    ["dependentcomponentobjectid"] = Guid.NewGuid(),
                    ["requiredcomponenttype"] = new OptionSetValue(dependencies.ComponentType),
                    ["requiredcomponentobjectid"] = dependencies.ObjectId,
                }).ToList();
                return new RetrieveDependenciesForDeleteResponse { Results = new ParameterCollection { ["EntityCollection"] = new EntityCollection(rows) } };
            }

            case PublishXmlRequest or PublishAllXmlRequest:
                return new OrganizationResponse();
            case CreateOptionSetRequest create:
                Schema.GlobalChoices[create.OptionSet.Name] = (OptionSetMetadata)create.OptionSet;
                SchemaWorld.Set(create.OptionSet, "IsManaged", false);
                create.OptionSet.IsCustomizable ??= new BooleanManagedProperty(true);
                return new CreateOptionSetResponse();
            case UpdateOptionSetRequest update:
            {
                var set = Schema.GlobalChoices[update.OptionSet.Name];
                set.DisplayName = update.OptionSet.DisplayName;
                set.Description = update.OptionSet.Description;
                return new UpdateOptionSetResponse();
            }

            case InsertOptionValueRequest insert when insert.OptionSetName is not null:
                Schema.GlobalChoices[insert.OptionSetName].Options.Add(new OptionMetadata(insert.Label, insert.Value)
                {
                    Description = insert.Description,
                    Color = insert.Parameters.TryGetValue("Color", out var color) ? (string?)color : null,
                });
                return new InsertOptionValueResponse();
            case UpdateOptionValueRequest update when update.OptionSetName is not null:
            {
                var option = Schema.GlobalChoices[update.OptionSetName].Options.Single(o => o.Value == update.Value);
                option.Label = update.Label;
                if (update.Description is not null) option.Description = update.Description;
                if (update.Parameters.TryGetValue("Color", out var newColor)) option.Color = (string?)newColor;
                return new UpdateOptionValueResponse();
            }

            case OrderOptionRequest order:
            {
                var set = Schema.GlobalChoices[order.OptionSetName];
                var ordered = order.Values.Select(v => set.Options.Single(o => o.Value == v)).ToList();
                set.Options.Clear();
                foreach (var option in ordered) set.Options.Add(option);
                return new OrderOptionResponse();
            }

            case DeleteOptionValueRequest delete when delete.OptionSetName is not null:
            {
                var set = Schema.GlobalChoices[delete.OptionSetName];
                set.Options.Remove(set.Options.Single(o => o.Value == delete.Value));
                return new DeleteOptionValueResponse();
            }

            case DeleteOptionSetRequest delete:
                Schema.GlobalChoices.Remove(delete.Name);
                return new DeleteOptionSetResponse();
            case DeleteEntityRequest delete:
                Schema.Tables.Remove(delete.LogicalName);
                return new DeleteEntityResponse();
            default:
                return Schema.Client.ExecuteAsync(request, CancellationToken.None).GetAwaiter().GetResult();
        }
    }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        if (query is FetchExpression fetch) return Task.FromResult(Fetch(fetch.Query));
        var expression = (QueryExpression)query;
        var rows = Table(expression.EntityName).Where(row => Matches(row, expression.Criteria)).ToList();
        if (expression.TopCount is { } top) rows = rows.Take(top).ToList();
        return Task.FromResult(new EntityCollection(rows.Select(Copy).ToList()));
    }

    public Task<Entity> RetrieveAsync(string table, Guid id, ColumnSet columns, CancellationToken cancellationToken) =>
        Table(table).FirstOrDefault(r => r.Id == id) is { } row
            ? Task.FromResult(Copy(row))
            : throw FakeAgentClient.Fault(unchecked((int)0x80040217), $"{table} {id} does not exist.");

    public Task<Guid> CreateAsync(Entity entity, CancellationToken cancellationToken) =>
        ExecuteAsync(new CreateRequest { Target = entity }, cancellationToken).ContinueWith(t => ((CreateResponse)t.Result).id, cancellationToken);

    public Task UpdateAsync(Entity entity, CancellationToken cancellationToken) =>
        ExecuteAsync(new UpdateRequest { Target = entity }, cancellationToken);

    public Task DeleteAsync(string table, Guid id, CancellationToken cancellationToken) =>
        ExecuteAsync(new DeleteRequest { Target = new EntityReference(table, id) }, cancellationToken);

    public Task<string> WebApiAsync(HttpMethod method, string path, string? body, IReadOnlyDictionary<string, string>? headers, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("The kernel never calls the Web API.");

    // ── Rows ─────────────────────────────────────────────────────────────────

    private Guid Create(Entity entity)
    {
        var row = new Entity(entity.LogicalName, entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id);
        foreach (var (key, value) in entity.KeyAttributes) row[key] = value;
        foreach (var (key, value) in entity.Attributes) row[key] = value;
        Add(row);
        return row.Id;
    }

    private void Update(Entity entity)
    {
        var row = Match(entity) ?? throw FakeAgentClient.Fault(unchecked((int)0x80040217), $"{entity.LogicalName} does not exist.");
        foreach (var (key, value) in entity.Attributes) row[key] = value;
    }

    private void Delete(string table, Guid id)
    {
        if (Table(table).RemoveAll(r => r.Id == id) == 0) throw FakeAgentClient.Fault(unchecked((int)0x80040217), $"{table} {id} does not exist.");
    }

    private Entity? Match(Entity target) => target.Id != Guid.Empty
        ? Table(target.LogicalName).FirstOrDefault(r => r.Id == target.Id)
        : target.KeyAttributes.Count == 0 ? null
        : Table(target.LogicalName).FirstOrDefault(r => target.KeyAttributes.All(k => Equals(r.GetAttributeValue<object>(k.Key), k.Value)));

    private Guid SolutionId(string name) => Table("solution").Single(s => s.GetAttributeValue<string>("uniquename") == name).Id;

    private EntityCollection Fetch(string xml)
    {
        var root = XDocument.Parse(xml).Root!;
        var entity = root.Element("entity")!;
        var rows = Table((string)entity.Attribute("name")!).Where(row => entity.Descendants("condition").All(c =>
            (string?)c.Attribute("operator") != "eq" || string.Equals(Text(row.GetAttributeValue<object>((string)c.Attribute("attribute")!)), (string?)c.Attribute("value"), StringComparison.OrdinalIgnoreCase)));
        if ((int?)root.Attribute("count") is { } count) rows = rows.Take(count);
        return new EntityCollection(rows.Select(Copy).ToList());
    }

    private static bool Matches(Entity row, FilterExpression filter)
    {
        var results = filter.Conditions.Select(c => Holds(row, c)).Concat(filter.Filters.Select(f => Matches(row, f)));
        return filter.FilterOperator == LogicalOperator.Or ? results.DefaultIfEmpty(true).Any(r => r) : results.All(r => r);
    }

    private static bool Holds(Entity row, ConditionExpression condition)
    {
        var value = row.GetAttributeValue<object>(condition.AttributeName);
        return condition.Operator switch
        {
            ConditionOperator.Equal => Same(value, condition.Values[0]),
            ConditionOperator.NotEqual => !Same(value, condition.Values[0]),
            ConditionOperator.Null => value is null,
            ConditionOperator.NotNull => value is not null,
            ConditionOperator.In => condition.Values.Any(v => Same(value, v)),
            ConditionOperator.Like => Text(value)?.Contains(((string)condition.Values[0]).Trim('%'), StringComparison.OrdinalIgnoreCase) == true,
            _ => true,
        };
    }

    private static bool Same(object? value, object? wanted) => (value, wanted) switch
    {
        (EntityReference reference, Guid id) => reference.Id == id,
        (OptionSetValue option, int number) => option.Value == number,
        (string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase),
        _ => Equals(value, wanted),
    };

    private static string? Text(object? value) => value switch
    {
        null => null,
        EntityReference reference => reference.Id.ToString("D"),
        OptionSetValue option => option.Value.ToString(),
        _ => value.ToString(),
    };

    private static Entity Copy(Entity row)
    {
        var copy = new Entity(row.LogicalName, row.Id);
        foreach (var (key, value) in row.Attributes) copy[key] = value;
        return copy;
    }
}
