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

            var table = body.Table!.ToLowerInvariant();
            var column = body.Column!.ToLowerInvariant();
            if (!LogicalName().IsMatch(table) || !LogicalName().IsMatch(column))
                throw Invalid("table and column must be logical names.");
            var attribute = await RetrieveColumnAsync(table, column, ct);
            var language = await RequireLanguageAsync(ct);
            if (body.MaxLength is not null && attribute is not (StringAttributeMetadata or MemoAttributeMetadata))
                throw Invalid($"Column '{body.Column}' is not a text or memo column, so it has no maxLength.");

            if (body.RequiredLevel is not null)
            {
                if (attribute.RequiredLevel is { CanBeChanged: false })
                    throw Invalid($"The required level of '{body.Column}' cannot be changed (managed property canmodifyrequirementlevelsettings is off).");
                var level = ParseRequiredLevel(body.RequiredLevel);
                if (attribute.RequiredLevel?.Value != level)
                {
                    // UpdateAttribute accepts a required level and silently keeps the old one; the Web API applies it.
                    await UpdateColumnWithWebApiAsync(table, attribute, level, body, language, ct);
                    await AddToSolutionAsync(body.Solution, attribute.MetadataId ?? Guid.Empty, AttributeComponent, ct);
                    return AgentResult<ColumnUpdatedDto>.Ok(new ColumnUpdatedDto(attribute.LogicalName));
                }

                if (body.DisplayName is null && body.Description is null && body.MaxLength is null)
                    return AgentResult<ColumnUpdatedDto>.Ok(new ColumnUpdatedDto(attribute.LogicalName));
            }

            // Send only what changes, on a fresh object of the column's own type.
            var update = (AttributeMetadata)Activator.CreateInstance(attribute.GetType())!;
            update.MetadataId = attribute.MetadataId;
            update.LogicalName = attribute.LogicalName;
            update.SchemaName = attribute.SchemaName;
            if (!string.IsNullOrWhiteSpace(body.DisplayName)) update.DisplayName = Text(body.DisplayName!, language);
            if (body.Description is not null) update.Description = Text(body.Description, language);
            if (body.MaxLength is { } maxLength)
            {
                switch (update)
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
                    Attribute = update,
                    MergeLabels = true,
                    SolutionUniqueName = NullIfBlank(body.Solution),
                },
                ct);
            await AddToSolutionAsync(body.Solution, attribute.MetadataId ?? Guid.Empty, AttributeComponent, ct);
            return AgentResult<ColumnUpdatedDto>.Ok(new ColumnUpdatedDto(attribute.LogicalName));
        });

    /// <summary>
    /// Changes a column through the Web API: read its definition, change it, and PUT it back whole. The Web API
    /// reads the published definition, so the labels and length are taken from the unpublished one the SDK read,
    /// with this call's changes on top; an unpublished label change from an earlier call is kept.
    /// </summary>
    private async Task UpdateColumnWithWebApiAsync(
        string table, AttributeMetadata attribute, AttributeRequiredLevel level, UpdateColumnBody body, int language, CancellationToken ct)
    {
        var typeName = attribute.GetType().Name;
        var path = $"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{attribute.LogicalName}')";
        var json = await client.WebApiAsync(HttpMethod.Get, $"{path}/Microsoft.Dynamics.CRM.{typeName}", null, null, ct);
        var definition = System.Text.Json.Nodes.JsonNode.Parse(json)?.AsObject()
            ?? throw Invalid($"The definition of '{attribute.LogicalName}' could not be read.");

        definition.Remove("@odata.context");
        definition["@odata.type"] = $"#Microsoft.Dynamics.CRM.{typeName}";
        if (definition["RequiredLevel"] is System.Text.Json.Nodes.JsonObject required)
            required["Value"] = level.ToString();
        else
            definition["RequiredLevel"] = new System.Text.Json.Nodes.JsonObject { ["Value"] = level.ToString(), ["CanBeChanged"] = true };

        SetLabel(definition, "DisplayName", body.DisplayName ?? LabelIn(attribute.DisplayName, language), language);
        SetLabel(definition, "Description", body.Description ?? LabelIn(attribute.Description, language), language);
        var maxLength = body.MaxLength ?? attribute switch
        {
            StringAttributeMetadata text => text.MaxLength,
            MemoAttributeMetadata memo => memo.MaxLength,
            _ => null,
        };
        if (maxLength is { } length && definition.ContainsKey("MaxLength"))
        {
            definition["MaxLength"] = attribute is MemoAttributeMetadata
                ? Range(length, 1, 1_048_576, "maxLength")
                : Range(length, 1, 4000, "maxLength");
        }

        var headers = new Dictionary<string, string> { ["MSCRM.MergeLabels"] = "true" };
        if (NullIfBlank(body.Solution) is { } solution) headers["MSCRM.SolutionUniqueName"] = solution;
        await client.WebApiAsync(HttpMethod.Put, path, definition.ToJsonString(), headers, ct);
    }

    private static string? LabelIn(Microsoft.Xrm.Sdk.Label? label, int language) =>
        label?.LocalizedLabels.FirstOrDefault(l => l.LanguageCode == language)?.Label;

    /// <summary>Sets the label text for one language, adding the language when the label has none yet.</summary>
    private static void SetLabel(System.Text.Json.Nodes.JsonObject definition, string property, string? text, int language)
    {
        if (text is null) return;
        if (definition[property] is not System.Text.Json.Nodes.JsonObject label)
        {
            label = new System.Text.Json.Nodes.JsonObject();
            definition[property] = label;
        }

        if (label["LocalizedLabels"] is not System.Text.Json.Nodes.JsonArray labels)
        {
            labels = [];
            label["LocalizedLabels"] = labels;
        }

        var existing = labels.OfType<System.Text.Json.Nodes.JsonObject>()
            .FirstOrDefault(l => l["LanguageCode"]?.GetValue<int>() == language);
        if (existing is not null)
            existing["Label"] = text;
        else
            labels.Add(new System.Text.Json.Nodes.JsonObject { ["Label"] = text, ["LanguageCode"] = language });
        label.Remove("UserLocalizedLabel");
    }

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
