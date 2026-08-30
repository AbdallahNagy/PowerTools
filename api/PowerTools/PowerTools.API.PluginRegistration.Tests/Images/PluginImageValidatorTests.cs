using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class PluginImageValidatorTests
{
    [Fact]
    public void Normalizes_and_orders_explicit_table_attributes()
    {
        var result = new PluginImageValidator().Validate(Draft(attributes: [" Name ", "accountnumber", "name"]), State());

        Assert.Empty(result.Blockers);
        Assert.Equal(["accountnumber", "name"], result.Draft.Attributes);
    }

    [Theory]
    [InlineData("Create", 0)]
    [InlineData("Delete", 1)]
    [InlineData("Update", 0)]
    [InlineData("Update", 1)]
    [InlineData("Update", 2)]
    public void Rejects_image_types_not_available_for_message(string message, int invalidType)
    {
        var valid = message switch { "Create" => 1, "Delete" => 0, _ => invalidType };
        var result = new PluginImageValidator().Validate(Draft(imageType: valid), State(message: message));
        Assert.DoesNotContain(result.Blockers, item => item.Code == "invalidImageType");

        var rejected = new PluginImageValidator().Validate(Draft(imageType: invalidType), State(message: message));
        if (valid != invalidType) Assert.Contains(rejected.Blockers, item => item.Code == "invalidImageType");
    }

    [Fact]
    public void Rejects_all_columns_empty_columns_invalid_attributes_and_duplicate_alias()
    {
        var validator = new PluginImageValidator();
        Assert.Contains(validator.Validate(Draft(attributes: ["*"]), State()).Blockers, x => x.Code == "allColumnsNotAllowed");
        Assert.Contains(validator.Validate(Draft(attributes: []), State()).Blockers, x => x.Code == "attributesRequired");
        Assert.Contains(validator.Validate(Draft(attributes: ["missing"]), State()).Blockers, x => x.Code == "invalidAttribute");
        Assert.Contains(validator.Validate(Draft(alias: "Existing"), State(duplicateAlias: true)).Blockers, x => x.Code == "duplicateAlias");
    }

    [Fact]
    public void Rejects_bad_alias_property_managed_state_and_stale_versions()
    {
        var state = State(managed: true, customizable: false, currentImageVersion: 7);
        var result = new PluginImageValidator().Validate(Draft(alias: " ", property: "Other",
            versions: new Dictionary<Guid, long> { [StepId] = 1, [ImageId] = 6 }), state);
        Assert.Contains(result.Blockers, x => x.Code == "aliasRequired");
        Assert.Contains(result.Blockers, x => x.Code == "invalidMessageProperty");
        Assert.Contains(result.Blockers, x => x.Code == "managedComponent");
        Assert.Contains(result.Blockers, x => x.Code == "nonCustomizable");
        Assert.Contains(result.Blockers, x => x.Code == "staleImageVersion");
    }

    [Fact]
    public void Allows_pre_images_before_postoperation_but_rejects_post_images()
    {
        Assert.DoesNotContain(new PluginImageValidator().Validate(Draft(), State(stage: 10)).Blockers, x => x.Code == "invalidImageStage");
        Assert.Contains(new PluginImageValidator().Validate(Draft(imageType: 1), State(stage: 20)).Blockers, x => x.Code == "invalidImageStage");
        Assert.DoesNotContain(new PluginImageValidator().Validate(Draft(imageType: 1), State(stage: 40)).Blockers, x => x.Code == "invalidImageStage");
    }

    private static readonly Guid StepId = Guid.NewGuid();
    private static readonly Guid ImageId = Guid.NewGuid();
    private static ImageDraftDto Draft(int imageType = 0, string alias = "PreImage", string property = "Target",
        IReadOnlyList<string>? attributes = null, IReadOnlyDictionary<Guid, long>? versions = null) =>
        new(StepId, imageType, alias, property, attributes ?? ["name"], versions ?? new Dictionary<Guid, long> { [StepId] = 1 });
    private static PluginImageValidationState State(string message = "Update", bool duplicateAlias = false,
        bool managed = false, bool customizable = true, long? currentImageVersion = null, int stage = 20) =>
        new(ImageId, "PreImage", message, stage, "account", "Target", ["accountid", "name", "accountnumber"], duplicateAlias,
            managed, customizable, 1, currentImageVersion, StepId);
}
