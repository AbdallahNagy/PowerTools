using Microsoft.Xrm.Sdk;
using Dyno.Api.Tools.DataMigration;
using Xunit;

namespace Dyno.Api.Tests.Tools.DataMigration;

public sealed class MigrationPlanTests
{
    private static readonly Guid RecordId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static readonly MigrationOptions CreateOnly = new(Create: true, Update: false, Delete: false);
    private static readonly MigrationOptions UpdateOnly = new(Create: false, Update: true, Delete: false);
    private static readonly MigrationOptions CreateAndUpdate = new(Create: true, Update: true, Delete: false);
    private static readonly MigrationOptions DeleteOnly = new(Create: false, Update: false, Delete: true, ConfirmedDeleteCount: 2);

    public static TheoryData<MigrationOptions, bool, string> Decisions => new()
    {
        { CreateOnly, false, "Create" },
        { CreateOnly, true, "Skip" },
        { UpdateOnly, true, "Update" },
        { UpdateOnly, false, "Skip" },
        { CreateAndUpdate, false, "Create" },
        { CreateAndUpdate, true, "Update" },
        { DeleteOnly, true, "Skip" },
        { DeleteOnly, false, "Skip" },
    };

    // Records the options do not cover are skipped, as in Data Transporter, rather than sent and failed.
    [Theory]
    [MemberData(nameof(Decisions))]
    public void Decide_skips_records_the_options_do_not_cover(MigrationOptions options, bool existsInTarget, string expected)
    {
        Assert.Equal(expected, MigrationPlan.Decide(options, existsInTarget).ToString());
    }

    [Theory]
    [InlineData(new[] { "accountid", "statuscode" }, new[] { "accountid", "statuscode", "statecode" })]
    [InlineData(new[] { "accountid", "statecode", "statuscode" }, new[] { "accountid", "statecode", "statuscode" })]
    [InlineData(new[] { "accountid", "name" }, new[] { "accountid", "name" })]
    public void Source_columns_add_the_state_when_only_the_status_reason_is_chosen(string[] chosen, string[] expected)
    {
        Assert.Equal(expected, MigrationPlan.SourceColumns(chosen));
    }

    // An inactive record is created without its state, then moved to it.
    [Fact]
    public void Inactive_record_is_created_without_state_then_moved()
    {
        var source = Record(statecode: 1, statuscode: 2);
        source["name"] = "Contoso";
        var create = Record(statecode: 1, statuscode: 2);
        create["name"] = "Contoso";

        var stateChange = MigrationPlan.SplitStateChange(create, source);

        Assert.NotNull(stateChange);
        Assert.False(create.Contains("statecode"));
        Assert.False(create.Contains("statuscode"));
        Assert.Equal("Contoso", create.GetAttributeValue<string>("name"));
        Assert.Equal(RecordId, stateChange.Id);
        Assert.Equal(1, stateChange.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(2, stateChange.GetAttributeValue<OptionSetValue>("statuscode").Value);
        Assert.Equal(2, stateChange.Attributes.Count);
    }

    // Only the status reason was chosen: the state read alongside it still moves the record.
    [Fact]
    public void Status_reason_alone_still_moves_the_record()
    {
        var create = new Entity("account", RecordId) { ["statuscode"] = new OptionSetValue(2) };

        var stateChange = MigrationPlan.SplitStateChange(create, Record(statecode: 1, statuscode: 2));

        Assert.NotNull(stateChange);
        Assert.False(create.Contains("statuscode"));
        Assert.Equal(1, stateChange.GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(2, stateChange.GetAttributeValue<OptionSetValue>("statuscode").Value);
    }

    // Only the state was chosen: the status reason is left for Dataverse to default.
    [Fact]
    public void State_alone_leaves_the_status_reason_to_dataverse()
    {
        var create = new Entity("account", RecordId) { ["statecode"] = new OptionSetValue(1) };

        var stateChange = MigrationPlan.SplitStateChange(create, Record(statecode: 1, statuscode: 2));

        Assert.NotNull(stateChange);
        Assert.False(stateChange.Contains("statuscode"));
    }

    [Fact]
    public void Active_record_needs_no_state_change()
    {
        var create = Record(statecode: 0, statuscode: 1);

        Assert.Null(MigrationPlan.SplitStateChange(create, Record(statecode: 0, statuscode: 1)));
        Assert.True(create.Contains("statuscode"));
    }

    [Fact]
    public void Record_without_state_needs_no_state_change()
    {
        Assert.Null(MigrationPlan.SplitStateChange(new Entity("account", RecordId), new Entity("account", RecordId)));
    }

    [Fact]
    public void Delete_is_allowed_when_confirmed_and_within_the_confirmed_count()
    {
        Assert.Null(MigrationPlan.DeleteBlockedReason(CreateAndUpdate, sourceCount: 10, toDelete: 5));
        Assert.Null(MigrationPlan.DeleteBlockedReason(DeleteOnly, sourceCount: 10, toDelete: 0));
        Assert.Null(MigrationPlan.DeleteBlockedReason(DeleteOnly, sourceCount: 10, toDelete: 2));
        Assert.Null(MigrationPlan.DeleteBlockedReason(DeleteOnly, sourceCount: 10, toDelete: 1));
    }

    // Deleting stops when it was not confirmed, when the source returned nothing, or when it grew.
    [Fact]
    public void Delete_is_blocked_when_unconfirmed_empty_or_grown()
    {
        Assert.Contains(
            "more than the 2 you confirmed",
            MigrationPlan.DeleteBlockedReason(DeleteOnly, sourceCount: 10, toDelete: 3) ?? "");
        Assert.Contains(
            "No source records match",
            MigrationPlan.DeleteBlockedReason(DeleteOnly, sourceCount: 0, toDelete: 2) ?? "");
        Assert.Contains(
            "not confirmed",
            MigrationPlan.DeleteBlockedReason(DeleteOnly with { ConfirmedDeleteCount = null }, sourceCount: 10, toDelete: 1) ?? "");
    }

    private static Entity Record(int statecode, int statuscode) => new("account", RecordId)
    {
        ["statecode"] = new OptionSetValue(statecode),
        ["statuscode"] = new OptionSetValue(statuscode)
    };
}
