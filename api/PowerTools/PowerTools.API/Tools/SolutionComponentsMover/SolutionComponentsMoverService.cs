using System.Globalization;
using Microsoft.Crm.Sdk.Messages;
using PowerTools.API.Services;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public sealed class SolutionComponentsMoverService(
    ISolutionComponentsMoverClient client,
    ISolutionCopyDelay? delay = null)
{
    // Microsoft.Crm.Sdk.Proxy 9.0, shipped with the referenced Dataverse client, does not include
    // RetrieveOptionSetRequest or RetrieveMetadataChangesRequest. Those messages are sent by name
    // with the same parameters.
    private const string RetrieveOptionSet = "RetrieveOptionSet";
    private const string RetrieveMetadataChanges = "RetrieveMetadataChanges";

    private readonly ISolutionCopyDelay _delay = delay ?? new SolutionCopyDelay();

    public async Task<SolutionComponentsResult<SolutionsResponse>> GetSolutionsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var rows = await RetrievePagesAsync(SolutionComponentsMoverQueries.Solutions(), cancellationToken);
            return SolutionComponentsResult<SolutionsResponse>.Ok(new SolutionsResponse
            {
                Solutions = rows.Select(MapSolution).ToList(),
            });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return SolutionComponentsResult<SolutionsResponse>.Fail(SolutionComponentsMoverFaults.From(ex));
        }
    }

    public async Task<SolutionComponentsResult<ComponentTypesResponse>> GetComponentTypesAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            var version = await LoadVersionAsync(cancellationToken);
            var types = await LoadComponentTypesAsync(version, cancellationToken);
            return SolutionComponentsResult<ComponentTypesResponse>.Ok(new ComponentTypesResponse
            {
                ComponentTypes = types,
            });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return SolutionComponentsResult<ComponentTypesResponse>.Fail(SolutionComponentsMoverFaults.From(ex));
        }
    }

    public async Task<SolutionComponentsResult<PreparedCopy>> PrepareAsync(
        StartCopyBody body,
        CancellationToken cancellationToken)
    {
        var validation = Validate(body);
        if (validation is not null)
            return SolutionComponentsResult<PreparedCopy>.Fail(validation);

        try
        {
            var checkBestPractice = body.CheckBestPractice ?? true;
            var solutions = (await RetrievePagesAsync(SolutionComponentsMoverQueries.Solutions(), cancellationToken))
                .Select(MapSolution)
                .ToDictionary(row => Guid.Parse(row.Id));
            var sources = ParseIds(body.SourceSolutionIds!);
            var targets = ParseIds(body.TargetSolutionIds!);
            if (sources is null || targets is null)
            {
                return SolutionComponentsResult<PreparedCopy>.Fail(SolutionComponentsMoverFaults.Local(
                    "UnknownSolution",
                    "A selected solution was not found in this environment."));
            }

            foreach (var id in sources.Concat(targets))
            {
                if (!solutions.ContainsKey(id))
                {
                    return SolutionComponentsResult<PreparedCopy>.Fail(SolutionComponentsMoverFaults.Local(
                        "UnknownSolution",
                        "A selected solution was not found in this environment."));
                }
            }

            foreach (var id in targets)
            {
                var target = solutions[id];
                if (target.IsManaged)
                {
                    return SolutionComponentsResult<PreparedCopy>.Fail(SolutionComponentsMoverFaults.Local(
                        "ManagedTarget",
                        $"Managed solution {target.UniqueName} cannot be a target."));
                }
            }

            var version = await LoadVersionAsync(cancellationToken);
            var componentTypes = await LoadComponentTypesAsync(version, cancellationToken);
            var labels = componentTypes.ToDictionary(type => type.ComponentType, type => type.Label);
            var selectedTypes = body.ComponentTypes ?? [];
            var rows = await RetrievePagesAsync(
                SolutionComponentsMoverQueries.Components(sources, body.AllComponents, selectedTypes),
                cancellationToken);
            var components = DistinctComponents(rows, labels);

            if (checkBestPractice)
            {
                var refusal = await RefuseManagedTablesAsync(components, cancellationToken);
                if (refusal is not null)
                {
                    return SolutionComponentsResult<PreparedCopy>.Ok(new PreparedCopy
                    {
                        RefusalMessage = refusal.Value.Message,
                        RefusalLabel = refusal.Value.Label,
                        OrganizationMajor = version.Major,
                    });
                }
            }

            return SolutionComponentsResult<PreparedCopy>.Ok(new PreparedCopy
            {
                OrganizationMajor = version.Major,
                Components = components,
                TargetUniqueNames = targets.Select(id => solutions[id].UniqueName).ToList(),
            });
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return SolutionComponentsResult<PreparedCopy>.Fail(SolutionComponentsMoverFaults.From(ex));
        }
    }

    public async Task<SolutionComponentsResult<CopyJobDto>> ExecuteAsync(
        StartCopyBody body,
        CancellationToken cancellationToken)
    {
        var prepared = await PrepareAsync(body, cancellationToken);
        if (prepared.Problem is not null)
            return SolutionComponentsResult<CopyJobDto>.Fail(prepared.Problem);

        var job = SolutionCopyJob.Create(prepared.Value!, new OnlineConnectionContext("https://example.test", "token"));
        if (job.Status == "queued")
            await AddAsync(job, cancellationToken);
        return SolutionComponentsResult<CopyJobDto>.Ok(job.ToDto());
    }

    public async Task AddAsync(SolutionCopyJob job, CancellationToken cancellationToken)
    {
        job.MarkRunning();
        var stop = false;
        foreach (var target in job.Targets)
        {
            foreach (var component in job.Components)
            {
                stop = await AddOneAsync(job, target, component, cancellationToken);
                if (stop) break;
            }

            if (stop) break;
        }

        if (stop) job.MarkStopped();
        else job.MarkCompleted();
    }

    private async Task<bool> AddOneAsync(
        SolutionCopyJob job,
        string targetUniqueName,
        CopyComponent component,
        CancellationToken cancellationToken)
    {
        var request = BuildAdd(job, targetUniqueName, component);
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await client.ExecuteAsync(request, cancellationToken);
                job.RecordSuccess(Entry(component, targetUniqueName, true, ""));
                return false;
            }
            catch (Exception ex) when (
                IsServiceProtection(ex) &&
                attempt < SolutionComponentsMoverLimits.MaxServiceProtectionRetries &&
                ReadRetryAfter(ex) is { } retryAfter)
            {
                var wait = retryAfter < TimeSpan.Zero ? TimeSpan.Zero : retryAfter;
                await _delay.WaitAsync(wait, cancellationToken);
            }
            catch (Exception ex) when (IsBlockUnmanaged(ex))
            {
                job.RecordFailure(Entry(component, targetUniqueName, false, SolutionComponentsMoverFaults.From(ex).Message));
                return true;
            }
            catch (Exception ex)
            {
                job.RecordFailure(Entry(component, targetUniqueName, false, SolutionComponentsMoverFaults.From(ex).Message));
                return false;
            }
        }
    }

    private static AddSolutionComponentRequest BuildAdd(
        SolutionCopyJob job,
        string targetUniqueName,
        CopyComponent component)
    {
        var request = new AddSolutionComponentRequest
        {
            AddRequiredComponents = false,
            ComponentId = component.ObjectId,
            ComponentType = component.ComponentType,
            SolutionUniqueName = targetUniqueName,
        };

        if (job.OrganizationMajor >= 8)
        {
            if (component.RootBehavior == 1)
                request.DoNotIncludeSubcomponents = true;
            else if (component.RootBehavior == 2)
            {
                request.DoNotIncludeSubcomponents = true;
                request.IncludedComponentSettingsValues = [];
            }
        }

        if (component.ComponentType == SolutionComponentsMoverLimits.EnvironmentVariableDefinition)
        {
            request.DoNotIncludeSubcomponents = true;
            request.IncludedComponentSettingsValues = [];
        }

        return request;
    }

    private static SolutionComponentsProblem? Validate(StartCopyBody body)
    {
        if (body.SourceSolutionIds is null || body.SourceSolutionIds.Count == 0)
        {
            return SolutionComponentsMoverFaults.Local(
                "EmptySource",
                "Select at least one source solution.");
        }

        if (body.TargetSolutionIds is null || body.TargetSolutionIds.Count == 0)
        {
            return SolutionComponentsMoverFaults.Local(
                "EmptyTarget",
                "Select at least one target solution.");
        }

        if (!body.AllComponents && (body.ComponentTypes is null || body.ComponentTypes.Count == 0))
        {
            return SolutionComponentsMoverFaults.Local(
                "EmptyComponentTypes",
                "Select at least one component type.");
        }

        return null;
    }

    private static List<Guid>? ParseIds(IReadOnlyList<string> ids)
    {
        var parsed = new List<Guid>(ids.Count);
        var seen = new HashSet<Guid>();
        foreach (var id in ids)
        {
            if (!Guid.TryParse(id, out var guid) || !seen.Add(guid))
            {
                if (!Guid.TryParse(id, out _)) return null;
                continue;
            }

            parsed.Add(guid);
        }

        return parsed;
    }

    private async Task<(string Label, string Message)?> RefuseManagedTablesAsync(
        IReadOnlyList<CopyComponent> components,
        CancellationToken cancellationToken)
    {
        var ids = components
            .Where(component =>
                component.ComponentType == SolutionComponentsMoverLimits.EntityComponentType &&
                component.RootBehavior == 0 &&
                component.UnmanagedSource)
            .Select(component => component.ObjectId)
            .Distinct()
            .ToList();
        if (ids.Count == 0) return null;

        var tables = await QueryMetadataInAsync(
            "MetadataId",
            ids,
            static () => new MetadataConditionExpression("IsManaged", MetadataConditionOperator.Equals, true),
            ["MetadataId", "DisplayName", "LogicalName", "SchemaName", "IsManaged"],
            cancellationToken);
        var names = tables
            .Where(table => table.IsManaged != false)
            .Select(TableName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (names.Count == 0) return null;

        var label = string.Join(", ", names);
        return (
            label,
            $"The copy was refused because an unmanaged source includes all assets of a managed table: {label}.");
    }

    private async Task<Version> LoadVersionAsync(CancellationToken cancellationToken)
    {
        var response = await client.ExecuteAsync(new RetrieveVersionRequest(), cancellationToken);
        if (response is not RetrieveVersionResponse versionResponse ||
            string.IsNullOrWhiteSpace(versionResponse.Version) ||
            !Version.TryParse(versionResponse.Version, out var version))
        {
            throw new InvalidOperationException("The organization version could not be read.");
        }

        return version;
    }

    private async Task<List<ComponentTypeDto>> LoadComponentTypesAsync(Version version, CancellationToken cancellationToken)
    {
        var options = await LoadOptionSetAsync(cancellationToken);
        if (!UsesDefinitions(version))
            return Sort(FromOptions(options));

        var definitions = await RetrievePagesAsync(SolutionComponentsMoverQueries.Definitions(), cancellationToken);
        var tables = await LoadTablesAsync(definitions, cancellationToken);
        return Sort(Merge(definitions, tables, options));
    }

    private async Task<IReadOnlyList<OptionMetadata>> LoadOptionSetAsync(CancellationToken cancellationToken)
    {
        var response = await client.ExecuteAsync(
            new OrganizationRequest(RetrieveOptionSet) { ["Name"] = "componenttype" },
            cancellationToken);
        if (!response.Results.Contains("OptionSetMetadata") ||
            response.Results["OptionSetMetadata"] is not OptionSetMetadata metadata)
        {
            throw new InvalidOperationException("The componenttype option set could not be read.");
        }

        return metadata.Options?.ToList() ?? [];
    }

    private async Task<Dictionary<string, EntityMetadata>> LoadTablesAsync(
        IReadOnlyList<Entity> definitions,
        CancellationToken cancellationToken)
    {
        var names = definitions
            .Select(row => row.GetAttributeValue<string>("primaryentityname"))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var tables = new Dictionary<string, EntityMetadata>(StringComparer.OrdinalIgnoreCase);
        if (names.Count == 0) return tables;

        var metadata = await QueryMetadataInAsync(
            "LogicalName",
            names,
            null,
            ["DisplayName", "LogicalName", "SchemaName"],
            cancellationToken);
        foreach (var table in metadata)
        {
            if (string.IsNullOrWhiteSpace(table.LogicalName)) continue;
            tables.TryAdd(table.LogicalName, table);
        }

        return tables;
    }

    private async Task<List<EntityMetadata>> QueryMetadataInAsync<T>(
        string propertyName,
        IReadOnlyList<T> values,
        Func<MetadataConditionExpression>? additional,
        string[] properties,
        CancellationToken cancellationToken)
    {
        if (values.Count == 0) return [];

        try
        {
            return await QueryMetadataOnceAsync(propertyName, values.ToArray(), additional?.Invoke(), properties, cancellationToken);
        }
        catch (Exception ex) when (IsQuerySizeFault(ex) && values.Count > 1)
        {
            var midpoint = values.Count / 2;
            var left = await QueryMetadataInAsync(
                propertyName,
                values.Take(midpoint).ToList(),
                additional,
                properties,
                cancellationToken);
            var right = await QueryMetadataInAsync(
                propertyName,
                values.Skip(midpoint).ToList(),
                additional,
                properties,
                cancellationToken);
            return left.Concat(right).ToList();
        }
    }

    private async Task<List<EntityMetadata>> QueryMetadataOnceAsync<T>(
        string propertyName,
        T[] values,
        MetadataConditionExpression? additional,
        string[] properties,
        CancellationToken cancellationToken)
    {
        var criteria = new MetadataFilterExpression();
        criteria.Conditions.Add(new MetadataConditionExpression(propertyName, MetadataConditionOperator.In, values));
        if (additional is not null)
            criteria.Conditions.Add(additional);

        var request = new OrganizationRequest(RetrieveMetadataChanges)
        {
            ["Query"] = new EntityQueryExpression
            {
                Criteria = criteria,
                Properties = new MetadataPropertiesExpression(properties),
            },
            ["ClientVersionStamp"] = null,
        };
        var response = await client.ExecuteAsync(request, cancellationToken);
        return ReadMetadata(response);
    }

    private async Task<List<Entity>> RetrievePagesAsync(QueryExpression query, CancellationToken cancellationToken)
    {
        var rows = new List<Entity>();
        string? cookie = null;
        var pageNumber = 1;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            query.PageInfo = new PagingInfo
            {
                Count = SolutionComponentsMoverLimits.PageSize,
                PageNumber = pageNumber,
                PagingCookie = cookie,
            };
            var page = await client.RetrieveMultipleAsync(query, cancellationToken);
            if (page.Entities is { Count: > 0 })
                rows.AddRange(page.Entities);
            if (!page.MoreRecords) return rows;
            cookie = page.PagingCookie;
            pageNumber++;
        }
    }

    private static bool UsesDefinitions(Version version) =>
        version.Major > 9 || (version.Major == 9 && version.Minor >= 1);

    private static List<ComponentTypeDto> Merge(
        IReadOnlyList<Entity> definitions,
        IReadOnlyDictionary<string, EntityMetadata> tables,
        IReadOnlyList<OptionMetadata> options)
    {
        var optionText = options
            .Where(option => option.Value is not null)
            .GroupBy(option => option.Value!.Value)
            .ToDictionary(group => group.Key, group => OptionText(group.First()));
        var result = new List<ComponentTypeDto>();
        var seen = new HashSet<int>();
        foreach (var definition in definitions)
        {
            var type = ReadInt(definition, "solutioncomponenttype");
            if (type is null || !seen.Add(type.Value)) continue;
            var primary = definition.GetAttributeValue<string>("primaryentityname");
            EntityMetadata? table = null;
            if (!string.IsNullOrWhiteSpace(primary))
                tables.TryGetValue(primary, out table);
            optionText.TryGetValue(type.Value, out var optionLabel);
            result.Add(new ComponentTypeDto
            {
                ComponentType = type.Value,
                Label = DefinitionLabel(
                    table,
                    optionLabel,
                    definition.GetAttributeValue<string>("name"),
                    type.Value),
            });
        }

        foreach (var option in options)
        {
            if (option.Value is null || !seen.Add(option.Value.Value)) continue;
            result.Add(new ComponentTypeDto
            {
                ComponentType = option.Value.Value,
                Label = LabelOrCode(OptionText(option), option.Value.Value),
            });
        }

        return result;
    }

    private static List<ComponentTypeDto> FromOptions(IReadOnlyList<OptionMetadata> options)
    {
        var result = new List<ComponentTypeDto>();
        var seen = new HashSet<int>();
        foreach (var option in options)
        {
            if (option.Value is null || !seen.Add(option.Value.Value)) continue;
            result.Add(new ComponentTypeDto
            {
                ComponentType = option.Value.Value,
                Label = LabelOrCode(OptionText(option), option.Value.Value),
            });
        }

        return result;
    }

    private static string DefinitionLabel(EntityMetadata? table, string? optionLabel, string? definitionName, int typeCode)
    {
        var display = table?.DisplayName?.UserLocalizedLabel?.Label;
        if (!string.IsNullOrWhiteSpace(display)) return display;
        if (!string.IsNullOrWhiteSpace(table?.SchemaName)) return table.SchemaName;
        if (!string.IsNullOrWhiteSpace(optionLabel)) return optionLabel;
        if (!string.IsNullOrWhiteSpace(definitionName)) return definitionName;
        return typeCode.ToString(CultureInfo.InvariantCulture);
    }

    private static string? OptionText(OptionMetadata option)
    {
        var user = option.Label?.UserLocalizedLabel?.Label;
        if (!string.IsNullOrWhiteSpace(user)) return user;
        if (option.Label?.LocalizedLabels is null) return null;
        foreach (var label in option.Label.LocalizedLabels)
        {
            if (!string.IsNullOrWhiteSpace(label?.Label)) return label.Label;
        }

        return null;
    }

    private static string LabelOrCode(string? label, int typeCode) =>
        string.IsNullOrWhiteSpace(label) ? typeCode.ToString(CultureInfo.InvariantCulture) : label;

    private static List<ComponentTypeDto> Sort(List<ComponentTypeDto> types)
    {
        types.Sort((left, right) =>
        {
            var label = string.Compare(left.Label, right.Label, StringComparison.OrdinalIgnoreCase);
            return label != 0 ? label : left.ComponentType.CompareTo(right.ComponentType);
        });
        return types;
    }

    private static List<CopyComponent> DistinctComponents(
        IEnumerable<Entity> rows,
        IReadOnlyDictionary<int, string> labels)
    {
        var seen = new HashSet<(Guid ObjectId, int ComponentType)>();
        var components = new List<CopyComponent>();
        foreach (var row in rows)
        {
            var objectId = ReadGuid(row, "objectid");
            var componentType = ReadInt(row, "componenttype");
            if (objectId is null || objectId == Guid.Empty || componentType is null) continue;
            if (!seen.Add((objectId.Value, componentType.Value))) continue;
            labels.TryGetValue(componentType.Value, out var label);
            components.Add(new CopyComponent
            {
                ObjectId = objectId.Value,
                ComponentType = componentType.Value,
                RootBehavior = ReadInt(row, "rootcomponentbehavior"),
                UnmanagedSource = IsUnmanagedSource(row),
                Label = string.IsNullOrWhiteSpace(label)
                    ? componentType.Value.ToString(CultureInfo.InvariantCulture)
                    : label,
            });
        }

        return components;
    }

    private static SolutionRowDto MapSolution(Entity entity)
    {
        var publisher = entity.GetAttributeValue<EntityReference>("publisherid");
        return new SolutionRowDto
        {
            Id = entity.Id.ToString("D"),
            FriendlyName = entity.GetAttributeValue<string>("friendlyname") ?? "",
            UniqueName = entity.GetAttributeValue<string>("uniquename") ?? "",
            PublisherName = publisher?.Name,
            InstalledOn = FormatInstalledOn(entity),
            Version = entity.GetAttributeValue<string>("version") ?? "",
            IsManaged = entity.GetAttributeValue<bool?>("ismanaged") ?? false,
        };
    }

    private static string? FormatInstalledOn(Entity entity)
    {
        if (!entity.Contains("installedon")) return null;
        switch (entity["installedon"])
        {
            case null:
                return null;
            case DateOnly date:
                return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            case DateTime dateTime:
                return dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            case string text when DateOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed):
                return parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            default:
                return null;
        }
    }

    private static List<EntityMetadata> ReadMetadata(OrganizationResponse response)
    {
        if (!response.Results.Contains("EntityMetadata") || response.Results["EntityMetadata"] is not { } value)
            return [];
        if (value is EntityMetadataCollection collection)
            return collection.ToList();
        if (value is IEnumerable<EntityMetadata> entities)
            return entities.ToList();
        return [];
    }

    private static string TableName(EntityMetadata table)
    {
        var display = table.DisplayName?.UserLocalizedLabel?.Label;
        if (!string.IsNullOrWhiteSpace(display)) return display.Trim();
        if (!string.IsNullOrWhiteSpace(table.SchemaName)) return table.SchemaName;
        if (!string.IsNullOrWhiteSpace(table.LogicalName)) return table.LogicalName;
        return table.MetadataId?.ToString("D") ?? "managed table";
    }

    private static bool IsUnmanagedSource(Entity entity)
    {
        if (!entity.Contains("solution.ismanaged")) return false;
        var value = entity["solution.ismanaged"];
        if (value is AliasedValue aliased) value = aliased.Value;
        return value is false;
    }

    private static int? ReadInt(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute)) return null;
        var value = entity[attribute];
        if (value is AliasedValue aliased) value = aliased.Value;
        return value switch
        {
            null => null,
            OptionSetValue option => option.Value,
            int number => number,
            long number => checked((int)number),
            _ => null,
        };
    }

    private static Guid? ReadGuid(Entity entity, string attribute)
    {
        if (!entity.Contains(attribute)) return null;
        var value = entity[attribute];
        if (value is AliasedValue aliased) value = aliased.Value;
        return value as Guid?;
    }

    private static bool IsServiceProtection(Exception exception)
    {
        var fault = SolutionComponentsMoverFaults.Unwrap(exception);
        return fault is not null && fault.Detail.ErrorCode == SolutionComponentsMoverFaults.ServiceProtection;
    }

    private static bool IsBlockUnmanaged(Exception exception)
    {
        var fault = SolutionComponentsMoverFaults.Unwrap(exception);
        var message = fault?.Detail.Message ?? exception.Message;
        return message.Contains(SolutionComponentsMoverFaults.BlockUnmanagedText, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsQuerySizeFault(Exception exception)
    {
        if (exception is OperationCanceledException || IsServiceProtection(exception)) return false;
        var fault = SolutionComponentsMoverFaults.Unwrap(exception);
        var message = string.IsNullOrWhiteSpace(fault?.Detail.Message) ? exception.Message : fault.Detail.Message;
        return message.Contains("too large", StringComparison.OrdinalIgnoreCase)
            || message.Contains("too many", StringComparison.OrdinalIgnoreCase)
            || message.Contains("query length", StringComparison.OrdinalIgnoreCase)
            || message.Contains("maximum number", StringComparison.OrdinalIgnoreCase);
    }

    private static TimeSpan? ReadRetryAfter(Exception exception)
    {
        var fault = SolutionComponentsMoverFaults.Unwrap(exception);
        if (fault?.Detail.ErrorDetails is not { } details || !details.Contains("Retry-After"))
            return null;
        return details["Retry-After"] switch
        {
            TimeSpan span => span,
            int seconds => TimeSpan.FromSeconds(seconds),
            long seconds => TimeSpan.FromSeconds(seconds),
            string text when double.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) =>
                TimeSpan.FromSeconds(number),
            string text when TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var span) => span,
            _ => null,
        };
    }

    private static CopyEntryDto Entry(CopyComponent component, string targetUniqueName, bool succeeded, string message) =>
        new()
        {
            ComponentId = component.ObjectId.ToString("D"),
            ComponentType = component.ComponentType,
            Label = component.Label,
            SolutionUniqueName = targetUniqueName,
            Succeeded = succeeded,
            Message = message,
        };
}
