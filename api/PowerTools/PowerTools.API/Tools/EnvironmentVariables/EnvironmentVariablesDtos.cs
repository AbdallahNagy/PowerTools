namespace PowerTools.API.Tools.EnvironmentVariables;

/// <summary>Environment variable type codes, matched by integer and never by label.</summary>
public enum EnvironmentVariableType
{
    String = 100000000,
    Number = 100000001,
    Boolean = 100000002,
    Json = 100000003,
    DataSource = 100000004,
    Secret = 100000005,
}

/// <summary>Values of <c>environmentvariabledefinition.secretstore</c>.</summary>
public static class SecretStore
{
    public const int AzureKeyVault = 0;
    public const int Dataverse = 1;
}

public sealed record ValueRowDto(string ValueId, string? Value, bool IsManaged);

public sealed record EnvironmentVariableDto(
    string DefinitionId,
    string SchemaName,
    string? DisplayName,
    string? Description,
    int Type,
    string TypeLabel,
    string? DefaultValue,
    string? ValueId,
    string? CurrentValue,
    int? SecretStore,
    bool IsManaged,
    bool IsCustomizable,
    bool IsActive,
    bool ValueIsManaged,
    IReadOnlyList<string> ManagedValueSolutions,
    IReadOnlyList<ValueRowDto> ConflictingValues);

public sealed record SolutionDto(string UniqueName, string FriendlyName, string Prefix);

public sealed record CreateDefinitionBody(
    string? SchemaName,
    string? DisplayName,
    string? Description,
    int? Type,
    string? DefaultValue,
    string? InitialValue,
    string? SolutionUniqueName);

public sealed record CreateDefinitionResponse(EnvironmentVariableDto Variable, string? ValueError);

public sealed record UpdateDefinitionBody(
    string? DisplayName,
    string? Description,
    string? DefaultValue,
    string? SchemaName,
    int? Type,
    string? SolutionUniqueName);

public sealed record DefinitionSavedResponse(string DefinitionId);

public sealed record DeleteDefinitionResponse(IReadOnlyList<string> RemainingValueIds);

public sealed record DeleteValueResponse(string ValueId);

public sealed record SaveValueItem(string? DefinitionId, string? ValueId, string? Value);

public sealed record SaveValuesBody(IReadOnlyList<SaveValueItem>? Items);

public sealed record SaveValueResult(string DefinitionId, string? ValueId, bool Ok, string? Error);

public sealed record SaveValuesResponse(IReadOnlyList<SaveValueResult> Results);

public sealed record DependencyDto(int ComponentType, string ObjectId);
