using System.Security;
using System.Text.RegularExpressions;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Agent;

public sealed partial class AgentSchemaService
{
    [GeneratedRegex("^[a-z_][a-z0-9_]*$")]
    private static partial Regex LogicalName();

    // ── Update and publish ───────────────────────────────────────────────────

    public Task<AgentResult<ColumnUpdatedDto>> UpdateColumnAsync(UpdateColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.Column, "column");
            if (body.DisplayName is null && body.Description is null && body.RequiredLevel is null && body.MaxLength is null)
                throw Invalid("Give at least one of displayName, description, requiredLevel or maxLength.");

            var attribute = await RetrieveColumnAsync(body.Table!, body.Column!, ct);
            var language = await RequireLanguageAsync(ct);
            if (!string.IsNullOrWhiteSpace(body.DisplayName)) attribute.DisplayName = Text(body.DisplayName!, language);
            if (body.Description is not null) attribute.Description = Text(body.Description, language);
            if (body.RequiredLevel is not null)
                attribute.RequiredLevel = new AttributeRequiredLevelManagedProperty(ParseRequiredLevel(body.RequiredLevel));
            if (body.MaxLength is { } maxLength)
            {
                switch (attribute)
                {
                    case StringAttributeMetadata text: text.MaxLength = Range(maxLength, 1, 4000, "maxLength"); break;
                    case MemoAttributeMetadata memo: memo.MaxLength = Range(maxLength, 1, 1_048_576, "maxLength"); break;
                    default: throw Invalid($"Column '{body.Column}' is not a text or memo column, so it has no maxLength.");
                }
            }

            await client.ExecuteAsync(
                new UpdateAttributeRequest
                {
                    EntityName = body.Table!.ToLowerInvariant(),
                    Attribute = attribute,
                    MergeLabels = true,
                    SolutionUniqueName = NullIfBlank(body.Solution),
                },
                ct);
            await AddToSolutionAsync(body.Solution, attribute.MetadataId ?? Guid.Empty, AttributeComponent, ct);
            return AgentResult<ColumnUpdatedDto>.Ok(new ColumnUpdatedDto(attribute.LogicalName));
        });

    public Task<AgentResult<ColumnInfoDto>> GetColumnInfoAsync(string table, string column, CancellationToken ct) =>
        Guard(async () =>
        {
            var attribute = await RetrieveColumnAsync(table, column, ct);
            var maxLength = attribute switch
            {
                StringAttributeMetadata text => text.MaxLength,
                MemoAttributeMetadata memo => memo.MaxLength,
                _ => null,
            };
            return AgentResult<ColumnInfoDto>.Ok(
                new ColumnInfoDto(attribute.AttributeType?.ToString()?.ToLowerInvariant() ?? "unknown", maxLength));
        });

    /// <summary>Publishes the listed tables, or everything when the list is empty.</summary>
    public Task<AgentResult<PublishedDto>> PublishAsync(PublishBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var tables = (body.Tables ?? []).Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().ToList();
            foreach (var table in tables)
            {
                if (!LogicalName().IsMatch(table)) throw Invalid($"'{table}' is not a table logical name.");
            }

            if (tables.Count == 0)
            {
                await client.ExecuteAsync(new PublishAllXmlRequest(), ct);
                return AgentResult<PublishedDto>.Ok(new PublishedDto("all", []));
            }

            var entities = string.Concat(tables.Select(t => $"<entity>{SecurityElement.Escape(t)}</entity>"));
            await client.ExecuteAsync(
                new PublishXmlRequest { ParameterXml = $"<importexportxml><entities>{entities}</entities></importexportxml>" },
                ct);
            return AgentResult<PublishedDto>.Ok(new PublishedDto("tables", tables));
        });

    private async Task<AttributeMetadata> RetrieveColumnAsync(string table, string column, CancellationToken ct)
    {
        try
        {
            var response = (RetrieveAttributeResponse)await client.ExecuteAsync(
                new RetrieveAttributeRequest
                {
                    EntityLogicalName = table.ToLowerInvariant(),
                    LogicalName = column.ToLowerInvariant(),
                    RetrieveAsIfPublished = true,
                },
                ct);
            return response.AttributeMetadata;
        }
        catch (System.ServiceModel.FaultException<Microsoft.Xrm.Sdk.OrganizationServiceFault> ex)
            when (ex.Detail.ErrorCode == unchecked((int)0x80040217))
        {
            throw new AgentProblemException(AgentFaults.NotFound($"Column '{column}' was not found on '{table}'."));
        }
    }
}
