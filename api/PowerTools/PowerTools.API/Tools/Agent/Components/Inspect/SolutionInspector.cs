using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Plugins;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;
using PowerTools.API.Tools.PluginRegistration.Validation;
using PowerTools.API.Tools.SolutionLayers;

namespace PowerTools.API.Tools.Agent.Components.Inspect;

/// <summary>
/// inspect_solution: solutions and their components and layers, publishers, environment variables, connection
/// references, plug-in assemblies and steps, Custom APIs, classic processes and cloud flows. A plug-in step comes back
/// in the shape plugin_step_apply takes.
/// </summary>
public sealed class SolutionInspector(IAgentClient client, Capabilities capabilities, ISolutionLayersCache layersCache, string connectionKey)
{
    public static readonly string[] Kinds =
        ["solution", "solutioncomponents", "layers", "publisher", "envvar", "connectionreference", "pluginassembly", "pluginstep", "customapi", "process", "flow"];

    private const int SecretType = 100000005;

    public async Task<AgentResult<object>> InspectAsync(InspectBody body, CancellationToken ct)
    {
        try
        {
            object result = body.Kind switch
            {
                "solution" => await SolutionAsync(body, ct),
                "solutioncomponents" => await ComponentsAsync(body, ct),
                "layers" => await LayersAsync(body, ct),
                "publisher" => await Rows(body, "publisher", "publisher", "uniquename", ["uniquename", "friendlyname", "customizationprefix", "customizationoptionvalueprefix", "description"], ct),
                "envvar" => await EnvVarsAsync(body, ct),
                "connectionreference" => Feature("connectionreference")
                    ? await Rows(body, "connectionreference", "connectionreference", "connectionreferencelogicalname",
                        ["connectionreferencelogicalname", "connectionreferencedisplayname", "connectorid", "connectionid", "ismanaged", "description"], ct)
                    : throw NotSupported("This environment has no connection references (they are online only)."),
                "pluginassembly" => await AssemblyAsync(body, ct),
                "pluginstep" => await StepAsync(body, ct),
                "customapi" => Feature("customapi")
                    ? await CustomApiAsync(body, ct)
                    : throw NotSupported("This environment has no Custom APIs. Use a classic action (process_apply) instead."),
                "process" => await RowsWhere(body, "process", "workflow", "name", ["name", "category", "mode", "primaryentity", "statecode", "ismanaged", "description"],
                    q => { q.Criteria.AddCondition("type", ConditionOperator.Equal, 1); q.Criteria.AddCondition("category", ConditionOperator.NotEqual, ComponentKinds.FlowCategory); }, ct),
                "flow" => await FlowAsync(body, ct),
                _ => throw Invalid($"kind must be one of: {string.Join(", ", Kinds)}."),
            };
            return AgentResult<object>.Ok(result);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return AgentResult<object>.Fail(AgentFaults.From(ex));
        }
    }

    private bool Feature(string table) => capabilities.HasTable(table);

    private Task<object> Rows(InspectBody body, string kind, string table, string nameColumn, string[] columns, CancellationToken ct) =>
        RowsWhere(body, kind, table, nameColumn, columns, null, ct);

    private async Task<object> RowsWhere(InspectBody body, string kind, string table, string nameColumn, string[] columns, Action<QueryExpression>? narrow, CancellationToken ct)
    {
        if (body.Name is null) return await RowInspect.ListAsync(client, kind, table, nameColumn, columns, narrow, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, table, nameColumn, body.Name, columns, narrow, ct) ?? throw RowInspect.NotFound($"{kind} {body.Name}");
        return RowInspect.Plain(row, columns);
    }

    /// <summary>Cloud flows: a list, or one flow in the shape flow_apply takes.</summary>
    private async Task<object> FlowAsync(InspectBody body, CancellationToken ct)
    {
        Action<QueryExpression> flows = q =>
        {
            q.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
            q.Criteria.AddCondition("category", ConditionOperator.Equal, ComponentKinds.FlowCategory);
        };
        if (body.Name is null) return await RowsWhere(body, "flow", "workflow", "name", ["name", "statecode", "ismanaged", "description", "modifiedon"], flows, ct);
        var row = await RowInspect.FindAsync(client, "workflow", "name", body.Name, ["name", "statecode", "ismanaged", "description", "clientdata"], flows, ct)
            ?? throw RowInspect.NotFound($"flow {body.Name}");
        return Flows.FlowPlanner.Describe(row);
    }

