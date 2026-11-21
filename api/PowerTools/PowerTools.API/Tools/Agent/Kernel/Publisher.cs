using System.Security;
using Microsoft.Crm.Sdk.Messages;

namespace PowerTools.API.Tools.Agent.Kernel;

/// <summary>Builds one PublishXml request for everything a call touched. Nothing else is published.</summary>
public static class Publisher
{
    public static PublishXmlRequest? Build(IEnumerable<PublishTarget> targets)
    {
        var distinct = targets.Distinct().ToList();
        if (distinct.Count == 0) return null;

        string Section(PublishKind kind, string container, string element) =>
            distinct.Where(t => t.Kind == kind) is var items && items.Any()
                ? $"<{container}>{string.Concat(items.Select(t => $"<{element}>{SecurityElement.Escape(t.Name)}</{element}>"))}</{container}>"
                : "";

        var xml = "<importexportxml>"
            + Section(PublishKind.Entity, "entities", "entity")
            + Section(PublishKind.OptionSet, "optionsets", "optionset")
            + Section(PublishKind.WebResource, "webresources", "webresource")
            + Section(PublishKind.Dashboard, "dashboards", "dashboard")
            + Section(PublishKind.SiteMap, "sitemaps", "sitemap")
            + Section(PublishKind.AppModule, "appmodules", "appmodule")
            + "</importexportxml>";
        return new PublishXmlRequest { ParameterXml = xml };
    }

    /// <summary>The names the result lists under "published".</summary>
    public static IReadOnlyList<string> Names(IEnumerable<PublishTarget> targets) =>
        targets.Distinct().Select(t => t.Name).ToList();
}
