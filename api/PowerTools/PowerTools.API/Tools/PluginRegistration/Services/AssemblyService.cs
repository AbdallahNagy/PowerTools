using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Services;

public sealed class AssemblyService(
    IPluginRegistrationGateway gateway,
    IPluginAssemblyInspector inspector)
{
    public async Task<AssemblyInspectionDto> AnalyzeAsync(
        Stream assembly,
        string fileName,
        long length,
        CancellationToken ct) =>
        await InspectAsync(assembly, fileName, length, ct);

    public async Task<MutationResultDto> RegisterAsync(
        Stream assembly,
        string fileName,
        long length,
        AssemblyRegisterRequest request,
        CapabilitiesDto capabilities,
        CancellationToken ct)
    {
        var bytes = await ReadBytesAsync(assembly, length, ct);
        var inspection = await InspectCopyAsync(bytes, fileName, ct);
        var problems = AssemblyDraftValidator.ValidateRegister(inspection, request, capabilities);
        if (problems.Count > 0)
            throw RegistrationException.Validation(problems);

        var id = await gateway.CreateAsync(
            new Entity("pluginassembly")
            {
                ["name"] = inspection.Identity.Name,
                ["version"] = inspection.Identity.Version,
                ["culture"] = string.IsNullOrWhiteSpace(inspection.Identity.Culture)
                    ? RegistrationOptionValues.CultureNeutral
                    : inspection.Identity.Culture,
                ["publickeytoken"] = inspection.Identity.PublicKeyToken,
                ["isolationmode"] = new OptionSetValue(request.IsolationMode),
                ["sourcetype"] = new OptionSetValue(request.SourceType),
                ["content"] = Convert.ToBase64String(bytes),
            },
            ct);

        await SyncTypesAsync(id, inspection, ct);
        return new MutationResultDto(id);
    }

    public async Task<MutationResultDto> UpdateAsync(
        Guid id,
        Stream assembly,
        string fileName,
        long length,
        CancellationToken ct)
    {
        var existing = await gateway.RetrieveAsync(
            "pluginassembly",
            id,
            new ColumnSet("name", "publickeytoken", "version", "customizationlevel", "ismanaged"),
            ct);
        if (existing is null)
            throw RegistrationException.NotFound("assembly_not_found", "The plug-in assembly was not found.");
        EnsureWritable(existing);

        var bytes = await ReadBytesAsync(assembly, length, ct);
        var inspection = await InspectCopyAsync(bytes, fileName, ct);
        var inspectionProblems = AssemblyDraftValidator.ValidateInspection(inspection);
        if (inspectionProblems.Count > 0)
            throw RegistrationException.Validation(inspectionProblems);

        var existingName = existing.GetAttributeValue<string>("name") ?? string.Empty;
        var existingToken = existing.GetAttributeValue<string>("publickeytoken") ?? string.Empty;
        if (!SameText(existingName, inspection.Identity.Name)
            || !SameText(existingToken, inspection.Identity.PublicKeyToken))
        {
            throw RegistrationException.Conflict(
                "assembly_identity_mismatch",
                "The uploaded assembly does not match the registered assembly identity.",
                [
                    new RegistrationProblem(
                        "assembly",
                        "assembly_identity_mismatch",
                        $"Expected {existingName}, public key token {existingToken}."),
                ]);
        }

        var existingVersion = existing.GetAttributeValue<string>("version") ?? string.Empty;
        if (MajorMinorChanged(existingVersion, inspection.Identity.Version))
        {
            throw RegistrationException.Conflict(
                "assembly_version_change",
                "Major and minor version must stay the same when updating an assembly.",
                [
                    new RegistrationProblem(
                        "version",
                        "assembly_version_change",
                        $"Registered version {existingVersion} cannot change to {inspection.Identity.Version}."),
                ]);
        }

        var existingTypes = await gateway.RetrieveAllAsync(
            CatalogQueries.TypesForAssembly(id),
            ct);
        var incomingNames = IncomingTypeNames(inspection);
        var missing = existingTypes
            .Where(type => GetAssemblyId(type) == id || GetAssemblyId(type) == Guid.Empty)
            .Select(type => type.GetAttributeValue<string>("typename"))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!)
            .Where(name => !incomingNames.Contains(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (missing.Count > 0)
        {
            throw RegistrationException.Conflict(
                "assembly_missing_types",
                "The uploaded assembly is missing plug-in types that are already registered.",
                missing.Select(name => new RegistrationProblem(
                    "assembly",
                    "assembly_missing_types",
                    name)).ToList());
        }

        await gateway.UpdateAsync(
            new Entity("pluginassembly", id)
            {
                ["content"] = Convert.ToBase64String(bytes),
                ["version"] = inspection.Identity.Version,
            },
            ct);
        await SyncTypesAsync(id, inspection, ct);
        return new MutationResultDto(id);
    }

    private async Task SyncTypesAsync(
        Guid assemblyId,
        AssemblyInspectionDto inspection,
        CancellationToken ct)
    {
        var existing = await gateway.RetrieveAllAsync(
            CatalogQueries.TypesForAssembly(assemblyId),
            ct);
        var existingNames = existing
            .Where(type => GetAssemblyId(type) == assemblyId || GetAssemblyId(type) == Guid.Empty)
            .Select(type => type.GetAttributeValue<string>("typename"))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var plugin in inspection.Plugins)
        {
            if (existingNames.Contains(plugin.TypeName))
                continue;
            await gateway.CreateAsync(
                BuildTypeEntity(assemblyId, plugin.TypeName, workflowGroup: null),
                ct);
        }

        var workflowGroup = $"{inspection.Identity.Name} ({inspection.Identity.Version})";
        foreach (var activity in inspection.WorkflowActivities)
        {
            if (existingNames.Contains(activity.TypeName))
                continue;
            await gateway.CreateAsync(
                BuildTypeEntity(assemblyId, activity.TypeName, workflowGroup),
                ct);
        }
    }

    private static Entity BuildTypeEntity(Guid assemblyId, string typeName, string? workflowGroup)
    {
        var entity = new Entity("plugintype")
        {
            ["typename"] = typeName,
            ["name"] = typeName,
            ["friendlyname"] = typeName,
            ["pluginassemblyid"] = new EntityReference("pluginassembly", assemblyId),
        };
        if (workflowGroup is not null)
            entity["workflowactivitygroupname"] = workflowGroup;
        return entity;
    }

    private async Task<AssemblyInspectionDto> InspectCopyAsync(
        byte[] bytes,
        string fileName,
        CancellationToken ct)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        return await InspectAsync(stream, fileName, bytes.LongLength, ct);
    }

    private async Task<AssemblyInspectionDto> InspectAsync(
        Stream assembly,
        string fileName,
        long length,
        CancellationToken ct)
    {
        try
        {
            return await inspector.InspectAsync(assembly, fileName, length, ct);
        }
        catch (AssemblyInspectionValidationException ex)
        {
            throw RegistrationException.Validation([
                new RegistrationProblem("assembly", ex.Code, ex.Message),
            ]);
        }
    }

    private static async Task<byte[]> ReadBytesAsync(
        Stream assembly,
        long declaredLength,
        CancellationToken ct)
    {
        if (declaredLength > PluginAssemblyInspector.MaxAssemblyBytes)
        {
            throw RegistrationException.Validation([
                new RegistrationProblem(
                    "assembly",
                    AssemblyInspectionValidationCodes.TooLarge,
                    $"The assembly exceeds the {PluginAssemblyInspector.MaxAssemblyBytes}-byte limit."),
            ]);
        }

        using var buffer = new MemoryStream(
            declaredLength > 0
                ? (int)Math.Min(declaredLength, PluginAssemblyInspector.MaxAssemblyBytes)
                : 0);
        var chunk = new byte[64 * 1024];
        long total = 0;
        while (true)
        {
            var read = await assembly.ReadAsync(chunk.AsMemory(), ct);
            if (read == 0)
                break;
            total += read;
            if (total > PluginAssemblyInspector.MaxAssemblyBytes)
            {
                throw RegistrationException.Validation([
                    new RegistrationProblem(
                        "assembly",
                        AssemblyInspectionValidationCodes.TooLarge,
                        $"The assembly exceeds the {PluginAssemblyInspector.MaxAssemblyBytes}-byte limit."),
                ]);
            }

            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
        }

        return buffer.ToArray();
    }

    private static HashSet<string> IncomingTypeNames(AssemblyInspectionDto inspection)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var plugin in inspection.Plugins)
            names.Add(plugin.TypeName);
        foreach (var activity in inspection.WorkflowActivities)
            names.Add(activity.TypeName);
        return names;
    }

    private static Guid GetAssemblyId(Entity type) =>
        type.GetAttributeValue<EntityReference>("pluginassemblyid")?.Id ?? Guid.Empty;

    private static void EnsureWritable(Entity assembly)
    {
        if (assembly.GetAttributeValue<bool>("ismanaged")
            || assembly.GetAttributeValue<int>("customizationlevel") == 0)
        {
            throw RegistrationException.Conflict(
                "assembly_read_only",
                "Managed or system assemblies cannot be changed.");
        }
    }

    private static bool SameText(string left, string right) =>
        string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);

    private static bool MajorMinorChanged(string existing, string incoming)
    {
        if (!Version.TryParse(existing, out var current))
            current = new Version(0, 0, 0, 0);
        if (!Version.TryParse(incoming, out var next))
            next = new Version(0, 0, 0, 0);
        return current.Major != next.Major || current.Minor != next.Minor;
    }
}
