using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class StepOptionQueriesTests
{
    [Fact]
    public void Messages_exclude_private_sdk_messages()
    {
        var query = StepOptionQueries.Messages();
        Assert.Equal("sdkmessage", query.EntityName);
        Assert.Equal(RegistrationOptionValues.CatalogPageSize, query.PageInfo.Count);
        var isPrivate = Assert.Single(query.Criteria.Conditions);
        Assert.Equal("isprivate", isPrivate.AttributeName);
        Assert.Equal(ConditionOperator.Equal, isPrivate.Operator);
        Assert.Equal(false, isPrivate.Values[0]);
    }

    [Fact]
    public void Filters_require_custom_processing_and_visibility()
    {
        var query = StepOptionQueries.Filters();
        Assert.Equal("sdkmessagefilter", query.EntityName);
        Assert.Contains(
            query.Criteria.Conditions,
            c => c.AttributeName == "iscustomprocessingstepallowed"
                && Equals(c.Values[0], true));
        Assert.Contains(
            query.Criteria.Conditions,
            c => c.AttributeName == "isvisible" && Equals(c.Values[0], true));
    }

    [Fact]
    public void Users_exclude_disabled_accounts()
    {
        var query = StepOptionQueries.Users();
        var disabled = Assert.Single(query.Criteria.Conditions);
        Assert.Equal("isdisabled", disabled.AttributeName);
        Assert.Equal(false, disabled.Values[0]);
    }
}
