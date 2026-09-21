using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class ImageDraftValidatorTests
{
    [Fact]
    public void Accepts_a_create_post_image()
    {
        var problems = ImageDraftValidator.Validate(Draft(1), "Create", 40, false);
        Assert.Empty(problems);
    }

    [Fact]
    public void Rejects_create_pre_image()
    {
        var problems = ImageDraftValidator.Validate(Draft(0), "Create", 40, false);
        Assert.Contains(problems, p => p.Code == "create_pre_image");
    }

    [Fact]
    public void Rejects_star_attributes()
    {
        var draft = Draft(1) with { Attributes = ["*"] };
        var problems = ImageDraftValidator.Validate(draft, "Update", 40, false);
        Assert.Contains(problems, p => p.Code == "all_columns");
    }

    [Fact]
    public void Rejects_unsupported_messages()
    {
        var problems = ImageDraftValidator.Validate(Draft(0), "Retrieve", 20, false);
        Assert.Contains(problems, p => p.Code == "image_unsupported_message");
    }

    private static ImageDraftDto Draft(int imageType) => new(
        Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
        "PreImage",
        "Target",
        imageType,
        ["name"]);
}
