using PowerTools.API.Tools.Agent;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentPublishersTests
{
    private static Task<AgentResult<PublisherInfo>> Resolve(FakeAgentClient client, string? solution, string? publisher) =>
        AgentPublishers.ResolveAsync(client, solution, publisher, CancellationToken.None);

    [Fact]
    public async Task Neither_solution_nor_publisher_requires_one_and_lists_publishers_without_microsoft()
    {
        var result = await Resolve(Data.Client(), null, null);

        Assert.Equal("PublisherRequired", result.Problem!.Code);
        Assert.Contains("Publishers: contoso (new), fabrikam (fab)", result.Problem.Message);
        Assert.DoesNotContain("Microsoft", result.Problem.Message);
    }

    [Fact]
    public async Task Blank_values_count_as_missing()
    {
        var result = await Resolve(Data.Client(), "  ", "");
        Assert.Equal("PublisherRequired", result.Problem!.Code);
    }

    [Fact]
    public async Task A_solution_gives_its_publisher()
    {
        var result = await Resolve(Data.Client(), "Core", null);

        Assert.Null(result.Problem);
        Assert.Equal("contoso", result.Value!.UniqueName);
        Assert.Equal("new", result.Value.Prefix);
        Assert.Equal(10000, result.Value.OptionValuePrefix);
    }

    [Fact]
    public async Task An_unknown_solution_is_not_found()
    {
        var result = await Resolve(Data.Client(), "Nope", null);
        Assert.Equal("NotFound", result.Problem!.Code);
    }

    [Fact]
    public async Task A_managed_solution_is_refused()
    {
        var result = await Resolve(Data.Client(), "Managed1", null);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    [Theory]
    [InlineData("fabrikam")]
    [InlineData("FABRIKAM")]
    [InlineData("fab")]
    [InlineData("Fab")]
    public async Task A_publisher_matches_by_unique_name_or_prefix_ignoring_case(string publisher)
    {
        var result = await Resolve(Data.Client(), null, publisher);

        Assert.Null(result.Problem);
        Assert.Equal("fabrikam", result.Value!.UniqueName);
    }

    [Fact]
    public async Task An_unknown_publisher_is_not_found_and_lists_the_choices()
    {
        var result = await Resolve(Data.Client(), null, "zzz");

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Contains("contoso (new)", result.Problem.Message);
    }

    [Fact]
    public async Task A_solutions_publisher_wins_when_both_are_given_and_they_match()
    {
        var result = await Resolve(Data.Client(), "Core", "new");

        Assert.Null(result.Problem);
        Assert.Equal("contoso", result.Value!.UniqueName);
    }

    [Fact]
    public async Task A_solution_and_a_publisher_that_disagree_are_an_invalid_request()
    {
        var result = await Resolve(Data.Client(), "Core", "fabrikam");

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("contoso", result.Problem.Message);
        Assert.Contains("fabrikam", result.Problem.Message);
    }

    [Fact]
    public async Task A_publisher_without_a_prefix_cannot_own_components()
    {
        var result = await Resolve(Data.Client(), null, "MicrosoftCorporation");
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    [Fact]
    public void Schema_names_must_start_with_the_prefix_and_an_underscore()
    {
        var contoso = new PublisherInfo(Data.ContosoPublisherId, "contoso", "new", 10000);

        Assert.Null(AgentPublishers.CheckSchemaName("new_rating", contoso));
        Assert.Null(AgentPublishers.CheckSchemaName("NEW_Rating", contoso));
        Assert.Equal("InvalidRequest", AgentPublishers.CheckSchemaName("fab_rating", contoso)!.Code);
        Assert.Equal("InvalidRequest", AgentPublishers.CheckSchemaName("newrating", contoso)!.Code);
        Assert.Equal("InvalidRequest", AgentPublishers.CheckSchemaName("new_", contoso)!.Code);
    }

    [Fact]
    public async Task The_publisher_list_hides_microsoft()
    {
        var all = await AgentPublishers.ListAsync(Data.Client(), CancellationToken.None);
        var dtos = AgentPublishers.ToDtos(all);

        Assert.Equal(["contoso", "fabrikam"], dtos.Select(d => d.UniqueName));
        Assert.Equal("Contoso", dtos[0].FriendlyName);
    }
}
