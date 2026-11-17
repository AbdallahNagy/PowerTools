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
}
