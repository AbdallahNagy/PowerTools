using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.PolymorphicLookup;

namespace PowerTools.API.Tools.Agent;

/// <summary>
/// Creates and changes tables, columns, relationships and choices for the agent tools. Every create
/// resolves the publisher and checks schema names against its prefix before the first write.
/// </summary>
public sealed partial class AgentSchemaService(IAgentClient client)
{
    // The solution-aware component types AddSolutionComponent understands.
    internal const int EntityComponent = 1;
    internal const int AttributeComponent = 2;
    internal const int OptionSetComponent = 9;

    public static readonly string[] ColumnTypes =
        ["text", "memo", "integer", "decimal", "money", "boolean", "datetime", "dateonly", "choice", "multichoice", "file", "image"];

    // ── Tables ───────────────────────────────────────────────────────────────

    public Task<AgentResult<TableCreatedDto>> CreateTableAsync(CreateTableBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.SchemaName, "schemaName");
            Require(body.DisplayName, "displayName");
            Require(body.PluralName, "pluralName");
            var ownership = body.Ownership?.ToLowerInvariant() switch
            {
                "user" => OwnershipTypes.UserOwned,
                "organization" => OwnershipTypes.OrganizationOwned,
                _ => throw Invalid("ownership must be \"user\" or \"organization\"."),
            };

            var publisher = await RequirePublisherAsync(body.Solution, body.Publisher, ct);
            var primaryName = string.IsNullOrWhiteSpace(body.PrimaryNameSchemaName) ? $"{publisher.Prefix}_name" : body.PrimaryNameSchemaName!;
            CheckName(body.SchemaName!, publisher);
            CheckName(primaryName, publisher);
            var maxLength = body.PrimaryNameMaxLength ?? 100;
            if (maxLength is < 1 or > 4000) throw Invalid("primaryNameMaxLength must be from 1 to 4000.");

