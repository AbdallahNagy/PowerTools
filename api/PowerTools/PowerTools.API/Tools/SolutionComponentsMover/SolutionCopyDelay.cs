namespace PowerTools.API.Tools.SolutionComponentsMover;

public interface ISolutionCopyDelay
{
    Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken);
}

public sealed class SolutionCopyDelay : ISolutionCopyDelay
{
    public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken) =>
        Task.Delay(delay, cancellationToken);
}
