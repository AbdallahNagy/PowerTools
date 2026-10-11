using System.Globalization;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.RecycleBin;

/// <summary>
/// FetchXML for the recycle bin settings, deleted record lists and the audit log. Built with
/// <see cref="XElement"/> so table names, ids and paging cookies are always escaped.
/// </summary>
public static class RecycleBinQueries
{
    public const string ConfigTable = "recyclebinconfig";
    public const string OrganizationConfigName = "organization";
    public const string AuditTable = "audit";
    public const int DeleteOperation = 3;
    public const int MaxPageSize = 250;
    public const int MaxUsers = 5000;
    public const int UserSearchTop = 50;

    /// <summary>The environment-wide recycle bin row; it exists only while the feature is on.</summary>
    public static FetchExpression OrganizationConfig() =>
        Fetch(new XElement("fetch",
            new XAttribute("top", 1),
            Entity(ConfigTable,
                Attribute("cleanupintervalindays"),
                Attribute("statecode"),
                Filter(Condition("name", "eq", OrganizationConfigName)))));

    /// <summary>Tables whose recycle bin is ready, with each table's own retention (-1 = organization value).</summary>
    public static FetchExpression ReadyTables() =>
        Fetch(new XElement("fetch",
            Entity(ConfigTable,
                Attribute("cleanupintervalindays"),
                Filter(
                    Condition("statecode", "eq", "0"),
                    Condition("isreadyforrecyclebin", "eq", "1")),
                new XElement("link-entity",
                    new XAttribute("name", "entity"),
                    new XAttribute("from", "entityid"),
                    new XAttribute("to", "extensionofrecordid"),
                    new XAttribute("link-type", "inner"),
                    new XAttribute("alias", "table"),
                    Attribute("logicalname")))));

    public static QueryExpression OrganizationAudit(bool withRetention)
    {
        var query = new QueryExpression("organization") { TopCount = 1 };
        query.ColumnSet = withRetention
            ? new ColumnSet("isauditenabled", "auditretentionperiodv2")
            : new ColumnSet("isauditenabled");
        return query;
    }

    public static FetchExpression Users(string? search)
    {
        var fetch = new XElement("fetch",
            new XAttribute("top", string.IsNullOrWhiteSpace(search) ? MaxUsers : UserSearchTop),
            Entity("systemuser",
                Attribute("systemuserid"),
                Attribute("fullname"),
                Attribute("isdisabled"),
                Order("fullname", false),
                string.IsNullOrWhiteSpace(search)
                    ? null
                    : Filter(Condition("fullname", "like", $"%{EscapeLike(search.Trim())}%"))));
        return Fetch(fetch);
    }

    /// <summary>One page of a table's recycle bin, ordered by primary id so the paging cookie stays stable.</summary>
    public static FetchExpression BinPage(
        string table,
        string primaryId,
        string? primaryName,
        int pageSize,
        int page,
        string? pagingCookie) =>
        Fetch(new XElement("fetch",
            new XAttribute("datasource", "bin"),
            PagingAttributes(pageSize, page, pagingCookie),
            Entity(table,
                Attribute(primaryId),
                primaryName is null ? null : Attribute(primaryName),
                Order(primaryId, false))));

    /// <summary>A single recycle bin row with every column.</summary>
    public static FetchExpression BinRecord(string table, string primaryId, Guid id) =>
        Fetch(new XElement("fetch",
            new XAttribute("datasource", "bin"),
            Entity(table,
                new XElement("all-attributes"),
                Filter(Condition(primaryId, "eq", id.ToString("D"))))));

    /// <summary>Whether a record id is in the recycle bin.</summary>
    public static FetchExpression BinContains(string table, string primaryId, Guid id) =>
        Fetch(new XElement("fetch",
            new XAttribute("datasource", "bin"),
            new XAttribute("top", 1),
            Entity(table,
                Attribute(primaryId),
                Filter(Condition(primaryId, "eq", id.ToString("D"))))));