            var language = await RequireLanguageAsync(ct);
            var request = new CreateEntityRequest
            {
                Entity = new EntityMetadata
                {
                    SchemaName = body.SchemaName,
                    DisplayName = Text(body.DisplayName!, language),
                    DisplayCollectionName = Text(body.PluralName!, language),
                    Description = string.IsNullOrWhiteSpace(body.Description) ? null : Text(body.Description!, language),
                    OwnershipType = ownership,
                    IsActivity = false,
                },
                PrimaryAttribute = new StringAttributeMetadata
                {
                    SchemaName = primaryName,
                    RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.ApplicationRequired),
                    MaxLength = maxLength,
                    FormatName = StringFormatName.Text,
                    DisplayName = Text(string.IsNullOrWhiteSpace(body.PrimaryNameDisplayName) ? "Name" : body.PrimaryNameDisplayName!, language),
                },
                SolutionUniqueName = NullIfBlank(body.Solution),
            };

            var response = await client.ExecuteAsync(request, ct);
            return AgentResult<TableCreatedDto>.Ok(new TableCreatedDto(body.SchemaName!.ToLowerInvariant(), IdOf(response, "EntityId")));
        });

    // ── Columns ──────────────────────────────────────────────────────────────

    public Task<AgentResult<ColumnCreatedDto>> CreateColumnAsync(CreateColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.SchemaName, "schemaName");
            Require(body.DisplayName, "displayName");
            var type = body.Type?.ToLowerInvariant();
            if (type is null || !ColumnTypes.Contains(type))
                throw Invalid($"type must be one of: {string.Join(", ", ColumnTypes)}.");
            ValidateChoiceInputs(body, type);

            var publisher = await RequirePublisherAsync(body.Solution, body.Publisher, ct);
            CheckName(body.SchemaName!, publisher);

            var language = await RequireLanguageAsync(ct);
            var attribute = await BuildColumnAsync(body, type, publisher, language, ct);
            attribute.SchemaName = body.SchemaName;
            attribute.DisplayName = Text(body.DisplayName!, language);
            if (!string.IsNullOrWhiteSpace(body.Description)) attribute.Description = Text(body.Description!, language);
            attribute.RequiredLevel = new AttributeRequiredLevelManagedProperty(ParseRequiredLevel(body.RequiredLevel));

            var response = await client.ExecuteAsync(
                new CreateAttributeRequest
                {
                    EntityName = body.Table!.ToLowerInvariant(),
                    Attribute = attribute,
                    SolutionUniqueName = NullIfBlank(body.Solution),
                },
                ct);
            return AgentResult<ColumnCreatedDto>.Ok(new ColumnCreatedDto(body.SchemaName!.ToLowerInvariant(), IdOf(response, "AttributeId")));
        });

    private static void ValidateChoiceInputs(CreateColumnBody body, string type)
    {
        var isChoice = type is "choice" or "multichoice";
        var hasGlobal = !string.IsNullOrWhiteSpace(body.GlobalChoice);
        var hasOptions = body.Options is { Count: > 0 };
        if (isChoice && hasGlobal == hasOptions)
            throw Invalid("A choice column needs exactly one of globalChoice or options.");
        if (!isChoice && (hasGlobal || hasOptions))
            throw Invalid("globalChoice and options are only for choice and multichoice columns.");
        if (type != "boolean" && (body.TrueLabel is not null || body.FalseLabel is not null))
            throw Invalid("trueLabel and falseLabel are only for boolean columns.");
    }

    private async Task<AttributeMetadata> BuildColumnAsync(
        CreateColumnBody body, string type, PublisherInfo publisher, int language, CancellationToken ct)
    {
        switch (type)
        {
            case "text":
                return new StringAttributeMetadata
                {
                    MaxLength = Range(body.MaxLength ?? 100, 1, 4000, "maxLength"),
                    FormatName = ParseTextFormat(body.Format),
                };
            case "memo":
                return new MemoAttributeMetadata
                {
                    MaxLength = Range(body.MaxLength ?? 2000, 1, 1_048_576, "maxLength"),
                    Format = StringFormat.TextArea,
                };
            case "integer":
                return new IntegerAttributeMetadata
                {
                    Format = IntegerFormat.None,
                    MinValue = (int)(body.MinValue ?? int.MinValue),
                    MaxValue = (int)(body.MaxValue ?? int.MaxValue),
                };
            case "decimal":
                return new DecimalAttributeMetadata
                {
                    Precision = Range(body.Precision ?? 2, 0, 10, "precision"),
                    MinValue = (decimal)(body.MinValue ?? -100_000_000_000),
                    MaxValue = (decimal)(body.MaxValue ?? 100_000_000_000),
                };
            case "money":
                return new MoneyAttributeMetadata
                {
                    Precision = Range(body.Precision ?? 2, 0, 4, "precision"),
                    PrecisionSource = 2,
                    MinValue = body.MinValue ?? 0,
                    MaxValue = body.MaxValue ?? 1_000_000_000,
                };
            case "boolean":
                return new BooleanAttributeMetadata
                {
                    DefaultValue = false,
                    OptionSet = new BooleanOptionSetMetadata(
                        new OptionMetadata(Text(body.TrueLabel ?? "Yes", language), 1),
                        new OptionMetadata(Text(body.FalseLabel ?? "No", language), 0)),
                };
            case "datetime":
                return new DateTimeAttributeMetadata(DateTimeFormat.DateAndTime);
            case "dateonly":
                return new DateTimeAttributeMetadata(DateTimeFormat.DateOnly);
            case "file":
                return new FileAttributeMetadata { MaxSizeInKB = 32768 };
            case "image":
                return new ImageAttributeMetadata { CanStoreFullImage = false };
            default:
                var optionSet = await BuildChoiceSetAsync(body, publisher, language, ct);
                return type == "choice"
                    ? new PicklistAttributeMetadata { OptionSet = optionSet }
                    : new MultiSelectPicklistAttributeMetadata { OptionSet = optionSet };
        }
    }

    private async Task<OptionSetMetadata> BuildChoiceSetAsync(
        CreateColumnBody body, PublisherInfo publisher, int language, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(body.GlobalChoice))
        {
            var existing = await RetrieveChoiceAsync(body.GlobalChoice!, ct);
            return new OptionSetMetadata { Name = existing.Name, IsGlobal = true, MetadataId = existing.MetadataId };
        }

        // Dataverse refuses a local option set unless IsGlobal is stated as false.
        return new OptionSetMetadata(BuildOptions(body.Options!, publisher, language))
        {
            IsGlobal = false,
            OptionSetType = OptionSetType.Picklist,
        };
    }

    /// <summary>Values the caller left out count up from <c>OptionValuePrefix * 10000</c>, in the order given.</summary>
    internal static OptionMetadataCollection BuildOptions(IReadOnlyList<ChoiceOptionBody> options, PublisherInfo publisher, int language)
    {
        if (options.Count is < 1 or > 400) throw Invalid("A choice needs from 1 to 400 options.");
        var seen = new HashSet<int>();
        var collection = new OptionMetadataCollection();
        for (var index = 0; index < options.Count; index++)
        {
            var option = options[index];
            if (string.IsNullOrWhiteSpace(option.Label)) throw Invalid($"options[{index}].label is required.");
            var value = option.Value ?? checked(publisher.OptionValuePrefix * 10000 + index);
            if (!seen.Add(value)) throw Invalid($"Option value {value} is used twice.");
            collection.Add(new OptionMetadata(Text(option.Label!, language), value));
        }

        return collection;
    }

    // ── Lookups and relationships ────────────────────────────────────────────

    public Task<AgentResult<LookupCreatedDto>> CreateLookupAsync(CreateLookupBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.SchemaName, "schemaName");
            Require(body.DisplayName, "displayName");
            var targets = (body.Targets ?? []).Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().ToList();
            if (targets.Count is < 1 or > 10) throw Invalid("targets needs from 1 to 10 tables.");

            var publisher = await RequirePublisherAsync(body.Solution, body.Publisher, ct);
            CheckName(body.SchemaName!, publisher);
            var table = body.Table!.ToLowerInvariant();
            var lookupName = body.SchemaName![(publisher.Prefix.Length + 1)..].ToLowerInvariant();
            string RelationshipName(string target) =>
                PolymorphicLookupRules.TruncateRelationshipSchemaName($"{publisher.Prefix}_{target}_{table}_{lookupName}");

            if (targets.Count == 1)
            {
                var relationshipName = string.IsNullOrWhiteSpace(body.RelationshipSchemaName)
                    ? RelationshipName(targets[0])
                    : body.RelationshipSchemaName!;
                CheckName(relationshipName, publisher);

                var language = await RequireLanguageAsync(ct);
                var referenced = (RetrieveEntityResponse)await client.ExecuteAsync(
                    new RetrieveEntityRequest { LogicalName = targets[0], EntityFilters = EntityFilters.Entity }, ct);
                var request = new CreateOneToManyRequest
                {
                    Lookup = new LookupAttributeMetadata
                    {
                        SchemaName = body.SchemaName,
                        DisplayName = Text(body.DisplayName!, language),
                        RequiredLevel = new AttributeRequiredLevelManagedProperty(ParseRequiredLevel(body.RequiredLevel)),
                    },
                    OneToManyRelationship = new OneToManyRelationshipMetadata
                    {
                        SchemaName = relationshipName,
                        ReferencedEntity = targets[0],
                        ReferencedAttribute = referenced.EntityMetadata?.PrimaryIdAttribute ?? targets[0] + "id",
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
                        AssociatedMenuConfiguration = new AssociatedMenuConfiguration
                        {
                            Behavior = AssociatedMenuBehavior.UseCollectionName,
                            Group = AssociatedMenuGroup.Details,
                            Order = PolymorphicLookupRules.DefaultMenuOrder,
                        },
                    },
                    SolutionUniqueName = NullIfBlank(body.Solution),
                };
                var response = await client.ExecuteAsync(request, ct);
                return AgentResult<LookupCreatedDto>.Ok(new LookupCreatedDto(body.SchemaName!.ToLowerInvariant(), [relationshipName], IdOf(response, "AttributeId")));
            }

            // Several targets are one polymorphic lookup. That service works from a solution.
            if (string.IsNullOrWhiteSpace(body.Solution))
                throw Invalid("A lookup with several targets needs a solution.");
            var names = targets.Select(RelationshipName).ToList();
            var created = await new PolymorphicLookupService(client).CreateAsync(
                new CreatePolymorphicLookupBody
                {
                    SolutionUniqueName = body.Solution,
                    ReferencingEntityLogicalName = table,
                    DisplayName = body.DisplayName,
                    SchemaName = body.SchemaName,
                    Relationships = targets
                        .Select((target, index) => new RelationshipBody { ReferencedEntityLogicalName = target, SchemaName = names[index] })
                        .ToList(),
                },
                ct);
            if (created.Problem is not null) return AgentResult<LookupCreatedDto>.Fail(AgentFaults.FromLookup(created.Problem));
            return AgentResult<LookupCreatedDto>.Ok(new LookupCreatedDto(body.SchemaName!.ToLowerInvariant(), names, created.Value!.AttributeId));
        });

    public Task<AgentResult<RelationshipCreatedDto>> CreateManyToManyAsync(CreateManyToManyBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table1, "table1");
            Require(body.Table2, "table2");
            Require(body.SchemaName, "schemaName");
            var publisher = await RequirePublisherAsync(body.Solution, body.Publisher, ct);
            CheckName(body.SchemaName!, publisher);

            var menu = () => new AssociatedMenuConfiguration
            {
                Behavior = AssociatedMenuBehavior.UseCollectionName,
                Group = AssociatedMenuGroup.Details,
                Order = PolymorphicLookupRules.DefaultMenuOrder,
            };
            var response = await client.ExecuteAsync(
                new CreateManyToManyRequest
                {
                    IntersectEntitySchemaName = body.SchemaName,
                    ManyToManyRelationship = new ManyToManyRelationshipMetadata
                    {
                        SchemaName = body.SchemaName,
                        Entity1LogicalName = body.Table1!.ToLowerInvariant(),
                        Entity2LogicalName = body.Table2!.ToLowerInvariant(),
                        IntersectEntityName = body.SchemaName!.ToLowerInvariant(),
                        Entity1AssociatedMenuConfiguration = menu(),
                        Entity2AssociatedMenuConfiguration = menu(),
                    },
                    SolutionUniqueName = NullIfBlank(body.Solution),
                },
                ct);
            return AgentResult<RelationshipCreatedDto>.Ok(new RelationshipCreatedDto(body.SchemaName!, IdOf(response, "ManyToManyRelationshipId")));
        });

    // ── Choices ──────────────────────────────────────────────────────────────

    public Task<AgentResult<ChoiceCreatedDto>> CreateChoiceAsync(CreateChoiceBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.SchemaName, "schemaName");
            Require(body.DisplayName, "displayName");
            var publisher = await RequirePublisherAsync(body.Solution, body.Publisher, ct);
            CheckName(body.SchemaName!, publisher);
            var language = await RequireLanguageAsync(ct);

            var response = await client.ExecuteAsync(
                new CreateOptionSetRequest
                {
                    OptionSet = new OptionSetMetadata(BuildOptions(body.Options ?? [], publisher, language))
                    {
                        Name = body.SchemaName,
                        DisplayName = Text(body.DisplayName!, language),
                        IsGlobal = true,
                        OptionSetType = OptionSetType.Picklist,
                    },
                    SolutionUniqueName = NullIfBlank(body.Solution),
                },
                ct);
            return AgentResult<ChoiceCreatedDto>.Ok(new ChoiceCreatedDto(body.SchemaName!, IdOf(response, "OptionSetId")));
        });

    public Task<AgentResult<ChoiceOptionAddedDto>> AddChoiceOptionAsync(AddChoiceOptionBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Label, "label");
            var byName = !string.IsNullOrWhiteSpace(body.Choice);
            var byColumn = !string.IsNullOrWhiteSpace(body.Table) && !string.IsNullOrWhiteSpace(body.Column);
            if (byName == byColumn) throw Invalid("Give either choice, or table and column.");

            var language = await RequireLanguageAsync(ct);
            var request = new InsertOptionValueRequest
            {
                Label = Text(body.Label!, language),
                Value = body.Value,
                SolutionUniqueName = NullIfBlank(body.Solution),
            };
            OptionSetMetadata? existing = null;
            if (byName)
            {
                request.OptionSetName = body.Choice;
            }
            else
            {
                var attribute = await RetrieveColumnAsync(body.Table!, body.Column!, ct);
                existing = (attribute as EnumAttributeMetadata)?.OptionSet
                    ?? throw Invalid($"Column '{body.Column}' is not a choice column.");
                if (existing.IsGlobal == true && !string.IsNullOrWhiteSpace(existing.Name))
                {
                    // Dataverse refuses to reach a global choice through a column; add to the choice itself.
                    request.OptionSetName = existing.Name;
                }
                else
                {
                    request.EntityLogicalName = body.Table!.ToLowerInvariant();
                    request.AttributeLogicalName = body.Column!.ToLowerInvariant();
                }
            }

            if (request.Value is null && !string.IsNullOrWhiteSpace(body.Solution))
            {
                // Number the option from the solution publisher's prefix, as the maker portal does.
                var publisher = await RequirePublisherAsync(body.Solution, null, ct);
                existing ??= await RetrieveChoiceAsync(body.Choice!, ct);
                var used = existing.Options.Select(option => option.Value).OfType<int>().ToHashSet();
                var next = checked(publisher.OptionValuePrefix * 10000);
                while (used.Contains(next)) next++;
                request.Value = next;
            }

            var response = await client.ExecuteAsync(request, ct);
            var value = response.Results.TryGetValue("NewOptionValue", out var raw) && raw is int number ? number : body.Value ?? 0;
            return AgentResult<ChoiceOptionAddedDto>.Ok(new ChoiceOptionAddedDto(value));
        });

    public Task<AgentResult<IReadOnlyList<ChoiceValueDto>>> GetChoiceAsync(string name, CancellationToken ct) =>
        Guard<IReadOnlyList<ChoiceValueDto>>(async () =>
        {
            var set = await RetrieveChoiceAsync(name, ct);
            return AgentResult<IReadOnlyList<ChoiceValueDto>>.Ok(
                set.Options
                    .Where(option => option.Value is not null)
                    .Select(option => new ChoiceValueDto(option.Value!.Value, LabelText(option.Label)))
                    .ToList());
        });

    private async Task<OptionSetMetadata> RetrieveChoiceAsync(string name, CancellationToken ct)
    {
        try
        {
            var response = (RetrieveOptionSetResponse)await client.ExecuteAsync(new RetrieveOptionSetRequest { Name = name }, ct);
            return response.OptionSetMetadata as OptionSetMetadata
                ?? throw new AgentProblemException(AgentFaults.NotFound($"Choice '{name}' was not found."));
        }
        catch (System.ServiceModel.FaultException<OrganizationServiceFault> ex) when (ex.Detail.ErrorCode == unchecked((int)0x80040217))
        {
            throw new AgentProblemException(AgentFaults.NotFound($"Choice '{name}' was not found."));
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────────────

    private static async Task<AgentResult<T>> Guard<T>(Func<Task<AgentResult<T>>> work)
    {
        try
        {
            return await work();
        }
        catch (Exception ex)
        {
            return AgentResult<T>.Fail(AgentFaults.From(ex));
        }
    }

    private async Task<PublisherInfo> RequirePublisherAsync(string? solution, string? publisher, CancellationToken ct)
    {
        var resolved = await AgentPublishers.ResolveAsync(client, solution, publisher, ct);
        return resolved.Problem is null ? resolved.Value! : throw new AgentProblemException(resolved.Problem);
    }

    private async Task<int> RequireLanguageAsync(CancellationToken ct)
    {
        var rows = await client.RetrieveMultipleAsync(PolymorphicLookupRequests.CreateOrganizationLanguageQuery(), ct);
        var code = rows.Entities.FirstOrDefault()?.GetAttributeValue<int?>("languagecode");
        return code is null or 0
            ? throw Invalid("The organization base language could not be read.")
            : code.Value;
    }

    /// <summary>For messages that do not take SolutionUniqueName: add the component to the solution right after.</summary>
    private async Task AddToSolutionAsync(string? solution, Guid componentId, int componentType, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(solution)) return;
        await client.ExecuteAsync(
            new AddSolutionComponentRequest
            {
                ComponentId = componentId,
                ComponentType = componentType,
                SolutionUniqueName = solution,
                AddRequiredComponents = false,
            },
            ct);
    }

    private static void CheckName(string schemaName, PublisherInfo publisher)
    {
        var problem = AgentPublishers.CheckSchemaName(schemaName, publisher);
        if (problem is not null) throw new AgentProblemException(problem);
    }

    private static void Require(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) throw Invalid($"{field} is required.");
    }

    private static int Range(int value, int min, int max, string field) =>
        value < min || value > max ? throw Invalid($"{field} must be from {min} to {max}.") : value;

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Label Text(string text, int language) => new(text, language);

    private static string LabelText(Label? label) =>
        label?.UserLocalizedLabel?.Label ?? label?.LocalizedLabels.FirstOrDefault()?.Label ?? "";

    private static Guid IdOf(OrganizationResponse response, string key) =>
        response.Results.TryGetValue(key, out var raw) && raw is Guid id ? id : Guid.Empty;

    private static AttributeRequiredLevel ParseRequiredLevel(string? value) =>
        value?.ToLowerInvariant() switch
        {
            null or "" or "none" => AttributeRequiredLevel.None,
            "recommended" => AttributeRequiredLevel.Recommended,
            "required" => AttributeRequiredLevel.ApplicationRequired,
            _ => throw Invalid("requiredLevel must be none, recommended or required."),
        };

    private static StringFormatName ParseTextFormat(string? value) =>
        value?.ToLowerInvariant() switch
        {
            null or "" or "text" => StringFormatName.Text,
            "email" => StringFormatName.Email,
            "url" => StringFormatName.Url,
            "phone" => StringFormatName.Phone,
            _ => throw Invalid("format must be text, email, url or phone."),
        };
}
