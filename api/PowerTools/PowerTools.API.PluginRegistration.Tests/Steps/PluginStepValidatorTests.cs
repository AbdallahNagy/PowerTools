using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class PluginStepValidatorTests
{
    private static readonly Guid PluginId = Guid.NewGuid();
    private static readonly Guid MessageId = Guid.NewGuid();
    private static readonly Guid FilterId = Guid.NewGuid();

    [Theory]
    [InlineData(10, 0, true)]
    [InlineData(20, 0, true)]
    [InlineData(40, 0, true)]
    [InlineData(40, 1, true)]
    [InlineData(10, 1, false)]
    [InlineData(20, 1, false)]
    public void Execution_mode_is_valid_only_for_supported_stage_combinations(int stage, int mode, bool valid)
    {
        var result = Validate(Draft(stage: stage, mode: mode));

        Assert.Equal(valid, result.Blockers.Count == 0);
    }

    [Fact]
    public void Update_primary_key_filter_is_blocked_and_missing_filters_warn()
    {
        var blocked = Validate(Draft(attributes: ["accountid"]));
        var warned = Validate(Draft(attributes: []));

        Assert.Contains(blocked.Blockers, item => item.Code == "primaryKeyFilteringAttribute");
        Assert.Contains(warned.Warnings, item => item.Code == "updateWithoutFilteringAttributes");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1000001)]
    public void Rank_outside_supported_bounds_is_blocked(int rank)
    {
        Assert.Contains(Validate(Draft(rank: rank)).Blockers, item => item.Code == "invalidRank");
    }

    [Fact]
    public void Duplicate_invalid_user_config_and_stale_or_locked_target_are_blocked()
    {
        var state = State() with
        {
            DuplicateExists = true,
            IsImpersonatingUserEnabled = false,
            IsManaged = true,
            IsCustomizable = false,
            CurrentVersion = 8,
            TargetStepId = PluginId
        };
        var draft = Draft(userId: Guid.NewGuid(), unsecure: new string('u', 4097), secure: new string('s', 4097), expected: 7);

        var result = new PluginStepValidator().Validate(draft, state);

        Assert.Equal(new[] { "configTooLong", "duplicateStep", "invalidImpersonatingUser", "managedComponent", "nonCustomizable", "staleVersion" },
            result.Blockers.Select(item => item.Code).Order());
    }

    [Fact]
    public void Validator_normalizes_filter_attributes_without_exposing_secure_configuration()
    {
        var result = Validate(Draft(attributes: [" name ", "NAME", "telephone1"], secure: "replacement-secret"));

        Assert.Equal(new[] { "name", "telephone1" }, result.Draft.FilteringAttributes);
        Assert.DoesNotContain("replacement-secret", System.Text.Json.JsonSerializer.Serialize(result.PublicAfter));
        Assert.True(result.PublicAfter.SecureConfigExists);
    }

    [Fact]
    public void Secondary_table_unknown_attributes_and_non_plugin_or_locked_parent_are_blocked()
    {
        var state = State() with { SecondaryTable = "contact", AvailableAttributes = ["name", "accountid"],
            IsOrdinaryPlugin = false, IsParentManaged = true, IsParentCustomizable = false };
        var result = new PluginStepValidator().Validate(Draft(attributes: ["missing"]) with { SecondaryTable = "lead" }, state);

        Assert.Equal(new[] { "invalidFilteringAttribute", "managedParent", "nonCustomizableParent", "ordinaryPluginRequired", "unsupportedSecondaryTable" },
            result.Blockers.Select(item => item.Code).Order());
    }

    [Fact]
    public void Nullable_field_actions_must_match_their_values()
    {
        var draft = Draft() with { ImpersonatingUserAction = "set", ImpersonatingUserId = null,
            UnsecureConfigurationAction = "clear", UnsecureConfiguration = "still-present" };

        var result = Validate(draft);

        Assert.Contains(result.Blockers, item => item.Code == "invalidNullableAction");
    }

    private static PluginStepValidationResult Validate(StepDraftDto draft) => new PluginStepValidator().Validate(draft, State());

    private static StepDraftDto Draft(int stage = 40, int mode = 0, int rank = 1,
        IReadOnlyList<string>? attributes = null, Guid? userId = null, string? unsecure = null,
        string? secure = null, long expected = 7) => new(PluginId, MessageId, FilterId, "account", null,
            stage, mode, rank, attributes ?? ["name"], userId, unsecure, secure,
            new Dictionary<Guid, long> { [PluginId] = expected });

    private static PluginStepValidationState State() => new(null, "Update", "account", null, "accountid", ["accountid", "name", "telephone1"],
        true, true, true, true, false, true, false, false, true, false, true, 7, PluginId, null);
}
