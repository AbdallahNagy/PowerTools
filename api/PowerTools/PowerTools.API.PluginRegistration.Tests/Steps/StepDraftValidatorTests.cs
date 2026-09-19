using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class StepDraftValidatorTests
{
    [Fact]
    public void Accepts_a_synchronous_update_step()
    {
        var problems = StepDraftValidator.Validate(ValidDraft(), "Update", isUpdate: false);
        Assert.Empty(problems);
    }

    [Fact]
    public void Rejects_async_non_post_stage()
    {
        var draft = ValidDraft() with { Mode = 1, Stage = 20 };
        var problems = StepDraftValidator.Validate(draft, "Update", isUpdate: false);
        Assert.Contains(problems, p => p.Code == "async_requires_post");
    }

    [Fact]
    public void Rejects_filtering_attributes_on_delete()
    {
        var draft = ValidDraft() with { FilteringAttributes = ["name"] };
        var problems = StepDraftValidator.Validate(draft, "Delete", isUpdate: false);
        Assert.Contains(problems, p => p.Field == "filteringAttributes");
    }

    [Fact]
    public void Replace_requires_a_secure_value()
    {
        var draft = ValidDraft() with
        {
            SecureConfigurationAction = "replace",
            SecureConfiguration = " ",
        };
        var problems = StepDraftValidator.Validate(draft, "Update", isUpdate: true);
        Assert.Contains(problems, p => p.Field == "secureConfiguration");
    }

    [Fact]
    public void Rejects_empty_filter_id()
    {
        var draft = ValidDraft() with { FilterId = Guid.Empty };
        var problems = StepDraftValidator.Validate(draft, "Update", isUpdate: false);
        Assert.Contains(problems, p => p.Field == "filterId" && p.Code == "invalid");
    }

    private static StepDraftDto ValidDraft() => new(
        "AccountPlugin: Update of account",
        Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
        Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
        null,
        40,
        0,
        1,
        0,
        false,
        [],
        null,
        null,
        null,
        "keep",
        null);
}
