using Microsoft.Crm.Sdk.Messages;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary><c>asyncoperation</c> status. Status 30 is Succeeded, 31 Failed, 32 Canceled.</summary>
public sealed record AsyncOperationState(int StateCode, int StatusCode, string? Message, string? FriendlyMessage)
{
    public const int Succeeded = 30;
    public const int Failed = 31;
    public const int Canceled = 32;

    public bool IsFinished => StatusCode is Succeeded or Failed or Canceled;
}

public sealed record ImportJobState(double Progress, string? Data, DateTime? CompletedOn);

public sealed record RibbonTableInfo(string LogicalName, string DisplayName, bool IsCustomizable);

/// <summary>The Dataverse calls the Ribbon Editor makes. Tests replace it with a fake.</summary>
public interface IRibbonWorkbenchClient
{
    /// <summary>Unmanaged, visible solutions that are not patches, with the publisher prefix aliased as <c>publisher.customizationprefix</c>.</summary>
    Task<IReadOnlyList<Entity>> RetrieveSolutionsAsync(CancellationToken cancellationToken);

    /// <summary>Synchronous unmanaged <c>ExportSolution</c>.</summary>
    Task<byte[]> ExportSolutionAsync(string uniqueName, CancellationToken cancellationToken);

    /// <summary>Online <c>ExportSolutionAsync</c>. Returns the async operation and export job ids.</summary>
    Task<(Guid AsyncOperationId, Guid ExportJobId)> StartExportAsync(string uniqueName, CancellationToken cancellationToken);

    Task<byte[]> DownloadExportAsync(Guid exportJobId, CancellationToken cancellationToken);

    /// <summary>Null when the row does not exist yet.</summary>
    Task<AsyncOperationState?> RetrieveAsyncOperationAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>The compressed published ribbon of one table, for all locations.</summary>
    Task<byte[]> RetrieveEntityRibbonAsync(string entity, CancellationToken cancellationToken);

    Task<byte[]> RetrieveApplicationRibbonAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<RibbonTableInfo>> RetrieveTablesAsync(IReadOnlyCollection<string> logicalNames, CancellationToken cancellationToken);

    /// <summary><c>ExecuteAsync(ImportSolution)</c>. Returns the async operation id.</summary>
    Task<Guid> StartImportAsync(byte[] customizationFile, Guid importJobId, CancellationToken cancellationToken);

    /// <summary>Null when the <c>importjob</c> row does not exist yet.</summary>
    Task<ImportJobState?> RetrieveImportJobAsync(Guid importJobId, CancellationToken cancellationToken);

    Task PublishAsync(string parameterXml, CancellationToken cancellationToken);

    /// <summary>The names, of those given, that exist as web resources.</summary>
    Task<IReadOnlySet<string>> RetrieveWebResourceNamesAsync(IReadOnlyCollection<string> names, CancellationToken cancellationToken);

    /// <summary>Privileges, of those given, the caller does not hold.</summary>
    Task<IReadOnlyList<string>> RetrieveMissingPrivilegesAsync(IReadOnlyList<string> privilegeNames, CancellationToken cancellationToken);
}

public static class RibbonRequests
{
    public static QueryExpression Solutions()
    {
        var query = new QueryExpression("solution")
        {
            ColumnSet = new ColumnSet("solutionid", "uniquename", "friendlyname", "version", "ismanaged", "isvisible", "parentsolutionid"),
            PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
        };
        query.Criteria.AddCondition("ismanaged", ConditionOperator.Equal, false);
        query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("parentsolutionid", ConditionOperator.Null);
        var publisher = query.AddLink("publisher", "publisherid", "publisherid", JoinOperator.Inner);
        publisher.EntityAlias = "publisher";
        publisher.Columns = new ColumnSet("customizationprefix");
        query.AddOrder("friendlyname", OrderType.Ascending);
        return query;
    }

