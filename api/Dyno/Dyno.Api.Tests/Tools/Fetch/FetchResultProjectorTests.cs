using Microsoft.Xrm.Sdk;
using Dyno.Api.Tools.Fetch;
using Xunit;

namespace Dyno.Api.Tests.Tools.Fetch;

public sealed class FetchResultProjectorTests
{
    private static readonly Guid AccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static Entity Account()
    {
        var account = new Entity("account", AccountId);
        account["name"] = "Contoso";
        account["statecode"] = new OptionSetValue(0);
        account.FormattedValues["statecode"] = "Active";
        account["revenue"] = new Money(10.5m);
        account.FormattedValues["revenue"] = "$10.50";
        account["ownerid"] = new EntityReference("systemuser", OwnerId) { Name = "Ada" };
        account.FormattedValues["ownerid"] = "Ada Lovelace";
        account["new_choices"] = new OptionSetValueCollection { new OptionSetValue(1), new OptionSetValue(4) };
        account.FormattedValues["new_choices"] = "One, Four";
        account["parent.name"] = new AliasedValue("account", "name", "Parent Co");
        account["donotemail"] = false;
        account.FormattedValues["donotemail"] = "No";
        return account;
    }

    [Fact]
    public void Raw_mode_returns_underlying_values_with_sorted_columns()
    {
        var projection = FetchResultProjector.Project([Account()], FetchValueModes.Raw);

        Assert.Equal(
            ["donotemail", "name", "new_choices", "ownerid", "parent.name", "revenue", "statecode"],
            projection.Columns);
        var record = projection.Records[0];
        Assert.False(record.ContainsKey("id"));
        Assert.Equal("Contoso", (string)record["name"]!);
        Assert.False((bool)record["donotemail"]!);
        Assert.Equal(OwnerId.ToString(), (string)record["ownerid"]!);
        Assert.Equal("1,4", (string)record["new_choices"]!);
        Assert.Equal("Parent Co", (string)record["parent.name"]!);
        Assert.Equal(10.5m, (decimal)record["revenue"]!);
        Assert.Equal(0, (int)record["statecode"]!);
        Assert.Equal("lookup", projection.ColumnTypes["ownerid"]);
    }

    [Fact]
    public void Formatted_mode_prefers_formatted_values()
    {
        var record = FetchResultProjector.Project([Account()], FetchValueModes.Formatted).Records[0];

        Assert.False(record.ContainsKey("id"));
        Assert.Equal("No", (string)record["donotemail"]!);
        Assert.Equal("Ada Lovelace", (string)record["ownerid"]!);
        Assert.Equal("One, Four", (string)record["new_choices"]!);
        Assert.Equal("$10.50", (string)record["revenue"]!);
        Assert.Equal("Active", (string)record["statecode"]!);
        Assert.Equal("Parent Co", (string)record["parent.name"]!);
    }

    [Fact]
    public void Builder_mode_adds_the_record_id_and_expands_lookups()
    {
        var record = FetchResultProjector.Project([Account()], FetchValueModes.Builder).Records[0];

        Assert.Equal(AccountId.ToString(), (string)record["id"]!);
        Assert.Equal("Active", (string)record["statecode"]!);
        Assert.Equal("No", (string)record["donotemail"]!);
        Assert.Equal(OwnerId.ToString(), ReadProperty(record["ownerid"]!, "id"));
        Assert.Equal("Ada", ReadProperty(record["ownerid"]!, "name"));
        Assert.Equal("systemuser", ReadProperty(record["ownerid"]!, "logicalName"));
    }

    [Fact]
    public void No_records_project_to_no_columns()
    {
        var projection = FetchResultProjector.Project(Array.Empty<Entity>(), FetchValueModes.Formatted);

        Assert.Empty(projection.Records);
        Assert.Empty(projection.Columns);
    }

    // Builder lookups are anonymous objects, so read them by name.
    private static string? ReadProperty(object value, string propertyName)
    {
        var property = value.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        return property.GetValue(value)?.ToString();
    }
}
