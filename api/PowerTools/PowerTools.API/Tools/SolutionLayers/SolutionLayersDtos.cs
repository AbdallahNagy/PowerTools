namespace PowerTools.API.Tools.SolutionLayers;

public sealed record ComponentTypeDto(
    int ComponentType,
    string Name,
    string LayerName,
    string Label,
    bool Supported);

public sealed record ComponentTypesResponse(IReadOnlyList<ComponentTypeDto> ComponentTypes);

public sealed record ComponentDto(
    string ComponentId,
    int ComponentType,
    string Name,
    string LogicalName,
    string? ParentEntity);

public sealed record ComponentsResponse(IReadOnlyList<ComponentDto> Components, bool Truncated);

public sealed record LayerDto(
    string Id,
    int Order,
    string SolutionName,
    string? SolutionVersion,
    string PublisherName,
    string? OverwriteTime,
    string Name,
    bool IsActive,
    string? Changes,
    string? ComponentJson,
    string? Children);

public sealed record LayersResponse(
    string ComponentId,
    int ComponentType,
    string LayerName,
    bool HasActiveLayer,
    bool CanRemoveActive,
    IReadOnlyList<LayerDto> Layers);

public sealed record RemoveActiveBody(int ComponentType, string? ComponentId);