    /// <summary>Publish only the touched tables and the application ribbon. Never <c>PublishAllXml</c>.</summary>
    public static string PublishXml(PublishTargetsDto targets)
    {
        var builder = new System.Text.StringBuilder("<importexportxml>");
        if (targets.Entities.Count > 0)
        {
            builder.Append("<entities>");
            foreach (var entity in targets.Entities)
                builder.Append("<entity>").Append(System.Security.SecurityElement.Escape(entity)).Append("</entity>");
            builder.Append("</entities>");
        }

        if (targets.ApplicationRibbon) builder.Append("<ribbons><ribbon></ribbon></ribbons>");
        return builder.Append("</importexportxml>").ToString();
    }

    public static ImportSolutionRequest Import(byte[] customizationFile, Guid importJobId) =>
        new()
        {
            CustomizationFile = customizationFile,
            ImportJobId = importJobId,
            OverwriteUnmanagedCustomizations = true,
            // A re-import deactivates processes in the solution for the update; true turns them back on.
            PublishWorkflows = true,
            ConvertToManaged = false,
            HoldingSolution = false,
            SkipProductUpdateDependencies = false,
        };
}

public sealed class DataverseRibbonWorkbenchClient(IOrganizationServiceAsync2 service) : IRibbonWorkbenchClient
{
    public async Task<IReadOnlyList<Entity>> RetrieveSolutionsAsync(CancellationToken cancellationToken)
    {
        var query = RibbonRequests.Solutions();
        var rows = new List<Entity>();
        while (true)
        {
            var page = await service.RetrieveMultipleAsync(query, cancellationToken);
            rows.AddRange(page.Entities);
            if (!page.MoreRecords) return rows;
            query.PageInfo.PageNumber++;
            query.PageInfo.PagingCookie = page.PagingCookie;
        }
    }

    public async Task<byte[]> ExportSolutionAsync(string uniqueName, CancellationToken cancellationToken)
    {
        var response = (ExportSolutionResponse)await service.ExecuteAsync(
            new ExportSolutionRequest { SolutionName = uniqueName, Managed = false },
            cancellationToken);
        return response.ExportSolutionFile;
    }

    public async Task<(Guid AsyncOperationId, Guid ExportJobId)> StartExportAsync(
        string uniqueName,
        CancellationToken cancellationToken)
    {
        var response = (ExportSolutionAsyncResponse)await service.ExecuteAsync(
            new ExportSolutionAsyncRequest { SolutionName = uniqueName, Managed = false },
            cancellationToken);
        return (response.AsyncOperationId, response.ExportJobId);
    }

    public async Task<byte[]> DownloadExportAsync(Guid exportJobId, CancellationToken cancellationToken)
    {
        var response = (DownloadSolutionExportDataResponse)await service.ExecuteAsync(
            new DownloadSolutionExportDataRequest { ExportJobId = exportJobId },
            cancellationToken);
        return response.ExportSolutionFile;
    }

