using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Catalog;

public sealed class CatalogQueriesTests
{
    [Fact]
    public void Assemblies_exclude_compiled_workflows_and_content()
    {
        var query = CatalogQueries.Assemblies();

        Assert.Equal("pluginassembly", query.EntityName);
        Assert.Equal(RegistrationOptionValues.CatalogPageSize, query.PageInfo.Count);
        Assert.DoesNotContain("content", query.ColumnSet.Columns);
        Assert.DoesNotContain("secureconfig", query.ColumnSet.Columns);

        var name = Assert.Single(query.Criteria.Conditions, c => c.AttributeName == "name");
        Assert.Equal(ConditionOperator.NotLike, name.Operator);
        Assert.Equal("CompiledWorkflow%", name.Values[0]);
    }

    [Fact]
    public void Types_exclude_compiled_workflow_typenames()
    {
        var query = CatalogQueries.Types();

        Assert.Equal("plugintype", query.EntityName);
        Assert.Equal(RegistrationOptionValues.CatalogPageSize, query.PageInfo.Count);
        Assert.DoesNotContain("content", query.ColumnSet.Columns);

        var typeName = Assert.Single(query.Criteria.Conditions, c => c.AttributeName == "typename");
        Assert.Equal(ConditionOperator.NotLike, typeName.Operator);
        Assert.Equal("Compiled.Workflow%", typeName.Values[0]);
    }

    [Fact]
    public void Steps_filter_supported_stages_and_join_message_filter_and_user()
    {
        var query = CatalogQueries.Steps();

        Assert.Equal("sdkmessageprocessingstep", query.EntityName);
        Assert.Equal(RegistrationOptionValues.CatalogPageSize, query.PageInfo.Count);
        Assert.DoesNotContain("content", query.ColumnSet.Columns);
        Assert.DoesNotContain("secureconfig", query.ColumnSet.Columns);
        Assert.Contains("sdkmessageprocessingstepsecureconfigid", query.ColumnSet.Columns);

        var stage = Assert.Single(query.Criteria.Conditions, c => c.AttributeName == "stage");
        Assert.Equal(ConditionOperator.In, stage.Operator);
        Assert.Equal(
            RegistrationOptionValues.CatalogStages.Cast<object>(),
            stage.Values.Cast<object>());

        Assert.Contains(query.LinkEntities, link =>
            link.LinkToEntityName == "sdkmessage"
            && link.JoinOperator == JoinOperator.LeftOuter
            && link.Columns.Columns.Contains("name"));
        Assert.Contains(query.LinkEntities, link =>
            link.LinkToEntityName == "sdkmessagefilter"
            && link.JoinOperator == JoinOperator.LeftOuter);
        Assert.Contains(query.LinkEntities, link =>
            link.LinkToEntityName == "systemuser"
            && link.LinkFromAttributeName == "impersonatinguserid"
            && link.JoinOperator == JoinOperator.LeftOuter);

        foreach (var link in query.LinkEntities)
            Assert.DoesNotContain("secureconfig", link.Columns.Columns);
    }

    [Fact]
    public void Images_select_identity_without_secrets()
    {
        var query = CatalogQueries.Images();

        Assert.Equal("sdkmessageprocessingstepimage", query.EntityName);
        Assert.Equal(RegistrationOptionValues.CatalogPageSize, query.PageInfo.Count);
        Assert.DoesNotContain("content", query.ColumnSet.Columns);
        Assert.DoesNotContain("secureconfig", query.ColumnSet.Columns);
        Assert.Contains("attributes", query.ColumnSet.Columns);
        Assert.Contains("messagepropertyname", query.ColumnSet.Columns);
    }
}
