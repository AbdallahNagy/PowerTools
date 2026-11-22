using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent.Kernel;
using Dyno.Api.Tools.PolymorphicLookup;
using static Dyno.Api.Tools.Agent.Components.Tables.TableColumns;

namespace Dyno.Api.Tools.Agent.Components.Tables;

/// <summary>
/// Plans table_apply: compares a table spec with the environment and lists the steps that make them match, in the
/// order they must run: the table, then each column in spec order (its options right after it), then many-to-many
/// relationships, then keys. It only reads. Nothing the spec leaves out is removed, labels are compared in the base
/// language only, and a change Dataverse does not allow becomes a blocked step with the reason.
/// </summary>
public sealed class TablePlanner(Func<TimeSpan, CancellationToken, Task>? delay = null, TimeSpan? keyWait = null)
    : IComponentPlanner<TableApplySpec>
{
    public const string Family = "table";

    /// <summary>File storage, which file and image columns need. Online has it; older on-premises versions do not.</summary>
    public const string FileStorageTable = "fileattachment";

    private static readonly TimeSpan KeyPollInterval = TimeSpan.FromSeconds(5);
    private readonly Func<TimeSpan, CancellationToken, Task> delay = delay ?? Task.Delay;
    private readonly TimeSpan keyWait = keyWait ?? TimeSpan.FromMinutes(5);

    public static string LockKey(string logicalName) => $"entity:{logicalName}";

    public async Task<Plan> PlanAsync(TableApplySpec spec, PlanContext context, CancellationToken ct)
    {
        TableSpecRules.Validate(spec);
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var language = await context.BaseLanguageAsync(ct);
        var table = spec.Table.SchemaName.ToLowerInvariant();
        var current = await context.Metadata.TableAsync(table, ct);
        var run = new Run(spec, context, solution, language, table, current);

        if (current is null) run.NewTable();
        else run.UpdateTable();

        foreach (var (column, index) in (spec.Columns ?? []).Select((c, i) => (c, i)))
            await run.ColumnAsync(column, index, ct);
        foreach (var relationship in spec.ManyToMany ?? [])
            await run.ManyToManyAsync(relationship, ct);
        foreach (var key in spec.Keys ?? [])
            run.Key(key, this);

        if (current?.IsCustomizable is { Value: false }) run.BlockAll($"Table {table} is managed and not customizable.");
        return new Plan(run.Steps, run.Warnings, [LockKey(table)]);
    }

    /// <summary>Waits until a key's index is active. A failed index fails the step; a slow one is left to finish.</summary>
    internal async Task WaitForKeyAsync(IAgentClient client, string table, string key, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow + keyWait;
        while (true)
        {
            EntityKeyIndexStatus? status = null;
            try
            {
                var response = (RetrieveEntityKeyResponse)await client.ExecuteAsync(
                    new RetrieveEntityKeyRequest { EntityLogicalName = table, LogicalName = key }, ct);
                status = response.EntityKeyMetadata?.EntityKeyIndexStatus;
            }
            catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
            {
                // Throttled while polling: the key is already created, so keep waiting instead of failing the step.
            }

            if (status == EntityKeyIndexStatus.Active) return;
            if (status == EntityKeyIndexStatus.Failed)
            {
                throw new AgentProblemException(new AgentProblem(StatusCodes.Status502BadGateway, "DataverseFault",
                    $"The index of key {key} failed, usually because rows have the same values in its columns. Fix the rows and apply again; the key is then reactivated."));
            }

            if (DateTime.UtcNow >= deadline) return;
            await delay(KeyPollInterval, ct);
        }
    }

    /// <summary>The state of one plan as it is built.</summary>
    private sealed class Run(
        TableApplySpec spec, PlanContext context, SolutionContext solution, int language, string table, EntityMetadata? current)
    {
        public List<PlanStep> Steps { get; } = [];

        public List<string> Warnings { get; } = [];

        private readonly HashSet<string> newColumns = new(StringComparer.OrdinalIgnoreCase);

        private IReadOnlyList<PublishTarget> Publish => [new PublishTarget(PublishKind.Entity, table)];

        private void CheckPrefix(string schemaName)
        {
            if (solution.CheckSchemaName(schemaName) is { } problem) throw new AgentProblemException(problem);
        }

        // ── Table ────────────────────────────────────────────────────────────

        public void NewTable()
        {
            var definition = spec.Table;
            CheckPrefix(definition.SchemaName);
            if (string.IsNullOrWhiteSpace(definition.DisplayName) || string.IsNullOrWhiteSpace(definition.PluralName))
                throw TableSpecRules.Invalid($"Table {table} does not exist yet; a new table needs table.displayName and table.pluralName.");

            var primarySchema = definition.PrimaryName?.SchemaName ?? $"{solution.Prefix}_Name";
            CheckPrefix(primarySchema);
            var primaryDisplay = definition.PrimaryName?.DisplayName ?? "Name";
            var primaryLength = definition.PrimaryName?.MaxLength ?? 100;
            var ownership = definition.Ownership ?? TableOwnership.User;
            newColumns.Add(primarySchema);

            var entity = new EntityMetadata
            {
                SchemaName = definition.SchemaName,
                DisplayName = Labels.Make(definition.DisplayName!, language),
                DisplayCollectionName = Labels.Make(definition.PluralName!, language),
                OwnershipType = ownership == TableOwnership.User ? OwnershipTypes.UserOwned : OwnershipTypes.OrganizationOwned,
                IsActivity = false,
            };
            if (definition.Description is { } description) entity.Description = Labels.Make(description, language);
            if (definition.AuditEnabled is { } audit) entity.IsAuditEnabled = new BooleanManagedProperty(audit);
            if (definition.ChangeTracking is { } tracking) entity.ChangeTrackingEnabled = tracking;

            var request = new CreateEntityRequest
            {
                Entity = entity,
                PrimaryAttribute = new StringAttributeMetadata
                {
                    SchemaName = primarySchema,
                    RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.ApplicationRequired),
                    MaxLength = primaryLength,
                    FormatName = StringFormatName.Text,
                    DisplayName = Labels.Make(primaryDisplay, language),
                },
                HasNotes = definition.Notes ?? false,
                HasActivities = definition.Activities ?? false,
            };

            var detail = new List<string>
            {
                $"{Quote(definition.DisplayName)} / {Quote(definition.PluralName)}",
                $"ownership {ownership.ToString().ToLowerInvariant()}",
                $"primary name {primarySchema.ToLowerInvariant()} {Quote(primaryDisplay)} max length {primaryLength}",
            };
            if (definition.Description is { } text) detail.Add($"description {Quote(text)}");
            if (definition.AuditEnabled is { } auditOn) detail.Add($"audit {OnOff(auditOn)}");
            if (definition.ChangeTracking is { } trackingOn) detail.Add($"change tracking {OnOff(trackingOn)}");
            detail.Add($"notes {OnOff(definition.Notes ?? false)}");
            detail.Add($"activities {OnOff(definition.Activities ?? false)}");

            Steps.Add(new PlanStep { Op = "createTable", Target = table, Detail = string.Join(", ", detail), Request = request, Publishes = Publish });
        }

        public void UpdateTable()
        {
            var definition = spec.Table;
            var existing = current!;
            var changes = new List<string>();
            var blocked = new List<string>();
            var update = new EntityMetadata { LogicalName = table, MetadataId = existing.MetadataId };
            var request = new UpdateEntityRequest { Entity = update, MergeLabels = true };

            if (definition.Ownership is { } ownership)
            {
                var wanted = ownership == TableOwnership.User ? OwnershipTypes.UserOwned : OwnershipTypes.OrganizationOwned;
                if (existing.OwnershipType is { } owned && owned != wanted)
                    blocked.Add($"The ownership of {table} is {(owned == OwnershipTypes.UserOwned ? "user" : "organization")} and is fixed once created.");
            }

            var renameBlocked = existing.IsRenameable is { Value: false };
            if (definition.DisplayName is { } display && !Labels.Matches(existing.DisplayName, display, language))
            {
                if (renameBlocked) blocked.Add($"Table {table} cannot be renamed (managed property).");
                changes.Add($"display name {Quote(Labels.Text(existing.DisplayName, language))} → {Quote(display)}");
                update.DisplayName = Labels.Make(display, language);
            }

            if (definition.PluralName is { } plural && !Labels.Matches(existing.DisplayCollectionName, plural, language))
            {
                if (renameBlocked) blocked.Add($"Table {table} cannot be renamed (managed property).");
                changes.Add($"plural name {Quote(Labels.Text(existing.DisplayCollectionName, language))} → {Quote(plural)}");
                update.DisplayCollectionName = Labels.Make(plural, language);
            }

            if (definition.Description is { } description && !Labels.Matches(existing.Description, description, language))
            {
                changes.Add($"description {Quote(Labels.Text(existing.Description, language))} → {Quote(description)}");
                update.Description = Labels.Make(description, language);
            }

            if (definition.AuditEnabled is { } audit && (existing.IsAuditEnabled?.Value ?? false) != audit)
            {
                if (existing.IsAuditEnabled is { CanBeChanged: false }) blocked.Add($"Auditing of {table} cannot be changed (managed property).");
                changes.Add($"audit {OnOff(!audit)} → {OnOff(audit)}");
                update.IsAuditEnabled = new BooleanManagedProperty(audit);
            }

            if (definition.ChangeTracking is { } tracking && (existing.ChangeTrackingEnabled ?? false) != tracking)
            {
                if (existing.CanChangeTrackingBeEnabled is { Value: false }) blocked.Add($"Change tracking of {table} cannot be changed (managed property).");
                changes.Add($"change tracking {OnOff(!tracking)} → {OnOff(tracking)}");
                update.ChangeTrackingEnabled = tracking;
            }

            if (definition.Notes is { } notes && (existing.HasNotes ?? false) != notes)
            {
                if (!notes) blocked.Add($"Notes on {table} cannot be turned off once on.");
                changes.Add("notes off → on");
                request.HasNotes = true;
            }

            if (definition.Activities is { } activities && (existing.HasActivities ?? false) != activities)
            {
                if (!activities) blocked.Add($"Activities on {table} cannot be turned off once on.");
                changes.Add("activities off → on");
                request.HasActivities = true;
            }

            if (blocked.Count > 0)
            {
                foreach (var reason in blocked.Distinct()) Steps.Add(PlanStep.Blocked("updateTable", table, reason));
            }
            else if (changes.Count > 0)
            {
                Steps.Add(new PlanStep { Op = "updateTable", Target = table, Detail = string.Join("; ", changes), Request = request, Publishes = Publish });
            }

            if (definition.PrimaryName is { } primary) PrimaryName(primary, existing);
        }

        private void PrimaryName(PrimaryNameDefinition primary, EntityMetadata existing)
        {
            var name = existing.PrimaryNameAttribute;
            if (primary.SchemaName is { } schemaName && !string.Equals(schemaName, name, StringComparison.OrdinalIgnoreCase))
            {
                Steps.Add(PlanStep.Blocked("updateColumn", schemaName.ToLowerInvariant(),
                    $"The primary name column of {table} is {name} and is fixed once the table is created."));
                return;
            }

            var attribute = existing.Attributes?.FirstOrDefault(a => string.Equals(a.LogicalName, name, StringComparison.OrdinalIgnoreCase));
            if (attribute is null) return;
            var column = new ColumnDefinition
            {
                SchemaName = attribute.SchemaName ?? attribute.LogicalName,
                Type = ColumnType.Text,
                DisplayName = primary.DisplayName,
                MaxLength = primary.MaxLength,
            };
            UpdateColumn(column, attribute);
        }

        // ── Columns ──────────────────────────────────────────────────────────

        public async Task ColumnAsync(ColumnDefinition column, int index, CancellationToken ct)
        {
            var logical = column.SchemaName.ToLowerInvariant();
            var existing = current?.Attributes?.FirstOrDefault(a => string.Equals(a.LogicalName, logical, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
            {
                await NewColumnAsync(column, index, ct);
                return;
            }

            var type = TypeOf(existing);
            if (type is null)
            {
                Steps.Add(PlanStep.Blocked("updateColumn", logical,
                    $"{logical} is a {existing.AttributeTypeName?.Value ?? existing.AttributeType?.ToString()} column, which table_apply does not change."));
                return;
            }

            var dates = new[] { ColumnType.DateTime, ColumnType.DateOnly };
            if (type != column.Type && !(dates.Contains(type.Value) && dates.Contains(column.Type)))
            {
                Steps.Add(PlanStep.Blocked("updateColumn", logical,
                    $"{logical} is a {TypeName(type.Value)} column; a column's type cannot change. To change it, remove the column (its data is lost) and apply again."));
                return;
            }

            UpdateColumn(column, existing);
        }

        private void UpdateColumn(ColumnDefinition column, AttributeMetadata existing)
        {
            var logical = existing.LogicalName;
            var stepsBefore = Steps.Count;
            var changes = Changes(column, existing, language).ToList();
            var blocked = changes.Where(c => c.BlockedReason is not null).ToList();
            var runnable = changes.Where(c => c.BlockedReason is null).ToList();

            if (runnable.Count > 0)
            {
                var detail = string.Join("; ", runnable.Select(c => $"{c.Field} {c.From} → {c.To}"));
                var entity = table;
                Steps.Add(new PlanStep
                {
                    Op = "updateColumn",
                    Target = logical,
                    Detail = detail,
                    Publishes = Publish,
                    // Read the column again just before the write and change only what the plan names.
                    Action = async (step, token) =>
                    {
                        var read = (RetrieveAttributeResponse)await step.Client.ExecuteAsync(
                            new RetrieveAttributeRequest { EntityLogicalName = entity, LogicalName = logical, RetrieveAsIfPublished = true }, token);
                        var attribute = read.AttributeMetadata;
                        foreach (var change in runnable) change.Apply(attribute);
                        var update = new UpdateAttributeRequest { EntityName = entity, Attribute = attribute, MergeLabels = true };
                        if (step.SolutionUniqueName is { } name) update.SolutionUniqueName = name;
                        await step.Client.ExecuteAsync(update, token);
                    },
                });
            }

            foreach (var change in blocked) Steps.Add(PlanStep.Blocked("updateColumn", logical, change.BlockedReason!));

            switch (existing)
            {
                case LookupAttributeMetadata lookup when column.Target is { } target:
                    if (!(lookup.Targets ?? []).Contains(target, StringComparer.OrdinalIgnoreCase))
                    {
                        Steps.Add(PlanStep.Blocked("updateColumn", logical,
                            $"{logical} points to {string.Join(", ", lookup.Targets ?? [])}; a lookup's target is fixed once created. Use a new lookup column."));
                    }

                    break;
                case BooleanAttributeMetadata boolean:
                    BooleanLabel(logical, boolean.OptionSet?.TrueOption, 1, column.TrueLabel);
                    BooleanLabel(logical, boolean.OptionSet?.FalseOption, 0, column.FalseLabel);
                    break;
                case EnumAttributeMetadata choice when column.Type is ColumnType.Choice or ColumnType.MultiChoice:
                    ExistingOptions(column, logical, choice.OptionSet);
                    break;
            }

            if (existing.IsCustomizable is { Value: false } && Steps.Count > stepsBefore)
                BlockFrom(stepsBefore, $"Column {logical} is managed and not customizable.");
        }

        private void BooleanLabel(string logical, OptionMetadata? option, int value, string? wanted)
        {
            if (wanted is null || Labels.Matches(option?.Label, wanted, language)) return;
            Steps.Add(new PlanStep
            {
                Op = "updateOption",
                Target = $"{logical}={value}",
                Detail = $"label {Quote(Labels.Text(option?.Label, language))} → {Quote(wanted)}",
                Request = new UpdateOptionValueRequest
                {
                    EntityLogicalName = table,
                    AttributeLogicalName = logical,
                    Value = value,
                    Label = Labels.Make(wanted, language),
                    MergeLabels = true,
                },
                Publishes = Publish,
            });
        }

        private void ExistingOptions(ColumnDefinition column, string logical, OptionSetMetadata? set)
        {
            var global = set?.IsGlobal == true;
            if (column.GlobalChoice is { } wantedGlobal)
            {
                if (!global || !string.Equals(set?.Name, wantedGlobal, StringComparison.OrdinalIgnoreCase))
                {
                    var now = global ? $"uses global choice {set?.Name}" : "has its own options";
                    Steps.Add(PlanStep.Blocked("updateColumn", logical,
                        $"{logical} {now}; which choice a column uses is fixed once created. Use a new column."));
                }

                return;
            }

            if (column.Options is null) return;
            if (global)
            {
                Steps.Add(PlanStep.Blocked("updateColumn", logical,
                    $"{logical} uses global choice {set?.Name}; change its options on the global choice, not through the column."));
                return;
            }

            var existing = (set?.Options ?? [])
                .Where(o => o.Value is not null)
                .ToDictionary(o => o.Value!.Value, o => o);
            var used = new HashSet<int>(existing.Keys);
            foreach (var value in column.Options.Select(o => o.Value).OfType<int>()) used.Add(value);

            foreach (var option in column.Options)
            {
                if (option.Value is { } value)
                {
                    if (existing.TryGetValue(value, out var found))
                    {
                        if (!Labels.Matches(found.Label, option.Label, language))
                            Steps.Add(UpdateOption(logical, value, Labels.Text(found.Label, language), option.Label));
                    }
                    else
                    {
                        Steps.Add(InsertOption(logical, value, option.Label));
                    }

                    continue;
                }

                if (existing.Values.Any(o => Labels.Matches(o.Label, option.Label, language))) continue;
                var next = NextValue(used);
                Steps.Add(InsertOption(logical, next, option.Label));
            }
        }

        private int NextValue(HashSet<int> used)
        {
            var next = checked(solution.OptionValuePrefix * 10000);
            while (used.Contains(next)) next++;
            used.Add(next);
            return next;
        }

        private PlanStep InsertOption(string logical, int value, string label) => new()
        {
            Op = "addOption",
            Target = $"{logical}={value}",
            Detail = Quote(label),
            Request = new InsertOptionValueRequest
            {
                EntityLogicalName = table,
                AttributeLogicalName = logical,
                Value = value,
                Label = Labels.Make(label, language),
            },
            Publishes = Publish,
        };

        private PlanStep UpdateOption(string logical, int value, string? from, string to) => new()
        {
            Op = "updateOption",
            Target = $"{logical}={value}",
            Detail = $"label {Quote(from)} → {Quote(to)}",
            Request = new UpdateOptionValueRequest
            {
                EntityLogicalName = table,
                AttributeLogicalName = logical,
                Value = value,
                Label = Labels.Make(to, language),
                MergeLabels = true,
            },
            Publishes = Publish,
        };

        private async Task NewColumnAsync(ColumnDefinition column, int index, CancellationToken ct)
        {
            var logical = column.SchemaName.ToLowerInvariant();
            CheckPrefix(column.SchemaName);
            if (string.IsNullOrWhiteSpace(column.DisplayName))
                throw TableSpecRules.Invalid($"columns[{index}]: {logical} does not exist yet; a new column needs displayName.");
            newColumns.Add(logical);

            if (column.Type is ColumnType.File or ColumnType.Image && !context.Capabilities.HasTable(FileStorageTable))
            {
                Steps.Add(PlanStep.Unsupported("createColumn", logical,
                    $"{TypeName(column.Type)} columns need file storage, which this environment does not have.",
                    "Store files as note attachments, or keep a link in a text column."));
                return;
            }

            if (column.Type == ColumnType.Lookup)
            {
                await NewLookupAsync(column, logical, ct);
                return;
            }

            var attribute = New(column);
            attribute.DisplayName = Labels.Make(column.DisplayName!, language);
            if (column.Description is { } description) attribute.Description = Labels.Make(description, language);
            var detail = NewDetail(column);

            if (attribute is BooleanAttributeMetadata boolean)
            {
                boolean.OptionSet = new BooleanOptionSetMetadata(
                    new OptionMetadata(Labels.Make(column.TrueLabel ?? "Yes", language), 1),
                    new OptionMetadata(Labels.Make(column.FalseLabel ?? "No", language), 0));
            }

            if (attribute is EnumAttributeMetadata choice)
            {
                if (column.GlobalChoice is { } globalName)
                {
                    var found = await GlobalChoiceAsync(globalName, ct);
                    if (found is null)
                    {
                        Steps.Add(PlanStep.Blocked("createColumn", logical, $"Global choice {globalName} does not exist. Create it first."));
                        return;
                    }

                    choice.OptionSet = new OptionSetMetadata { IsGlobal = true, Name = found.Name, MetadataId = found.MetadataId };
                    detail += $", global choice {found.Name}";
                }
                else
                {
                    var options = column.Options ?? throw TableSpecRules.Invalid(
                        $"columns[{index}]: the new {TypeName(column.Type)} column {logical} needs options or globalChoice.");
                    var used = new HashSet<int>(options.Select(o => o.Value).OfType<int>());
                    var set = new OptionSetMetadata { IsGlobal = false, OptionSetType = OptionSetType.Picklist };
                    var named = new List<string>();
                    foreach (var option in options)
                    {
                        var value = option.Value ?? NextValue(used);
                        set.Options.Add(new OptionMetadata(Labels.Make(option.Label, language), value));
                        named.Add($"{value} {Quote(option.Label)}");
                    }

                    choice.OptionSet = set;
                    detail += $", options {string.Join(", ", named)}";
                }
            }

            Steps.Add(new PlanStep
            {
                Op = "createColumn",
                Target = logical,
                Detail = detail,
                Request = new CreateAttributeRequest { EntityName = table, Attribute = attribute },
                Publishes = Publish,
            });
        }

        private async Task NewLookupAsync(ColumnDefinition column, string logical, CancellationToken ct)
        {
            var target = column.Target!;
            var self = string.Equals(target, table, StringComparison.OrdinalIgnoreCase);
            var referenced = self ? current : await context.Metadata.TableAsync(target, ct);
            if (referenced is null && !self)
            {
                Steps.Add(PlanStep.Blocked("createColumn", logical, $"Table {target} does not exist. Create it first, then apply this spec again."));
                return;
            }

            var relationship = column.RelationshipName
                ?? PolymorphicLookupRules.TruncateRelationshipSchemaName(
                    $"{solution.Prefix}_{target}_{table}_{logical[(solution.Prefix.Length + 1)..]}");
            CheckPrefix(relationship);
            var lookup = new LookupAttributeMetadata
            {
                SchemaName = column.SchemaName,
                DisplayName = Labels.Make(column.DisplayName!, language),
                RequiredLevel = new AttributeRequiredLevelManagedProperty(Level(column.RequiredLevel ?? RequiredLevel.None)),
            };
            if (column.Description is { } description) lookup.Description = Labels.Make(description, language);
            if (column.AuditEnabled is { } audit) lookup.IsAuditEnabled = new BooleanManagedProperty(audit);

            var detail = $"lookup to {target}, {Quote(column.DisplayName)}, relationship {relationship}, required {(column.RequiredLevel ?? RequiredLevel.None).ToString().ToLowerInvariant()}";
            if (column.Description is { } text) detail += $", description {Quote(text)}";
            if (column.AuditEnabled is { } auditOn) detail += $", audit {OnOff(auditOn)}";

            Steps.Add(new PlanStep
            {
                Op = "createLookup",
                Target = logical,
                Detail = detail,
                Request = new CreateOneToManyRequest
                {
                    Lookup = lookup,
                    OneToManyRelationship = new OneToManyRelationshipMetadata
                    {
                        SchemaName = relationship,
                        ReferencedEntity = target,
                        ReferencedAttribute = referenced?.PrimaryIdAttribute ?? $"{target}id",
                        ReferencingEntity = table,
                        IsValidForAdvancedFind = true,
                        CascadeConfiguration = new CascadeConfiguration
                        {
                            Assign = CascadeType.NoCascade,
                            Delete = CascadeType.RemoveLink,
                            Merge = CascadeType.NoCascade,
                            Reparent = CascadeType.NoCascade,
                            Share = CascadeType.NoCascade,
                            Unshare = CascadeType.NoCascade,
                            RollupView = CascadeType.NoCascade,
                        },
                        AssociatedMenuConfiguration = Menu(),
                    },
                },
                Publishes = self ? Publish : [.. Publish, new PublishTarget(PublishKind.Entity, target)],
            });
        }

        private async Task<OptionSetMetadata?> GlobalChoiceAsync(string name, CancellationToken ct)
        {
            try
            {
                var response = (RetrieveOptionSetResponse)await context.Client.ExecuteAsync(
                    new RetrieveOptionSetRequest { Name = name, RetrieveAsIfPublished = true }, ct);
                return response.OptionSetMetadata as OptionSetMetadata;
            }
            catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
            {
                return null;
            }
        }

        // ── Many-to-many relationships ───────────────────────────────────────

        public async Task ManyToManyAsync(ManyToManyDefinition relationship, CancellationToken ct)
        {
            var name = relationship.SchemaName;
            var other = relationship.Table;
            var existing = current?.ManyToManyRelationships?.FirstOrDefault(r => string.Equals(r.SchemaName, name, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                var pair = new[] { existing.Entity1LogicalName, existing.Entity2LogicalName };
                if (!pair.Contains(table, StringComparer.OrdinalIgnoreCase) || !pair.Contains(other, StringComparer.OrdinalIgnoreCase))
                {
                    Steps.Add(PlanStep.Blocked("createManyToMany", name,
                        $"{name} already links {existing.Entity1LogicalName} and {existing.Entity2LogicalName}; the tables of a relationship are fixed once created."));
                }

                return;
            }

            CheckPrefix(name);
            var self = string.Equals(other, table, StringComparison.OrdinalIgnoreCase);
            if (!self && await context.Metadata.TableAsync(other, ct) is null)
            {
                Steps.Add(PlanStep.Blocked("createManyToMany", name, $"Table {other} does not exist. Create it first, then apply this spec again."));
                return;
            }

            Steps.Add(new PlanStep
            {
                Op = "createManyToMany",
                Target = name,
                Detail = $"{table} ↔ {other}, intersect table {name.ToLowerInvariant()}",
                Request = new CreateManyToManyRequest
                {
                    IntersectEntitySchemaName = name,
                    ManyToManyRelationship = new ManyToManyRelationshipMetadata
                    {
                        SchemaName = name,
                        Entity1LogicalName = table,
                        Entity2LogicalName = other,
                        IntersectEntityName = name.ToLowerInvariant(),
                        Entity1AssociatedMenuConfiguration = Menu(),
                        Entity2AssociatedMenuConfiguration = Menu(),
                    },
                },
                Publishes = self ? Publish : [.. Publish, new PublishTarget(PublishKind.Entity, other)],
            });
        }

        private static AssociatedMenuConfiguration Menu() => new()
        {
            Behavior = AssociatedMenuBehavior.UseCollectionName,
            Group = AssociatedMenuGroup.Details,
            Order = PolymorphicLookupRules.DefaultMenuOrder,
        };

        // ── Keys ─────────────────────────────────────────────────────────────

        public void Key(KeyDefinition key, TablePlanner planner)
        {
            var logical = key.SchemaName.ToLowerInvariant();
            var columns = key.Columns.Select(c => c.ToLowerInvariant()).ToList();
            var existing = current?.Keys?.FirstOrDefault(k => string.Equals(k.LogicalName ?? k.SchemaName, logical, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                var now = (existing.KeyAttributes ?? []).Select(c => c.ToLowerInvariant()).Order().ToList();
                if (!now.SequenceEqual(columns.Order()))
                {
                    Steps.Add(PlanStep.Blocked("createKey", logical,
                        $"Key {logical} is on {string.Join(", ", now)}; a key's columns are fixed once created. Remove the key and apply again."));
                    return;
                }

                switch (existing.EntityKeyIndexStatus)
                {
                    case EntityKeyIndexStatus.Failed:
                        Steps.Add(new PlanStep
                        {
                            Op = "reactivateKey",
                            Target = logical,
                            Detail = $"the index on {string.Join(", ", columns)} failed; build it again",
                            Action = async (step, token) =>
                            {
                                await step.Client.ExecuteAsync(
                                    new ReactivateEntityKeyRequest { EntityLogicalName = table, EntityKeyLogicalName = logical }, token);
                                await planner.WaitForKeyAsync(step.Client, table, logical, token);
                            },
                        });
                        break;
                    case EntityKeyIndexStatus.Pending or EntityKeyIndexStatus.InProgress:
                        Warnings.Add($"The index of key {logical} is still being built; the key works once it is active.");
                        break;
                }

                return;
            }

            CheckPrefix(key.SchemaName);
            var known = new HashSet<string>(newColumns, StringComparer.OrdinalIgnoreCase);
            foreach (var attribute in current?.Attributes ?? []) known.Add(attribute.LogicalName);
            var missing = columns.Where(c => !known.Contains(c)).ToList();
            if (missing.Count > 0)
                throw TableSpecRules.Invalid($"Key {logical} uses {string.Join(", ", missing)}, which {table} does not have and the spec does not create.");

            var display = key.DisplayName ?? key.SchemaName;
            Steps.Add(new PlanStep
            {
                Op = "createKey",
                Target = logical,
                Detail = $"{Quote(display)} on {string.Join(", ", columns)}; waits for the index",
                Action = async (step, token) =>
                {
                    var create = new CreateEntityKeyRequest
                    {
                        EntityName = table,
                        EntityKey = new EntityKeyMetadata
                        {
                            SchemaName = key.SchemaName,
                            DisplayName = Labels.Make(display, language),
                            KeyAttributes = [.. columns],
                        },
                    };
                    if (step.SolutionUniqueName is { } name) create.SolutionUniqueName = name;
                    await step.Client.ExecuteAsync(create, token);
                    await planner.WaitForKeyAsync(step.Client, table, logical, token);
                },
            });
        }

        // ── Managed components ───────────────────────────────────────────────

        /// <summary>Turns every step from <paramref name="start"/> on into a blocked step with <paramref name="reason"/>.</summary>
        private void BlockFrom(int start, string reason)
        {
            for (var i = start; i < Steps.Count; i++)
            {
                if (Steps[i].Kind == PlanStepKind.Run) Steps[i] = PlanStep.Blocked(Steps[i].Op, Steps[i].Target, reason);
            }
        }

        public void BlockAll(string reason) => BlockFrom(0, reason);
    }
}
