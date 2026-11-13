using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Agent;

public sealed class DeleteColumnBody
{
    public string? Table { get; set; }
    public string? Column { get; set; }
}

public sealed class DeleteTableBody
{
    public string? Table { get; set; }
}

public sealed class DeleteRelationshipBody
{
    public string? SchemaName { get; set; }
}

public sealed class DeleteChoiceBody
{
    public string? Choice { get; set; }
}

public sealed record DeletedDto(string Name);

public sealed partial class AgentSchemaService
{
    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex SchemaNamePattern();

    public Task<AgentResult<DeletedDto>> DeleteColumnAsync(DeleteColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.Column, "column");
            var table = body.Table!.ToLowerInvariant();
            var column = body.Column!.ToLowerInvariant();
            await client.ExecuteAsync(new DeleteAttributeRequest { EntityLogicalName = table, LogicalName = column }, ct);
            return AgentResult<DeletedDto>.Ok(new DeletedDto($"{table}.{column}"));
        });

    /// <summary>Deletes a custom table and every row in it. System tables are refused.</summary>
    public Task<AgentResult<DeletedDto>> DeleteTableAsync(DeleteTableBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            var table = body.Table!.ToLowerInvariant();
            var response = (RetrieveEntityResponse)await client.ExecuteAsync(
                new RetrieveEntityRequest { LogicalName = table, EntityFilters = EntityFilters.Entity }, ct);
            if (response.EntityMetadata?.IsCustomEntity != true)
                throw Invalid($"Table '{table}' is not a custom table, so it cannot be deleted.");

            await client.ExecuteAsync(new DeleteEntityRequest { LogicalName = table }, ct);
            return AgentResult<DeletedDto>.Ok(new DeletedDto(table));
        });

    /// <summary>Deletes a custom global choice. Dataverse refuses one that columns still use.</summary>
    public Task<AgentResult<DeletedDto>> DeleteChoiceAsync(DeleteChoiceBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Choice, "choice");
            var set = await RetrieveChoiceAsync(body.Choice!, ct);
            if (set.IsGlobal != true) throw Invalid($"'{body.Choice}' is not a global choice.");
            if (set.IsCustomOptionSet != true) throw Invalid($"Choice '{set.Name}' is not a custom choice, so it cannot be deleted.");
            if (set.IsManaged == true) throw Invalid($"Choice '{set.Name}' is managed; remove the solution that brought it instead.");

            await client.ExecuteAsync(new DeleteOptionSetRequest { Name = set.Name }, ct);
            return AgentResult<DeletedDto>.Ok(new DeletedDto(set.Name!));
        });

    public Task<AgentResult<DeletedDto>> DeleteRelationshipAsync(DeleteRelationshipBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.SchemaName, "schemaName");
            if (!SchemaNamePattern().IsMatch(body.SchemaName!)) throw Invalid("schemaName is not a valid relationship schema name.");
            await client.ExecuteAsync(new DeleteRelationshipRequest { Name = body.SchemaName }, ct);
            return AgentResult<DeletedDto>.Ok(new DeletedDto(body.SchemaName!));
        });
}