    private async Task<object> SolutionAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["uniquename", "friendlyname", "version", "ismanaged", "publisherid", "description", "installedon"];
        if (body.Name is null)
            return await RowInspect.ListAsync(client, "solution", "solution", "uniquename", columns,
                q => { q.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true); q.Criteria.AddCondition("parentsolutionid", ConditionOperator.Null); }, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, "solution", "uniquename", body.Name, columns, null, ct) ?? throw RowInspect.NotFound($"Solution {body.Name}");
        var result = RowInspect.Plain(row, columns);
        var patches = new QueryExpression("solution") { NoLock = true, ColumnSet = new ColumnSet("uniquename", "version") };
        patches.Criteria.AddCondition("parentsolutionid", ConditionOperator.Equal, row.Id);
        result["patches"] = (await client.RetrieveMultipleAsync(patches, ct)).Entities.Select(p => RowInspect.Plain(p, ["uniquename", "version"])).ToList();
        return result;
    }

    private async Task<object> ComponentsAsync(InspectBody body, CancellationToken ct)
    {
        var name = body.Name ?? throw Invalid("solutioncomponents needs name (the solution).");
        var solution = await Solutions.SolutionPlanner.FindSolutionAsync(client, name, ct) ?? throw RowInspect.NotFound($"Solution {name}");
        var limit = RowInspect.Top(body.Top);
        var query = new QueryExpression("solutioncomponent") { NoLock = true, TopCount = limit + 1, ColumnSet = new ColumnSet("objectid", "componenttype", "rootcomponentbehavior") };
        query.Criteria.AddCondition("solutionid", ConditionOperator.Equal, solution.Id);
        query.Orders.Add(new OrderExpression("componenttype", OrderType.Ascending));
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        var items = rows.Take(limit).Select(row => (object)new Dictionary<string, object?>
        {
            ["componentType"] = RowInspect.Value(row.GetAttributeValue<object>("componenttype")),
            ["typeName"] = ComponentLayerNames.ClassicLayerName(row.GetAttributeValue<OptionSetValue>("componenttype")?.Value ?? row.GetAttributeValue<int?>("componenttype") ?? 0),
            ["objectId"] = row.GetAttributeValue<Guid?>("objectid")?.ToString("D"),
        }).ToList();
        return new InspectListDto("solutioncomponents", items.Count, items, rows.Count > limit);
    }

    private async Task<object> LayersAsync(InspectBody body, CancellationToken ct)
    {
        if (!capabilities.HasTable("msdyn_componentlayer")) throw NotSupported("This environment does not expose solution layers.");
        var kind = body.ComponentKind ?? throw Invalid("layers needs componentKind and name.");
        var found = await ComponentKinds.FindAsync(client, kind, body.Name ?? "", body.Table, ct) ?? throw RowInspect.NotFound($"{ComponentKinds.Name(kind)} {body.Name}");
        var result = await new SolutionLayersService(client, layersCache, connectionKey).GetLayersAsync(found.ComponentType, found.Id.ToString("D"), ct);
        if (result.Problem is not null) throw new AgentProblemException(AgentFaults.FromExternal(result.Problem.Status, result.Problem.Code, result.Problem.Message));
        return result.Value!;
    }

    private async Task<object> EnvVarsAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["schemaname", "displayname", "type", "defaultvalue", "description", "ismanaged"];
        var list = body.Name is null
            ? (await RowInspect.ListAsync(client, "envvar", "environmentvariabledefinition", "schemaname", columns, null, body.Filter, body.Top, ct)).Items.Cast<Dictionary<string, object?>>().ToList()
            : [RowInspect.Plain(await RowInspect.FindAsync(client, "environmentvariabledefinition", "schemaname", body.Name, columns, null, ct)
                ?? throw RowInspect.NotFound($"Environment variable {body.Name}"), columns)];
        var values = (await client.RetrieveMultipleAsync(new QueryExpression("environmentvariablevalue") { NoLock = true, ColumnSet = new ColumnSet("value", "environmentvariabledefinitionid") }, ct)).Entities;
        foreach (var item in list)
        {
            var secret = item.GetValueOrDefault("type") is SecretType;
            var value = values.FirstOrDefault(v => v.GetAttributeValue<EntityReference>("environmentvariabledefinitionid")?.Id.ToString("D") == (string?)item["id"]);
            item["value"] = secret ? null : value?.GetAttributeValue<string>("value");
            if (secret) item["defaultvalue"] = null;
        }

        return body.Name is null ? new InspectListDto("envvar", list.Count, list.Cast<object>().ToList(), false) : list[0];
    }

    private async Task<object> AssemblyAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["name", "version", "isolationmode", "sourcetype", "ismanaged", "publickeytoken"];
        if (body.Name is null) return await RowInspect.ListAsync(client, "pluginassembly", "pluginassembly", "name", columns, null, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, "pluginassembly", "name", body.Name, columns, null, ct) ?? throw RowInspect.NotFound($"Assembly {body.Name}");
        var result = RowInspect.Plain(row, columns);
        var types = new QueryExpression("plugintype") { NoLock = true, ColumnSet = new ColumnSet("typename", "isworkflowactivity") };
        types.Criteria.AddCondition("pluginassemblyid", ConditionOperator.Equal, row.Id);
        result["types"] = (await client.RetrieveMultipleAsync(types, ct)).Entities.Select(t => RowInspect.Plain(t, ["typename", "isworkflowactivity"])).ToList();
        return result;
    }

    private async Task<object> StepAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["name", "stage", "mode", "rank", "statecode", "sdkmessageid", "sdkmessagefilterid", "eventhandler", "filteringattributes", "configuration", "description", "asyncautodelete", "ismanaged"];
        if (body.Name is null) return await RowInspect.ListAsync(client, "pluginstep", "sdkmessageprocessingstep", "name", columns, null, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, "sdkmessageprocessingstep", "name", body.Name, columns, null, ct) ?? throw RowInspect.NotFound($"Step {body.Name}");
        var handler = row.GetAttributeValue<EntityReference>("eventhandler");
        string? typeName = null, endpoint = null;
        if (handler is not null)
        {
            var handlerRow = await client.RetrieveAsync(handler.LogicalName, handler.Id, new ColumnSet(handler.LogicalName == "plugintype" ? "typename" : "name"), ct);
            if (handler.LogicalName == "plugintype") typeName = handlerRow.GetAttributeValue<string>("typename");
            else endpoint = handlerRow.GetAttributeValue<string>("name");
        }

        var message = row.GetAttributeValue<EntityReference>("sdkmessageid") is { } m ? (await client.RetrieveAsync("sdkmessage", m.Id, new ColumnSet("name"), ct)).GetAttributeValue<string>("name") : "";
        var table = row.GetAttributeValue<EntityReference>("sdkmessagefilterid") is { } f
            ? (await client.RetrieveAsync("sdkmessagefilter", f.Id, new ColumnSet("primaryobjecttypecode"), ct)).GetAttributeValue<string>("primaryobjecttypecode")
            : null;
        var images = new QueryExpression("sdkmessageprocessingstepimage") { NoLock = true, ColumnSet = new ColumnSet("name", "entityalias", "imagetype", "attributes") };
        images.Criteria.AddCondition("sdkmessageprocessingstepid", ConditionOperator.Equal, row.Id);
        var async = row.GetAttributeValue<OptionSetValue>("mode")?.Value == RegistrationOptionValues.ModeAsynchronous;
        return new StepDefinition
        {
            Name = row.GetAttributeValue<string>("name") ?? body.Name,
            PluginType = typeName,
            ServiceEndpoint = endpoint,
            Message = message ?? "",
            Table = table is null or "none" ? null : table,
            Stage = row.GetAttributeValue<OptionSetValue>("stage")?.Value switch
            {
                RegistrationOptionValues.StagePreValidation => StepStage.PreValidation,
                RegistrationOptionValues.StagePreOperation => StepStage.PreOperation,
                _ => StepStage.PostOperation,
            },
            Mode = async ? StepMode.Async : StepMode.Sync,
            Rank = row.GetAttributeValue<int?>("rank"),
            FilteringAttributes = row.GetAttributeValue<string>("filteringattributes") is { Length: > 0 } fa ? fa.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList() : null,
            Configuration = row.GetAttributeValue<string>("configuration"),
            Description = row.GetAttributeValue<string>("description"),
            AsyncAutoDelete = async ? row.GetAttributeValue<bool?>("asyncautodelete") : null,
            Enabled = row.GetAttributeValue<OptionSetValue>("statecode")?.Value != RegistrationOptionValues.StateDisabled,
            Images = (await client.RetrieveMultipleAsync(images, ct)).Entities.Select(i => new ImageDefinition
            {
                Name = i.GetAttributeValue<string>("name") ?? "",
                Alias = i.GetAttributeValue<string>("entityalias"),
                Type = i.GetAttributeValue<OptionSetValue>("imagetype")?.Value switch { 0 => ImageType.Pre, 1 => ImageType.Post, _ => ImageType.Both },
                Attributes = i.GetAttributeValue<string>("attributes") is { Length: > 0 } a ? a.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList() : null,
            }).ToList(),
        };
    }

    private async Task<object> CustomApiAsync(InspectBody body, CancellationToken ct)
    {
        string[] columns = ["uniquename", "name", "displayname", "bindingtype", "boundentitylogicalname", "isfunction", "isprivate", "allowedcustomprocessingsteptype", "plugintypeid", "ismanaged", "description"];
        if (body.Name is null) return await RowInspect.ListAsync(client, "customapi", "customapi", "uniquename", columns, null, body.Filter, body.Top, ct);
        var row = await RowInspect.FindAsync(client, "customapi", "uniquename", body.Name, columns, null, ct) ?? throw RowInspect.NotFound($"Custom API {body.Name}");
        var result = RowInspect.Plain(row, columns);
        string[] parameter = ["uniquename", "name", "type", "isoptional", "logicalentityname", "description"];
        string[] property = ["uniquename", "name", "type", "logicalentityname", "description"];
        foreach (var (table, key, fields) in new[] { ("customapirequestparameter", "requestParameters", parameter), ("customapiresponseproperty", "responseProperties", property) })
        {
            var query = new QueryExpression(table) { NoLock = true, ColumnSet = new ColumnSet(fields) };
            query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, row.Id);
            result[key] = (await client.RetrieveMultipleAsync(query, ct)).Entities.Select(p => RowInspect.Plain(p, fields)).ToList();
        }

        return result;
    }

    private static AgentProblemException NotSupported(string message) =>
        new(new AgentProblem(StatusCodes.Status400BadRequest, ApplyResult.NotSupportedCode, message));

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
