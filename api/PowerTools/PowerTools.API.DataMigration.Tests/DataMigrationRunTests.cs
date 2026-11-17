using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.DataMigration.Tests.Support;
using PowerTools.API.Tools.DataMigration;
using Xunit;

namespace PowerTools.API.DataMigration.Tests;

/// <summary>
/// Behaviour of the run that the routes cannot reach. Everything else is pinned through the routes in
/// <see cref="MigrationRoutesTests"/>, with the same fake.
/// </summary>
public sealed class DataMigrationRunTests
{
    private static readonly Guid A = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid B = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    [Fact]
    public async Task A_cancelled_run_ends_failed_and_does_not_throw()
    {
        var source = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha");
        var target = new FakeDataverse("account", "accountid", "name");
        var progress = new MigrationProgress();
        using var cancel = new CancellationTokenSource();
        cancel.Cancel();

        await new DataMigrationRun(source, target).RunAsync(
            new MigrationRequest("account", ["name"], null, new MigrationOptions(Create: true, Update: true, Delete: false)),
            progress,
            cancel.Token);

        var snapshot = progress.Snapshot();
        Assert.Equal(MigrationJobStatus.Failed, snapshot.Status);
        Assert.Equal("N/A", Assert.Single(snapshot.Errors).RecordId);
        Assert.False(target.Has(A));
    }

    [Fact]
    public async Task A_batch_about_to_be_written_is_still_sent_and_counted_when_shutdown_begins()
    {
        var source = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha");
        var target = new FakeDataverse("account", "accountid", "name");
        var progress = new MigrationProgress();
        using var cancel = new CancellationTokenSource();
        // Shutdown starts while the run looks up which records the target already has, just before it writes.
        target.OnRetrieve = _ => cancel.Cancel();

        await new DataMigrationRun(source, target).RunAsync(
            new MigrationRequest("account", ["name"], null, new MigrationOptions(Create: true, Update: true, Delete: false)),
            progress,
            cancel.Token);

        Assert.True(target.Has(A));
        Assert.Equal(1, progress.Snapshot().Created);
    }

    [Fact]
    public async Task A_delete_batch_about_to_be_sent_is_still_sent_and_counted_when_shutdown_begins()
    {
        var source = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha");
        var target = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha").Add(B, "Beta");
        var progress = new MigrationProgress();
        using var cancel = new CancellationTokenSource();
        // Shutdown starts just as the delete batch goes out.
        target.OnExecute = request =>
        {
            if (request is ExecuteMultipleRequest) cancel.Cancel();
        };

        await new DataMigrationRun(source, target).RunAsync(
            new MigrationRequest("account", ["name"], null,
                new MigrationOptions(Create: false, Update: false, Delete: true, ConfirmedDeleteCount: 1)),
            progress,
            cancel.Token);

        Assert.False(target.Has(B));
        Assert.Equal(1, progress.Snapshot().Deleted);
    }

    [Fact]
    public async Task An_unconfirmed_delete_deletes_nothing_and_says_why()
    {
        var source = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha");
        var target = new FakeDataverse("account", "accountid", "name").Add(A, "Alpha").Add(B, "Beta");
        var progress = new MigrationProgress();

        await new DataMigrationRun(source, target).RunAsync(
            new MigrationRequest("account", ["name"], null,
                new MigrationOptions(Create: false, Update: false, Delete: true, ConfirmedDeleteCount: null)),
            progress,
            CancellationToken.None);

        var snapshot = progress.Snapshot();
        Assert.Equal(MigrationJobStatus.Completed, snapshot.Status);
        Assert.Equal(1, snapshot.Failed);
        Assert.Equal(
            new MigrationJobError("N/A", "Delete was not confirmed, so no target records were deleted."),
            Assert.Single(snapshot.Errors));
        Assert.True(target.Has(B));
        Assert.Empty(target.Writes);
    }
}