    /// <summary>Which of the given record ids are in the recycle bin.</summary>
    public static FetchExpression BinContainsAny(string table, string primaryId, IReadOnlyCollection<Guid> ids) =>
        Fetch(new XElement("fetch",
            new XAttribute("datasource", "bin"),
            Entity(table,
                Attribute(primaryId),
                Filter(new XElement("condition",
                    new XAttribute("attribute", primaryId),
                    new XAttribute("operator", "in"),
                    ids.Select(id => new XElement("value", id.ToString("D"))))))));

    /// <summary>Whether a record with this id exists in the table (not the recycle bin).</summary>
    public static QueryExpression LiveRecord(string table, string primaryId, Guid id)
    {
        var query = new QueryExpression(table) { TopCount = 1, ColumnSet = new ColumnSet(primaryId) };
        query.Criteria.AddCondition(primaryId, ConditionOperator.Equal, id);
        return query;
    }

    /// <summary>
    /// Delete audit entries for one table, newest first. Dates carry an explicit Z so the bounds are UTC
    /// whatever the calling user's Dataverse time zone. The table is matched by logical name.
    /// </summary>
    public static FetchExpression AuditDeletes(
        string table,
        DateTime fromUtc,
        DateTime toUtc,
        Guid? userId,
        int pageSize,
        int page,
        string? pagingCookie) =>
        Fetch(new XElement("fetch",
            PagingAttributes(pageSize, page, pagingCookie),
            Entity(AuditTable,
                Attribute("auditid"),
                Attribute("objectid"),
                Attribute("userid"),
                Attribute("callinguserid"),
                Attribute("createdon"),
                Filter(
                    Condition("operation", "eq", DeleteOperation.ToString(CultureInfo.InvariantCulture)),
                    Condition("objecttypecode", "eq", table),
                    Condition("createdon", "ge", Utc(fromUtc)),
                    Condition("createdon", "lt", Utc(toUtc)),
                    userId is { } user ? Condition("userid", "eq", user.ToString("D")) : null),
                Order("createdon", true),
                Order("auditid", true))));

    /// <summary>Delete audit entries for the given record ids, newest first (used to date recycle bin rows).</summary>
    public static FetchExpression AuditDeletesFor(string table, IReadOnlyCollection<Guid> ids) =>
        Fetch(new XElement("fetch",
            Entity(AuditTable,
                Attribute("objectid"),
                Attribute("userid"),
                Attribute("callinguserid"),
                Attribute("createdon"),
                Filter(
                    Condition("operation", "eq", DeleteOperation.ToString(CultureInfo.InvariantCulture)),
                    Condition("objecttypecode", "eq", table),
                    new XElement("condition",
                        new XAttribute("attribute", "objectid"),
                        new XAttribute("operator", "in"),
                        ids.Select(id => new XElement("value", id.ToString("D"))))),
                Order("createdon", true))));

    public static string Utc(DateTime value) =>
        DateTime.SpecifyKind(value.ToUniversalTime(), DateTimeKind.Utc)
            .ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    private static FetchExpression Fetch(XElement fetch) => new(fetch.ToString(SaveOptions.DisableFormatting));

    private static IEnumerable<XAttribute> PagingAttributes(int pageSize, int page, string? pagingCookie)
    {
        yield return new XAttribute("count", pageSize);
        yield return new XAttribute("page", page);
        if (!string.IsNullOrEmpty(pagingCookie))
            yield return new XAttribute("paging-cookie", pagingCookie);
    }

    private static XElement Entity(string name, params object?[] content) =>
        new("entity", new XAttribute("name", name), content.Where(item => item is not null));

    private static XElement Attribute(string name) => new("attribute", new XAttribute("name", name));

    private static XElement Order(string attribute, bool descending) =>
        new("order", new XAttribute("attribute", attribute), new XAttribute("descending", descending ? "true" : "false"));

    private static XElement Filter(params XElement?[] conditions) =>
        new("filter", new XAttribute("type", "and"), conditions.Where(item => item is not null));

    private static XElement Condition(string attribute, string op, string value) =>
        new("condition",
            new XAttribute("attribute", attribute),
            new XAttribute("operator", op),
            new XAttribute("value", value));

    private static string EscapeLike(string value) =>
        value.Replace("[", "[[]", StringComparison.Ordinal)
            .Replace("%", "[%]", StringComparison.Ordinal)
            .Replace("_", "[_]", StringComparison.Ordinal);
}
