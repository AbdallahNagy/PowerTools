using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Metadata;

namespace PowerTools.API.Tools.Agent;

public sealed partial class AgentSchemaService
{
    internal const int SystemFormComponent = 60;
    internal const int SavedQueryComponent = 26;
    private const int MainForm = 2;
    private const int QuickCreateForm = 7;

    // ── Forms ────────────────────────────────────────────────────────────────

    public static QueryExpression FormsQuery(string table)
    {
        var query = new QueryExpression("systemform")
        {
            NoLock = true,
            ColumnSet = new ColumnSet("name", "type", "formxml"),
        };
        query.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, table);
        query.Criteria.AddCondition("type", ConditionOperator.In, MainForm, QuickCreateForm);
        query.Criteria.AddCondition("formactivationstate", ConditionOperator.Equal, 1);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        return query;
    }

    public Task<AgentResult<IReadOnlyList<FormInfoDto>>> ListFormsAsync(string? table, CancellationToken ct) =>
        Guard<IReadOnlyList<FormInfoDto>>(async () =>
        {
            Require(table, "table");
            var rows = await client.RetrieveMultipleAsync(FormsQuery(table!.ToLowerInvariant()), ct);
            return AgentResult<IReadOnlyList<FormInfoDto>>.Ok(rows.Entities
                .Select(row => new FormInfoDto(
                    row.Id,
                    row.GetAttributeValue<string>("name") ?? "",
                    row.GetAttributeValue<OptionSetValue>("type")?.Value ?? 0,
                    AgentFormXml.ListTabs(row.GetAttributeValue<string>("formxml") ?? "<form/>")))
                .ToList());
        });

    public Task<AgentResult<ColumnAddedDto>> AddColumnToFormAsync(AddFormColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.Column, "column");
            var formId = ParseGuid(body.FormId, "formId");
            var table = body.Table!.ToLowerInvariant();

            var form = await RetrieveAsync("systemform", formId, ["objecttypecode", "type", "formxml"], ct);
            var type = form.GetAttributeValue<OptionSetValue>("type")?.Value;
            if (!string.Equals(form.GetAttributeValue<string>("objecttypecode"), table, StringComparison.OrdinalIgnoreCase)
                || type is not (MainForm or QuickCreateForm))
            {
                throw Invalid($"Form {formId} is not a main or quick create form of '{table}'.");
            }

            var attribute = await RetrieveColumnAsync(table, body.Column!, ct);
            var language = await RequireLanguageAsync(ct);
            var display = attribute.DisplayName?.UserLocalizedLabel?.Label
                ?? attribute.DisplayName?.LocalizedLabels.FirstOrDefault()?.Label
                ?? attribute.LogicalName;

            var edited = AgentFormXml.AddColumn(
                form.GetAttributeValue<string>("formxml") ?? "",
                attribute.LogicalName,
                display,
                language,
                AgentFormXml.ClassId(ControlKind(attribute)),
                body.Tab,
                body.Section,
                Guid.NewGuid());
            if (edited.Problem is not null) return AgentResult<ColumnAddedDto>.Fail(edited.Problem);

            await client.UpdateAsync(new Entity("systemform", formId) { ["formxml"] = edited.Value }, ct);
            await AddToSolutionAsync(body.Solution, formId, SystemFormComponent, ct);
            return AgentResult<ColumnAddedDto>.Ok(new ColumnAddedDto(formId, attribute.LogicalName));
        });

    /// <summary>
    /// Takes a column off a form without checking the column exists, so a column that was already deleted can be
    /// cleaned off a form too.
    /// </summary>
    public Task<AgentResult<ColumnRemovedDto>> RemoveColumnFromFormAsync(RemoveFormColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.Column, "column");
            var formId = ParseGuid(body.FormId, "formId");
            var table = body.Table!.ToLowerInvariant();

            var form = await RetrieveAsync("systemform", formId, ["objecttypecode", "type", "formxml"], ct);
            var type = form.GetAttributeValue<OptionSetValue>("type")?.Value;
            if (!string.Equals(form.GetAttributeValue<string>("objecttypecode"), table, StringComparison.OrdinalIgnoreCase)
                || type is not (MainForm or QuickCreateForm))
            {
                throw Invalid($"Form {formId} is not a main or quick create form of '{table}'.");
            }

            var column = body.Column!.ToLowerInvariant();
            var edited = AgentFormXml.RemoveColumn(form.GetAttributeValue<string>("formxml") ?? "", column);
            if (edited.Problem is not null) return AgentResult<ColumnRemovedDto>.Fail(edited.Problem);

            await client.UpdateAsync(new Entity("systemform", formId) { ["formxml"] = edited.Value!.FormXml }, ct);
            await AddToSolutionAsync(body.Solution, formId, SystemFormComponent, ct);
            return AgentResult<ColumnRemovedDto>.Ok(new ColumnRemovedDto(formId, column, edited.Value.Places));
        });

    // ── Views ────────────────────────────────────────────────────────────────

    public Task<AgentResult<IReadOnlyList<ViewListItemDto>>> ListViewsAsync(string? table, CancellationToken ct) =>
        Guard<IReadOnlyList<ViewListItemDto>>(async () =>
        {
            Require(table, "table");
            var rows = await client.RetrieveMultipleAsync(EntityViews.SystemViewsQuery(table!.ToLowerInvariant()), ct);
            return AgentResult<IReadOnlyList<ViewListItemDto>>.Ok(rows.Entities
                .Select(row => EntityViews.ToDto(row, "system"))
                .Where(view => view.Columns.Count > 0)
                .Select(view => new ViewListItemDto(view.Id, view.Name, view.IsDefault, view.Columns))
                .ToList());
        });

    public Task<AgentResult<ColumnAddedDto>> AddColumnToViewAsync(AddViewColumnBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Table, "table");
            Require(body.Column, "column");
            var viewId = ParseGuid(body.ViewId, "viewId");
            var width = body.Width ?? AgentViewXml.DefaultWidth;
            if (width is < 10 or > 1000) throw Invalid("width must be from 10 to 1000.");
            var table = body.Table!.ToLowerInvariant();

            var view = await RetrieveAsync("savedquery", viewId, ["returnedtypecode", "layoutxml", "fetchxml"], ct);
            if (!string.Equals(view.GetAttributeValue<string>("returnedtypecode"), table, StringComparison.OrdinalIgnoreCase))
                throw Invalid($"View {viewId} is not a system view of '{table}'.");

            var attribute = await RetrieveColumnAsync(table, body.Column!, ct);
            var edited = AgentViewXml.AddColumn(
                view.GetAttributeValue<string>("layoutxml") ?? "",
                view.GetAttributeValue<string>("fetchxml") ?? "",
                attribute.LogicalName,
                width);
            if (edited.Problem is not null) return AgentResult<ColumnAddedDto>.Fail(edited.Problem);

            await client.UpdateAsync(
                new Entity("savedquery", viewId) { ["layoutxml"] = edited.Value.LayoutXml, ["fetchxml"] = edited.Value.FetchXml },
                ct);
            await AddToSolutionAsync(body.Solution, viewId, SavedQueryComponent, ct);
            return AgentResult<ColumnAddedDto>.Ok(new ColumnAddedDto(viewId, attribute.LogicalName));
        });

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<Entity> RetrieveAsync(string table, Guid id, string[] columns, CancellationToken ct)
    {
        try
        {
            return await client.RetrieveAsync(table, id, new ColumnSet(columns), ct);
        }
        catch (System.ServiceModel.FaultException<OrganizationServiceFault> ex)
            when (ex.Detail.ErrorCode == unchecked((int)0x80040217))
        {
            throw new AgentProblemException(AgentFaults.NotFound($"{table} {id} was not found."));
        }
    }

    private static Guid ParseGuid(string? value, string field) =>
        Guid.TryParse(value, out var id) ? id : throw Invalid($"{field} must be a GUID.");

    private static string ControlKind(AttributeMetadata attribute) => attribute.AttributeType switch
    {
        AttributeTypeCode.Memo => "memo",
        AttributeTypeCode.Integer or AttributeTypeCode.BigInt => "integer",
        AttributeTypeCode.Decimal or AttributeTypeCode.Double => "decimal",
        AttributeTypeCode.Money => "money",
        AttributeTypeCode.Boolean => "boolean",
        AttributeTypeCode.DateTime => "datetime",
        AttributeTypeCode.Picklist or AttributeTypeCode.State or AttributeTypeCode.Status => "choice",
        AttributeTypeCode.Lookup or AttributeTypeCode.Customer or AttributeTypeCode.Owner => "lookup",
        _ => "text",
    };
}
