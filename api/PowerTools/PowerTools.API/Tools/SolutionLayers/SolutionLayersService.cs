using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.SolutionLayers;

public sealed record SolutionLayersResult<T>(T? Value, SolutionLayersProblem? Problem)
{
    public static SolutionLayersResult<T> Ok(T value) => new(value, null);

    public static SolutionLayersResult<T> Fail(SolutionLayersProblem problem) => new(default, problem);
}

/// <summary>Reads the solution layers of one component and removes its Active layer.</summary>
public sealed class SolutionLayersService(
    ISolutionLayersClient client,
    ISolutionLayersCache cache,
    string connectionKey)
{
    public const string ActiveSolutionName = "Active";
    public const string RemoveActiveMessage = "RemoveActiveCustomizations";

    public async Task<SolutionLayersResult<ComponentTypesResponse>> GetComponentTypesAsync(
        CancellationToken cancellationToken)
    {
        var definitions = await DefinitionsAsync(cancellationToken);
        var types = ComponentLayerNames.Searchable(definitions)
            .Select(type => new ComponentTypeDto(type.ComponentType, type.Name, type.LayerName, type.Label, true))
            .ToList();
        return SolutionLayersResult<ComponentTypesResponse>.Ok(new ComponentTypesResponse(types));
    }

    public async Task<SolutionLayersResult<ComponentsResponse>> SearchComponentsAsync(
        int? componentType,
        string? search,
        string? entity,
        CancellationToken cancellationToken)
    {
        if (componentType is not int type)
            return Fail<ComponentsResponse>(SolutionLayersFaults.BadRequest("ComponentTypeRequired", "Choose a component type."));

        try
        {
            switch (type)
            {
                case ComponentLayerNames.Entity:
                    return Bounded(Filter(await EntitiesAsync(cancellationToken), search));
                case ComponentLayerNames.Attribute:
                    if (string.IsNullOrWhiteSpace(entity))
                        return Fail<ComponentsResponse>(SolutionLayersFaults.BadRequest("TableRequired", "Choose a table to search its columns."));
                    return Bounded(Filter(await ColumnsAsync(entity, cancellationToken), search));
                case ComponentLayerNames.OptionSet:
                    return Bounded(Filter(await OptionSetsAsync(cancellationToken), search));
                case ComponentLayerNames.EntityRelationship:
                    return Bounded(Filter(await RelationshipsAsync(cancellationToken), search));
            }

            var definitions = await DefinitionsAsync(cancellationToken);
            var table = SolutionLayersQueries.SearchTable(type, ComponentLayerNames.AppModuleType(definitions));
            if (table is null)
            {
                return Fail<ComponentsResponse>(SolutionLayersFaults.BadRequest(
                    "UnsupportedComponentType",
                    $"Component type {type} cannot be searched."));
            }

            var rows = await client.RetrieveMultipleAsync(
                SolutionLayersQueries.Search(type, table, search, entity),
                cancellationToken);
            var components = rows.Entities.Select(row => FromRow(type, table, row)).ToList();
            return Bounded(components);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<ComponentsResponse>(SolutionLayersFaults.From(ex));
        }
    }

    public async Task<SolutionLayersResult<LayersResponse>> GetLayersAsync(
        int? componentType,
        string? componentId,
        CancellationToken cancellationToken)
    {
        var target = await ResolveAsync(componentType, componentId, cancellationToken);
        if (target.Problem is not null)
            return Fail<LayersResponse>(target.Problem);

        try
        {
            var read = await ReadLayersAsync(target.Type, target.Id, target.LayerName, cancellationToken);
            return SolutionLayersResult<LayersResponse>.Ok(read.Response);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<LayersResponse>(SolutionLayersFaults.From(ex));
        }
    }

    public async Task<SolutionLayersResult<LayersResponse>> RemoveActiveAsync(
        RemoveActiveBody? body,
        CancellationToken cancellationToken)
    {
        var target = await ResolveAsync(body?.ComponentType, body?.ComponentId, cancellationToken);
        if (target.Problem is not null)
            return Fail<LayersResponse>(target.Problem);

        LayerRead before;
        try
        {
            before = await ReadLayersAsync(target.Type, target.Id, target.LayerName, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<LayersResponse>(SolutionLayersFaults.From(ex));
        }

        // The guard runs here as well as in the UI: removing the only layer of an unmanaged
        // component is not possible, and a component without an Active layer has nothing to remove.
        if (!before.Response.HasActiveLayer)
            return Fail<LayersResponse>(SolutionLayersFaults.NoActiveLayer());
        if (!before.Response.CanRemoveActive)
            return Fail<LayersResponse>(SolutionLayersFaults.OnlyActiveLayer());

        var request = new OrganizationRequest(RemoveActiveMessage)
        {
            ["SolutionComponentName"] = before.ActiveComponentName ?? target.LayerName,
            ["ComponentId"] = target.Id,
        };

        try
        {
            await client.ExecuteAsync(request, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException && SolutionLayersFaults.IsTimeout(ex))
        {
            // The removal may have finished on the server. Do not retry; read what is there now.
            try
            {
                var after = await ReadLayersAsync(target.Type, target.Id, target.LayerName, cancellationToken);
                return after.Response.HasActiveLayer
                    ? Fail<LayersResponse>(SolutionLayersFaults.TimedOut())
                    : SolutionLayersResult<LayersResponse>.Ok(after.Response);
            }
            catch (Exception readError) when (readError is not OperationCanceledException)
            {
                return Fail<LayersResponse>(SolutionLayersFaults.From(readError));
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<LayersResponse>(SolutionLayersFaults.From(ex));
        }

        try
        {
            var refreshed = await ReadLayersAsync(target.Type, target.Id, target.LayerName, cancellationToken);
            return SolutionLayersResult<LayersResponse>.Ok(refreshed.Response);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Fail<LayersResponse>(SolutionLayersFaults.From(ex));
        }
    }

    private sealed record Target(int Type, Guid Id, string LayerName, SolutionLayersProblem? Problem);

    private sealed record LayerRead(LayersResponse Response, string? ActiveComponentName);

    private async Task<Target> ResolveAsync(int? componentType, string? componentId, CancellationToken cancellationToken)
    {
        if (componentType is not int type)
            return new Target(0, Guid.Empty, "", SolutionLayersFaults.BadRequest("ComponentTypeRequired", "Choose a component type."));
        if (!Guid.TryParse(componentId, out var id) || id == Guid.Empty)
            return new Target(type, Guid.Empty, "", SolutionLayersFaults.BadRequest("InvalidComponentId", "The component id is not a valid GUID."));

        var definitions = ComponentLayerNames.ClassicLayerName(type) is null
            ? await DefinitionsAsync(cancellationToken)
            : null;
        var layerName = ComponentLayerNames.LayerName(type, definitions);
        return layerName is null
            ? new Target(type, id, "", SolutionLayersFaults.UnknownComponentType(type))
            : new Target(type, id, layerName, null);
    }

    private async Task<LayerRead> ReadLayersAsync(int type, Guid id, string layerName, CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveMultipleAsync(
            SolutionLayersQueries.ComponentLayers(layerName, id),
            cancellationToken);
        var expectedId = id.ToString("D");
        var matching = rows.Entities
            .Where(row =>
            {
                var rowId = Text(row, "msdyn_componentid");
                return rowId is null || string.Equals(rowId.Trim('{', '}'), expectedId, StringComparison.OrdinalIgnoreCase);
            })
            .ToList();

        var layers = matching
            .Select((row, index) => (Row: row, Layer: MapLayer(row, index)))
            .OrderByDescending(item => item.Layer.IsActive)
            .ThenByDescending(item => item.Layer.Order)
            .ToList();
        var hasActive = layers.Any(item => item.Layer.IsActive);
        var activeName = layers
            .Where(item => item.Layer.IsActive)
            .Select(item => Text(item.Row, "msdyn_solutioncomponentname"))
            .FirstOrDefault(name => !string.IsNullOrWhiteSpace(name));

        var response = new LayersResponse(
            expectedId,
            type,
            layerName,
            hasActive,
            hasActive && layers.Count > 1,
            layers.Select(item => item.Layer).ToList());
        return new LayerRead(response, activeName);
    }

    private static LayerDto MapLayer(Entity row, int index)
    {
        var solutionName = Text(row, "msdyn_solutionname") ?? "";
        var isActive = string.Equals(solutionName.Trim(), ActiveSolutionName, StringComparison.OrdinalIgnoreCase);
        var id = row.Id != Guid.Empty
            ? row.Id.ToString("D")
            : Text(row, "msdyn_componentlayerid") ?? $"layer-{index}";
        return new LayerDto(
            id,
            Integer(row, "msdyn_order"),
            solutionName,
            isActive ? null : Text(row, "msdyn_solutionversion"),
            Text(row, "msdyn_publishername") ?? "",
            Timestamp(row, "msdyn_overwritetime"),
            Text(row, "msdyn_name") ?? "",
            isActive,
            Text(row, "msdyn_changes"),
            Text(row, "msdyn_componentjson"),
            Text(row, "msdyn_children"));
    }

    private async Task<IReadOnlyList<ComponentDefinition>?> DefinitionsAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await cache.GetOrAddAsync<IReadOnlyList<ComponentDefinition>>(
                $"{connectionKey}|definitions",
                () => ReadDefinitionsAsync(cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // solutioncomponentdefinition is not a documented table. When it cannot be read,
            // the picker keeps the documented types only.
            return null;
        }
    }

    private async Task<IReadOnlyList<ComponentDefinition>> ReadDefinitionsAsync(CancellationToken cancellationToken)
    {
        var definitions = new List<ComponentDefinition>();
        var page = 1;
        string? cookie = null;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var rows = await client.RetrieveMultipleAsync(SolutionLayersQueries.Definitions(page, cookie), cancellationToken);
            foreach (var row in rows.Entities)
            {
                var number = Option(row, "solutioncomponenttype");
                var name = Text(row, "name");
                if (number is int value && !string.IsNullOrWhiteSpace(name))
                    definitions.Add(new ComponentDefinition(value, name, Text(row, "primaryentityname")));
            }

            if (!rows.MoreRecords)
                return definitions;
            page++;
            cookie = rows.PagingCookie;
        }
    }

    private Task<IReadOnlyList<ComponentDto>> EntitiesAsync(CancellationToken cancellationToken) =>
        cache.GetOrAddAsync<IReadOnlyList<ComponentDto>>($"{connectionKey}|entities", async () =>
        {
            var metadata = await MetadataAsync(SolutionLayersQueries.Entities(), cancellationToken);
            return metadata
                .Where(entity => entity.MetadataId is Guid)
                .Select(entity => new ComponentDto(
                    entity.MetadataId!.Value.ToString("D"),
                    ComponentLayerNames.Entity,
                    Label(entity.DisplayName) ?? entity.LogicalName ?? "",
                    entity.LogicalName ?? "",
                    null))
                .ToList();
        });

    private async Task<IReadOnlyList<ComponentDto>> ColumnsAsync(string entity, CancellationToken cancellationToken)
    {
        var metadata = await MetadataAsync(SolutionLayersQueries.Columns(entity), cancellationToken);
        var table = metadata.FirstOrDefault();
        if (table?.Attributes is null)
            return [];

        return table.Attributes
            .Where(attribute => attribute.MetadataId is Guid && string.IsNullOrEmpty(attribute.AttributeOf))
            .Select(attribute => new ComponentDto(
                attribute.MetadataId!.Value.ToString("D"),
                ComponentLayerNames.Attribute,
                Label(attribute.DisplayName) ?? attribute.LogicalName ?? "",
                attribute.LogicalName ?? "",
                table.LogicalName ?? entity.Trim()))
            .ToList();
    }

    private async Task<IReadOnlyList<ComponentDto>> OptionSetsAsync(CancellationToken cancellationToken)
    {
        var response = await client.ExecuteAsync(new RetrieveAllOptionSetsRequest(), cancellationToken);
        var optionSets = response.Results.Contains("OptionSetMetadata")
            ? response.Results["OptionSetMetadata"] as OptionSetMetadataBase[]
            : null;
        return (optionSets ?? [])
            .Where(optionSet => optionSet.MetadataId is Guid)
            .Select(optionSet => new ComponentDto(
                optionSet.MetadataId!.Value.ToString("D"),
                ComponentLayerNames.OptionSet,
                Label(optionSet.DisplayName) ?? optionSet.Name ?? "",
                optionSet.Name ?? "",
                null))
            .ToList();
    }

    private Task<IReadOnlyList<ComponentDto>> RelationshipsAsync(CancellationToken cancellationToken) =>
        cache.GetOrAddAsync<IReadOnlyList<ComponentDto>>($"{connectionKey}|relationships", async () =>
        {
            var metadata = await MetadataAsync(SolutionLayersQueries.Relationships(), cancellationToken);
            var seen = new HashSet<Guid>();
            var relationships = new List<ComponentDto>();
            foreach (var entity in metadata)
            {
                foreach (var relationship in entity.OneToManyRelationships ?? [])
                {
                    if (relationship.MetadataId is Guid id && seen.Add(id))
                        relationships.Add(Relationship(id, relationship.SchemaName, relationship.ReferencedEntity));
                }

                foreach (var relationship in entity.ManyToManyRelationships ?? [])
                {
                    if (relationship.MetadataId is Guid id && seen.Add(id))
                        relationships.Add(Relationship(id, relationship.SchemaName, relationship.Entity1LogicalName));
                }
            }

            return relationships;
        });

    private static ComponentDto Relationship(Guid id, string? schemaName, string? parent) =>
        new(id.ToString("D"), ComponentLayerNames.EntityRelationship, schemaName ?? "", schemaName ?? "", parent);

    private async Task<IReadOnlyList<EntityMetadata>> MetadataAsync(
        OrganizationRequest request,
        CancellationToken cancellationToken)
    {
        var response = await client.ExecuteAsync(request, cancellationToken);
        var metadata = response.Results.Contains("EntityMetadata")
            ? response.Results["EntityMetadata"] as IEnumerable<EntityMetadata>
            : null;
        return metadata?.ToList() ?? [];
    }

    private static ComponentDto FromRow(int type, ComponentSearchTable table, Entity row)
    {
        var display = Text(row, table.DisplayColumn);
        var logical = table.LogicalColumn is null ? null : Text(row, table.LogicalColumn);
        var parent = table.TableColumn is null ? null : Text(row, table.TableColumn);
        var id = row.Id != Guid.Empty
            ? row.Id
            : row.Contains(table.IdColumn) && row[table.IdColumn] is Guid value ? value : Guid.Empty;
        return new ComponentDto(
            id.ToString("D"),
            type,
            string.IsNullOrWhiteSpace(display) ? logical ?? "" : display,
            logical ?? "",
            string.IsNullOrWhiteSpace(parent) || parent == "none" ? null : parent);
    }

    private static IReadOnlyList<ComponentDto> Filter(IReadOnlyList<ComponentDto> components, string? search)
    {
        var text = search?.Trim();
        var matches = string.IsNullOrEmpty(text)
            ? components
            : components.Where(component =>
                component.Name.Contains(text, StringComparison.OrdinalIgnoreCase)
                || component.LogicalName.Contains(text, StringComparison.OrdinalIgnoreCase));
        return matches
            .OrderBy(component => component.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(component => component.LogicalName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static SolutionLayersResult<ComponentsResponse> Bounded(IReadOnlyList<ComponentDto> components) =>
        SolutionLayersResult<ComponentsResponse>.Ok(new ComponentsResponse(
            components.Take(SolutionLayersLimits.SearchLimit).ToList(),
            components.Count > SolutionLayersLimits.SearchLimit));

    private static SolutionLayersResult<T> Fail<T>(SolutionLayersProblem problem) =>
        SolutionLayersResult<T>.Fail(problem);

    private static string? Label(Label? label) =>
        label?.UserLocalizedLabel?.Label is { Length: > 0 } text
            ? text
            : label?.LocalizedLabels?.FirstOrDefault()?.Label is { Length: > 0 } fallback ? fallback : null;

    private static string? Text(Entity row, string column)
    {
        if (!row.Contains(column))
            return null;
        return row[column] switch
        {
            null => null,
            string text => text,
            EntityReference reference => reference.Name ?? reference.LogicalName,
            AliasedValue aliased => aliased.Value?.ToString(),
            var value => value.ToString(),
        };
    }

    private static int? Option(Entity row, string column) =>
        row.Contains(column)
            ? row[column] switch
            {
                OptionSetValue option => option.Value,
                int number => number,
                _ => null,
            }
            : null;

    private static int Integer(Entity row, string column)
    {
        if (!row.Contains(column))
            return 0;
        return row[column] switch
        {
            int number => number,
            long number => (int)number,
            decimal number => (int)number,
            string text when int.TryParse(text, out var parsed) => parsed,
            _ => 0,
        };
    }

    private static string? Timestamp(Entity row, string column)
    {
        if (!row.Contains(column) || row[column] is not DateTime value || value == DateTime.MinValue)
            return null;
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture);
    }
}
