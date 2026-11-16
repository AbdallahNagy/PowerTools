using PowerTools.API.Tools.DataMigration;
using Xunit;

namespace PowerTools.API.DataMigration.Tests;

public sealed class MigrationProgressTests
{
    [Fact]
    public async Task A_snapshot_taken_while_the_run_records_errors_is_consistent()
    {
        var progress = new MigrationProgress();
        progress.MarkRunning();
        var running = true;

        var writer = Task.Run(() =>
        {
            for (var i = 0; i < 20_000; i++) progress.RecordRejected(i.ToString(), "Record rejected.");
            Volatile.Write(ref running, false);
        });

        var failure = await Record.ExceptionAsync(() => Task.Run(() =>
        {
            while (Volatile.Read(ref running))
            {
                var snapshot = progress.Snapshot();
                Assert.Equal(snapshot.Failed, snapshot.Errors.Count);
                Assert.Equal(snapshot.Processed, snapshot.Errors.Count);
            }
        }));
        await writer;

        Assert.Null(failure);
        Assert.Equal(20_000, progress.Snapshot().Errors.Count);
    }
}
