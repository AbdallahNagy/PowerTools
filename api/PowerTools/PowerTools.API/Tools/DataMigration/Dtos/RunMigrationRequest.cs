namespace PowerTools.API.Tools.DataMigration.Dtos;

public record RunMigrationRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter,
    bool Create,
    bool Update,
    bool Delete,
    int? ConfirmedDeleteCount = null);
