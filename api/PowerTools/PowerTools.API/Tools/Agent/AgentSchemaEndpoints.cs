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

        group.MapGet("/metadata/choices/{name}", async (string name, HttpContext ctx, DataverseClientFactory factory, CancellationToken ct) =>
            AgentEndpoints.ToHttp(await new AgentSchemaService(AgentEndpoints.Client(ctx, factory)).GetChoiceAsync(name, ct)));
    }
}
