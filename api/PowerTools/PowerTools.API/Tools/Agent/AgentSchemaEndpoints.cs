using PowerTools.API.Services;

namespace PowerTools.API.Tools.Agent;

/// <summary>Schema routes: tables, columns, relationships, choices, forms and views.</summary>
internal static class AgentSchemaEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        AgentEndpoints.Post<CreateTableBody, TableCreatedDto>(group, "/schema/tables", (c, b, ct) => new AgentSchemaService(c).CreateTableAsync(b, ct));
        AgentEndpoints.Post<CreateColumnBody, ColumnCreatedDto>(group, "/schema/columns", (c, b, ct) => new AgentSchemaService(c).CreateColumnAsync(b, ct));
        AgentEndpoints.Post<CreateLookupBody, LookupCreatedDto>(group, "/schema/lookups", (c, b, ct) => new AgentSchemaService(c).CreateLookupAsync(b, ct));
        AgentEndpoints.Post<CreateManyToManyBody, RelationshipCreatedDto>(group, "/schema/many-to-many", (c, b, ct) => new AgentSchemaService(c).CreateManyToManyAsync(b, ct));
        AgentEndpoints.Post<CreateChoiceBody, ChoiceCreatedDto>(group, "/schema/choices", (c, b, ct) => new AgentSchemaService(c).CreateChoiceAsync(b, ct));
        AgentEndpoints.Post<AddChoiceOptionBody, ChoiceOptionAddedDto>(group, "/schema/choices/options", (c, b, ct) => new AgentSchemaService(c).AddChoiceOptionAsync(b, ct));

        AgentEndpoints.Post<UpdateColumnBody, ColumnUpdatedDto>(group, "/schema/columns/update", (c, b, ct) => new AgentSchemaService(c).UpdateColumnAsync(b, ct));
        AgentEndpoints.Post<PublishBody, PublishedDto>(group, "/schema/publish", (c, b, ct) => new AgentSchemaService(c).PublishAsync(b, ct));

        AgentEndpoints.Post<AddFormColumnBody, ColumnAddedDto>(group, "/schema/forms/add-column", (c, b, ct) => new AgentSchemaService(c).AddColumnToFormAsync(b, ct));
        AgentEndpoints.Post<RemoveFormColumnBody, ColumnRemovedDto>(group, "/schema/forms/remove-column", (c, b, ct) => new AgentSchemaService(c).RemoveColumnFromFormAsync(b, ct));
        AgentEndpoints.Post<AddViewColumnBody, ColumnAddedDto>(group, "/schema/views/add-column", (c, b, ct) => new AgentSchemaService(c).AddColumnToViewAsync(b, ct));
        AgentEndpoints.Post<RemoveViewColumnBody, ViewColumnRemovedDto>(group, "/schema/views/remove-column", (c, b, ct) => new AgentSchemaService(c).RemoveColumnFromViewAsync(b, ct));

        AgentEndpoints.Post<DeleteColumnBody, DeletedDto>(group, "/schema/columns/delete", (c, b, ct) => new AgentSchemaService(c).DeleteColumnAsync(b, ct));
        AgentEndpoints.Post<DeleteTableBody, DeletedDto>(group, "/schema/tables/delete", (c, b, ct) => new AgentSchemaService(c).DeleteTableAsync(b, ct));
        AgentEndpoints.Post<DeleteChoiceBody, DeletedDto>(group, "/schema/choices/delete", (c, b, ct) => new AgentSchemaService(c).DeleteChoiceAsync(b, ct));
        AgentEndpoints.Post<DeleteRelationshipBody, DeletedDto>(group, "/schema/relationships/delete", (c, b, ct) => new AgentSchemaService(c).DeleteRelationshipAsync(b, ct));

        group.MapGet("/metadata/forms", async (string? table, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await new AgentSchemaService(AgentEndpoints.Client(ctx, factory)).ListFormsAsync(table, ct)));

        group.MapGet("/metadata/views", async (string? table, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await new AgentSchemaService(AgentEndpoints.Client(ctx, factory)).ListViewsAsync(table, ct)));

        group.MapGet("/metadata/tables/{table}/columns/{column}", async (string table, string column, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await new AgentSchemaService(AgentEndpoints.Client(ctx, factory)).GetColumnInfoAsync(table, column, ct)));

        group.MapGet("/metadata/choices/{name}", async (string name, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await new AgentSchemaService(AgentEndpoints.Client(ctx, factory)).GetChoiceAsync(name, ct)));
    }
}
