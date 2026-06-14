namespace PowerTools.API.Tools.DataMigration.Dtos;

public abstract record RunMigrationRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter,
    string Mode);