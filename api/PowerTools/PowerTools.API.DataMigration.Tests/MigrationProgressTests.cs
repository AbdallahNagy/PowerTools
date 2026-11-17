using PowerTools.API.Tools.DataMigration;
using Xunit;

namespace PowerTools.API.DataMigration.Tests;

public sealed class MigrationProgressTests
{
    private const int Rounds = 300;
    private const int RejectionsPerRound = 500;

    [Fact]
    public async Task A_snapshot_taken_while_the_run_records_errors_is_consistent()
    {
        // Many short rounds keep each snapshot's copy small, so the reader takes many snapshots while the
        // writer is recording.
        var snapshotsDuringWrites = 0;
        for (var round = 0; round < Rounds; round++)
        {
            var progress = new MigrationProgress();
            progress.MarkRunning();
            var running = true;
            using var readerStarted = new ManualResetEventSlim(false);

            var reader = Task.Run(() =>
            {
                readerStarted.Set();
                var taken = 0;
                while (Volatile.Read(ref running))
                {
                    var snapshot = progress.Snapshot();
                    Assert.Equal(snapshot.Failed, snapshot.Errors.Count);
                    Assert.Equal(snapshot.Processed, snapshot.Errors.Count);
                    taken++;
                }
                return taken;
            });

            readerStarted.Wait();
            for (var i = 0; i < RejectionsPerRound; i++) progress.RecordRejected(i.ToString(), "Record rejected.");
            Volatile.Write(ref running, false);

            var failure = await Record.ExceptionAsync(async () => snapshotsDuringWrites += await reader);
            Assert.Null(failure);
            Assert.Equal(RejectionsPerRound, progress.Snapshot().Errors.Count);
        }

        Assert.True(snapshotsDuringWrites >= Rounds, $"Only {snapshotsDuringWrites} snapshots overlapped the writes.");
    }
}
