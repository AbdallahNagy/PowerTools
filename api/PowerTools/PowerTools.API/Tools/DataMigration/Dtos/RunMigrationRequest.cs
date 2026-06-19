namespace PowerTools.API.Tools.DataMigration.Dtos;

public record RunMigrationRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter,
    string Mode);