    public async Task<AsyncOperationState?> RetrieveAsyncOperationAsync(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var row = await service.RetrieveAsync(
                "asyncoperation",
                id,
                new ColumnSet("statecode", "statuscode", "message", "friendlymessage"),
                cancellationToken);
            return new AsyncOperationState(
                row.GetAttributeValue<OptionSetValue>("statecode")?.Value ?? 0,
                row.GetAttributeValue<OptionSetValue>("statuscode")?.Value ?? 0,
                row.GetAttributeValue<string>("message"),
                row.GetAttributeValue<string>("friendlymessage"));
        }
        catch (Exception ex) when (RibbonWorkbenchFaults.IsDoesNotExist(ex))
        {
            return null;
        }
    }

    public async Task<byte[]> RetrieveEntityRibbonAsync(string entity, CancellationToken cancellationToken)
    {
        var response = (RetrieveEntityRibbonResponse)await service.ExecuteAsync(
            new RetrieveEntityRibbonRequest { EntityName = entity, RibbonLocationFilter = RibbonLocationFilters.All },
            cancellationToken);
        return response.CompressedEntityXml;
    }

    public async Task<byte[]> RetrieveApplicationRibbonAsync(CancellationToken cancellationToken)
    {
        var response = (RetrieveApplicationRibbonResponse)await service.ExecuteAsync(
            new RetrieveApplicationRibbonRequest(),
            cancellationToken);
        return response.CompressedApplicationRibbonXml;
    }

    public async Task<IReadOnlyList<RibbonTableInfo>> RetrieveTablesAsync(
        IReadOnlyCollection<string> logicalNames,
        CancellationToken cancellationToken)
    {
        if (logicalNames.Count == 0) return [];
        var criteria = new MetadataFilterExpression(LogicalOperator.And);
        criteria.Conditions.Add(new MetadataConditionExpression("LogicalName", MetadataConditionOperator.In, logicalNames.ToArray()));
        var request = new RetrieveMetadataChangesRequest
        {
            Query = new EntityQueryExpression
            {
                Criteria = criteria,
                Properties = new MetadataPropertiesExpression("LogicalName", "DisplayName", "IsCustomizable"),
            },
        };
        var response = (RetrieveMetadataChangesResponse)await service.ExecuteAsync(request, cancellationToken);
        return response.EntityMetadata
            .Select(table => new RibbonTableInfo(
                table.LogicalName,
                table.DisplayName?.UserLocalizedLabel?.Label ?? table.LogicalName,
                table.IsCustomizable?.Value ?? true))
            .ToList();
    }

    public async Task<Guid> StartImportAsync(byte[] customizationFile, Guid importJobId, CancellationToken cancellationToken)
    {
        var response = (ExecuteAsyncResponse)await service.ExecuteAsync(
            new ExecuteAsyncRequest { Request = RibbonRequests.Import(customizationFile, importJobId) },
            cancellationToken);
        return response.AsyncJobId;
    }

    public async Task<ImportJobState?> RetrieveImportJobAsync(Guid importJobId, CancellationToken cancellationToken)
    {
        try
        {
            var row = await service.RetrieveAsync(
                "importjob",
                importJobId,
                new ColumnSet("progress", "data", "completedon"),
                cancellationToken);
            return new ImportJobState(
                row.GetAttributeValue<double?>("progress") ?? 0,
                row.GetAttributeValue<string>("data"),
                row.GetAttributeValue<DateTime?>("completedon"));
        }
        catch (Exception ex) when (RibbonWorkbenchFaults.IsDoesNotExist(ex))
        {
            return null;
        }
    }

    public async Task PublishAsync(string parameterXml, CancellationToken cancellationToken)
    {
        await service.ExecuteAsync(new PublishXmlRequest { ParameterXml = parameterXml }, cancellationToken);
    }

    public async Task<IReadOnlySet<string>> RetrieveWebResourceNamesAsync(
        IReadOnlyCollection<string> names,
        CancellationToken cancellationToken)
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (names.Count == 0) return found;
        var query = new QueryExpression("webresource") { ColumnSet = new ColumnSet("name") };
        query.Criteria.AddCondition("name", ConditionOperator.In, names.Cast<object>().ToArray());
        var result = await service.RetrieveMultipleAsync(query, cancellationToken);
        foreach (var row in result.Entities)
        {
            if (row.GetAttributeValue<string>("name") is { Length: > 0 } name) found.Add(name);
        }

        return found;
    }

    public async Task<IReadOnlyList<string>> RetrieveMissingPrivilegesAsync(
        IReadOnlyList<string> privilegeNames,
        CancellationToken cancellationToken)
    {
        var who = (WhoAmIResponse)await service.ExecuteAsync(new WhoAmIRequest(), cancellationToken);
        var missing = new List<string>();
        foreach (var name in privilegeNames)
        {
            var response = (RetrieveUserPrivilegeByPrivilegeNameResponse)await service.ExecuteAsync(
                new RetrieveUserPrivilegeByPrivilegeNameRequest { UserId = who.UserId, PrivilegeName = name },
                cancellationToken);
            if (response.RolePrivileges is null || response.RolePrivileges.Length == 0) missing.Add(name);
        }

        return missing;
    }
}
