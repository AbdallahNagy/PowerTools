using System.Xml.Linq;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.RibbonWorkbench;

public interface IRibbonDelay
{
    Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken);
}

public sealed class RibbonDelay : IRibbonDelay
{
    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken) =>
        delay <= TimeSpan.Zero ? Task.CompletedTask : Task.Delay(delay, cancellationToken);
}

/// <summary>Solutions, load, base ribbons, validation, and export for one request or one publish job.</summary>
public sealed class RibbonWorkbenchService(IRibbonWorkbenchClient client, IRibbonDelay? delay = null, bool online = true)
{
    public static readonly TimeSpan ExportPollInterval = TimeSpan.FromSeconds(3);
    public static readonly TimeSpan ExportTimeout = TimeSpan.FromMinutes(10);

    public static readonly string[] RequiredPrivileges =
        ["prvExportCustomizations", "prvImportCustomizations", "prvPublishCustomizations"];

    private static readonly HashSet<string> HiddenSolutions = new(StringComparer.OrdinalIgnoreCase) { "Default", "Active" };

    private readonly IRibbonDelay _delay = delay ?? new RibbonDelay();

    public async Task<RibbonResult<RibbonSolutionsResponse>> GetSolutionsAsync(CancellationToken cancellationToken)
    {
        try
        {
            return RibbonResult<RibbonSolutionsResponse>.Ok(new RibbonSolutionsResponse(await LoadSolutionsAsync(cancellationToken)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return RibbonResult<RibbonSolutionsResponse>.Fail(RibbonWorkbenchFaults.From(ex));
        }
    }

    public async Task<IReadOnlyList<RibbonSolutionDto>> LoadSolutionsAsync(CancellationToken cancellationToken)
    {
        var rows = await client.RetrieveSolutionsAsync(cancellationToken);
        return rows
            .Where(row => !row.GetAttributeValue<bool>("ismanaged") && row.GetAttributeValue<EntityReference>("parentsolutionid") is null)
            .Select(row =>
            {
                var unique = row.GetAttributeValue<string>("uniquename") ?? "";
                var friendly = row.GetAttributeValue<string>("friendlyname");
                var prefix = row.GetAttributeValue<AliasedValue>("publisher.customizationprefix")?.Value as string;
                return new RibbonSolutionDto(
                    row.Id,
                    unique,
                    string.IsNullOrWhiteSpace(friendly) ? unique : friendly,
                    string.IsNullOrWhiteSpace(prefix) ? null : prefix,
                    row.GetAttributeValue<string>("version"));
            })
            .Where(solution => solution.UniqueName.Length > 0 && !HiddenSolutions.Contains(solution.UniqueName))
            .OrderBy(solution => solution.FriendlyName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(solution => solution.UniqueName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<RibbonResult<LoadResponse>> LoadAsync(LoadBody body, CancellationToken cancellationToken)
    {
        var name = body.SolutionUniqueName?.Trim();
        if (string.IsNullOrEmpty(name))
            return RibbonResult<LoadResponse>.Fail(RibbonWorkbenchFaults.Invalid("Choose a solution."));

        try
        {
            var solution = await FindSolutionAsync(name, cancellationToken);
            if (solution is null)
            {
                return RibbonResult<LoadResponse>.Fail(RibbonWorkbenchFaults.NotFound(
                    $"Solution {name} was not found, or it is managed, hidden, or a patch."));
            }

            var package = RibbonSolutionPackage.Read(await ExportAsync(solution.UniqueName, cancellationToken));
            var tables = (await client.RetrieveTablesAsync(
                    package.Entities.Select(entity => entity.LogicalName).ToList(),
                    cancellationToken))
                .ToDictionary(table => table.LogicalName, StringComparer.OrdinalIgnoreCase);

            var response = new LoadResponse
            {
                Solution = solution,
                RuleTypes = RibbonRuleTypes.All.ToList(),
            };

            foreach (var entity in package.Entities)
            {
                tables.TryGetValue(entity.LogicalName, out var info);
                var dto = new RibbonEntityDto
                {
                    LogicalName = entity.LogicalName,
                    DisplayName = info?.DisplayName ?? entity.LogicalName,
                    RibbonNotSupported = entity.RibbonNotSupported,
                };
                if (entity.Diff is null)
                {
                    dto.ReadOnlyReason =
                        "This table was added to the solution without its metadata, so its command bar cannot be " +
                        "edited here. Add the table with Include table metadata, then reload.";
                }
                else
                {
                    var node = RibbonXml.ToNode(entity.Diff);
                    dto.Diff = node;
                    dto.DiffHash = RibbonXml.Hash(node);
                    if (info is { IsCustomizable: false })
                        dto.ReadOnlyReason = "This table is not customizable, so its command bar cannot be changed.";
                }

                response.Entities.Add(dto);
            }

            response.Entities = response.Entities
                .OrderBy(entity => entity.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(entity => entity.LogicalName, StringComparer.Ordinal)
                .ToList();

            response.ApplicationRibbon.Included = package.IncludesApplicationRibbon;
            if (package.ApplicationDiff is { } appDiff)
            {
                var node = RibbonXml.ToNode(appDiff);
                response.ApplicationRibbon.Diff = node;
                response.ApplicationRibbon.DiffHash = RibbonXml.Hash(node);
            }

            if (!package.IncludesApplicationRibbon)
            {
                response.ApplicationRibbon.ReadOnlyReason =
                    "This solution does not contain Application Ribbons. Add that component to the solution to " +
                    "edit the application ribbon, then reload.";
            }
            else if (package.ApplicationDiff is null)
            {
                response.ApplicationRibbon.ReadOnlyReason =
                    "The exported solution has no application ribbon definition, so it cannot be edited here.";
            }

            response.OtherComponents = package.RootComponentTypes
                .Where(type => type is not RibbonSolutionPackage.EntityComponentType
                    and not RibbonSolutionPackage.RibbonCustomizationComponentType)
                .GroupBy(type => type)
                .OrderBy(group => group.Key)
                .Select(group => new ComponentCountDto(group.Key, RibbonSolutionPackage.ComponentTypeName(group.Key), group.Count()))
                .ToList();

            var missing = await MissingPrivilegesAsync(cancellationToken);
            var blocking = missing.Where(privilege => privilege != "prvExportCustomizations").ToList();
            if (blocking.Count > 0)
            {
                response.CanPublish = false;
                response.ReadOnlyReason =
                    "You can look at command bars but not publish changes: your security roles do not include " +
                    $"{string.Join(" and ", blocking.Select(PrivilegeName))}.";
            }

            return RibbonResult<LoadResponse>.Ok(response);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return RibbonResult<LoadResponse>.Fail(RibbonWorkbenchFaults.From(ex));
        }
    }

    public async Task<RibbonResult<BaseRibbonDto>> GetBaseRibbonAsync(string? entity, CancellationToken cancellationToken)
    {
        try
        {
            return RibbonResult<BaseRibbonDto>.Ok(await ReadBaseRibbonAsync(entity, cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return RibbonResult<BaseRibbonDto>.Fail(RibbonWorkbenchFaults.From(ex));
        }
    }

    public async Task<BaseRibbonDto> ReadBaseRibbonAsync(string? entity, CancellationToken cancellationToken)
    {
        var name = string.IsNullOrWhiteSpace(entity) || RibbonKeys.IsApplication(entity) ? null : entity.Trim().ToLowerInvariant();
        var compressed = name is null
            ? await client.RetrieveApplicationRibbonAsync(cancellationToken)
            : await client.RetrieveEntityRibbonAsync(name, cancellationToken);
        return RibbonDefinition.Parse(RibbonDefinition.Unzip(compressed), name);
    }

    public async Task<RibbonResult<ValidateResponse>> ValidateAsync(DiffsBody body, CancellationToken cancellationToken)
    {
        if (body.Diffs is not { Count: > 0 } diffs)
            return RibbonResult<ValidateResponse>.Fail(RibbonWorkbenchFaults.Invalid("There are no changes to check."));
        var name = body.SolutionUniqueName?.Trim();
        if (string.IsNullOrEmpty(name))
            return RibbonResult<ValidateResponse>.Fail(RibbonWorkbenchFaults.Invalid("Choose a solution."));

        try
        {
            var solution = await FindSolutionAsync(name, cancellationToken);
            if (solution is null)
            {
                return RibbonResult<ValidateResponse>.Fail(RibbonWorkbenchFaults.NotFound(
                    $"Solution {name} was not found, or it is managed, hidden, or a patch."));
            }

            return RibbonResult<ValidateResponse>.Ok(new ValidateResponse(
                await CheckAsync(diffs, solution.PublisherPrefix, cancellationToken)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return RibbonResult<ValidateResponse>.Fail(RibbonWorkbenchFaults.From(ex));
        }
    }

    public async Task<IReadOnlyList<ProblemDto>> CheckAsync(
        IReadOnlyDictionary<string, RibbonNodeDto> diffs,
        string? publisherPrefix,
        CancellationToken cancellationToken)
    {
        var applicationBase = await ReadBaseRibbonAsync(null, cancellationToken);
        var applicationDiff = diffs.FirstOrDefault(pair => RibbonKeys.IsApplication(pair.Key)).Value;

        var webResources = diffs.Values.SelectMany(RibbonDiffValidator.WebResources)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var existing = webResources.Count == 0
            ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            : await client.RetrieveWebResourceNamesAsync(webResources, cancellationToken);

        var problems = new List<ProblemDto>();
        foreach (var (key, diff) in diffs.OrderBy(pair => RibbonKeys.IsApplication(pair.Key) ? 0 : 1).ThenBy(pair => pair.Key, StringComparer.Ordinal))
        {
            var application = RibbonKeys.IsApplication(key);
            var context = new DiffValidationContext
            {
                Key = application ? RibbonKeys.ApplicationRibbon : key.ToLowerInvariant(),
                Diff = diff,
                Base = application ? applicationBase : await ReadBaseRibbonAsync(key, cancellationToken),
                ApplicationBase = applicationBase,
                ApplicationDiff = applicationDiff,
                PublisherPrefix = publisherPrefix,
            };
            problems.AddRange(RibbonDiffValidator.Validate(context, existing));
        }

        return problems
            .OrderBy(problem => problem.Severity == ProblemSeverities.Error ? 0 : 1)
            .ToList();
    }

    public async Task<RibbonSolutionDto?> FindSolutionAsync(string uniqueName, CancellationToken cancellationToken) =>
        (await LoadSolutionsAsync(cancellationToken))
            .FirstOrDefault(solution => string.Equals(solution.UniqueName, uniqueName, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Unmanaged export. Online uses ExportSolutionAsync so a large solution does not hit the request timeout;
    /// on premises, or where that message is not available, the synchronous ExportSolution is used.
    /// </summary>
    public async Task<byte[]> ExportAsync(string uniqueName, CancellationToken cancellationToken)
    {
        if (!online) return await client.ExportSolutionAsync(uniqueName, cancellationToken);

        Guid operationId;
        Guid exportJobId;
        try
        {
            (operationId, exportJobId) = await client.StartExportAsync(uniqueName, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException && RibbonWorkbenchFaults.IsUnsupportedRequest(ex))
        {
            return await client.ExportSolutionAsync(uniqueName, cancellationToken);
        }

        var waited = TimeSpan.Zero;
        while (true)
        {
            await _delay.WaitAsync(ExportPollInterval, cancellationToken);
            waited += ExportPollInterval;
            var operation = await client.RetrieveAsyncOperationAsync(operationId, cancellationToken);
            if (operation is { StatusCode: AsyncOperationState.Succeeded })
                return await client.DownloadExportAsync(exportJobId, cancellationToken);
            if (operation is { IsFinished: true })
            {
                var reason = operation.FriendlyMessage ?? operation.Message ?? "Dataverse did not give a reason.";
                throw new RibbonPackageException($"The solution could not be exported. {reason}");
            }

            if (waited >= ExportTimeout)
                throw new RibbonPackageException("The solution export did not finish within 10 minutes. Try again later.");
        }
    }

    private async Task<IReadOnlyList<string>> MissingPrivilegesAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await client.RetrieveMissingPrivilegesAsync(RequiredPrivileges, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Older servers do not have RetrieveUserPrivilegeByPrivilegeName. Do not block; import reports a missing privilege.
            return [];
        }
    }

    private static string PrivilegeName(string privilege) => privilege switch
    {
        "prvImportCustomizations" => "Import Customizations",
        "prvPublishCustomizations" => "Publish Customizations",
        "prvExportCustomizations" => "Export Customizations",
        _ => privilege,
    };

    public static IReadOnlyDictionary<string, XElement> ToElements(IReadOnlyDictionary<string, RibbonNodeDto> diffs) =>
        diffs.ToDictionary(
            pair => RibbonKeys.IsApplication(pair.Key) ? RibbonKeys.ApplicationRibbon : pair.Key.ToLowerInvariant(),
            pair => RibbonXml.ToElement(pair.Value),
            StringComparer.OrdinalIgnoreCase);
}
