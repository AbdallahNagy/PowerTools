using System.Collections;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.ModelBuilderLib;
using Microsoft.PowerPlatform.Dataverse.ModelBuilderLib.Status;
using Microsoft.Xrm.Sdk;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>Receives stage changes and log lines while the engine runs.</summary>
public interface IEngineObserver
{
    void Stage(string stage);
    void Log(string line);
}

/// <param name="ExitCode">0 is success. ModelBuilder returns 2 for any exception it caught.</param>
/// <param name="Exception">The exception that stopped the run, when known.</param>
/// <param name="Error">The engine's last error text, when known.</param>
public sealed record EngineOutcome(int ExitCode, Exception? Exception, string? Error);

public interface IEarlyBoundEngine
{
    EngineOutcome Run(IReadOnlyList<string> arguments, IOrganizationService service, IEngineObserver observer);
}

/// <summary>
/// Runs Microsoft's ModelBuilder in-process with the tab's existing connection.
/// </summary>
public sealed partial class ModelBuilderEngine : IEarlyBoundEngine
{
    private const string UtilitiesTypeName = "Microsoft.PowerPlatform.Dataverse.ModelBuilderLib.Utility.Utilites";
    private const string LocatedKeysField = "_locatedKeys";

    /// <summary>The engine keeps static state, so only one run may be inside it at a time.</summary>
    private static readonly object Gate = new();

    /// <summary>The package version (for example 2.0.16 shows as 2.0.0.16); the assembly version stays 2.0.0.0.</summary>
    public static string EngineVersion { get; } =
        typeof(ModelBuilder).Assembly.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version
        ?? typeof(ModelBuilder).Assembly.GetName().Version?.ToString()
        ?? "unknown";

    public EngineOutcome Run(IReadOnlyList<string> arguments, IOrganizationService service, IEngineObserver observer)
    {
        lock (Gate)
        {
            ClearFilterCache();

            var builder = new ModelBuilder(new ObserverLogger(observer));
            builder.ModelBuilderLogger.OnWriteProgressItem += (_, progress) => OnProgress(progress, observer);
            builder.Parameters.LoadArguments(arguments.ToArray());

            int exitCode;
            try
            {
                exitCode = builder.Invoke(service);
            }
            catch (Exception ex)
            {
                // Invoke catches most faults itself, but some of its handlers can throw.
                return new EngineOutcome(2, ex, ex.Message);
            }

            var logger = builder.ModelBuilderLogger;
            return exitCode == 0
                ? new EngineOutcome(0, null, null)
                : new EngineOutcome(exitCode, logger.LastException, NullIfBlank(logger.LastError));
        }
    }

    /// <summary>
    /// ModelBuilder caches the parsed table and message filters in a static dictionary that is never
    /// cleared, so a second run in the same process would reuse the first run's filters. Clear it
    /// before every run, and fail loudly if a new engine version moved it.
    /// </summary>
    public static void ClearFilterCache()
    {
        var field = typeof(ModelBuilder).Assembly
            .GetType(UtilitiesTypeName)
            ?.GetField(LocatedKeysField, BindingFlags.NonPublic | BindingFlags.Static);

        if (field?.GetValue(null) is not IDictionary cache)
        {
            throw new InvalidOperationException(
                $"This version of the model builder ({EngineVersion}) is not supported: its filter cache was not found.");
        }

        cache.Clear();
    }

    private static void OnProgress(ProgressStatus progress, IEngineObserver observer)
    {
        switch (progress.Stage)
        {
            case ProcessStage.ReadMetadata:
                observer.Stage(JobStages.ReadingMetadata);
                break;
            case ProcessStage.ClassGeneration:
            case ProcessStage.FileGeneration:
                observer.Stage(JobStages.WritingCode);
                break;
        }

        var message = progress.StatusMessage?.Trim();
        if (string.IsNullOrEmpty(message)) return;
        observer.Log(progress.StatusType switch
        {
            ProgressType.Warning => $"Warning: {message}",
            ProgressType.Error => $"Error: {message}",
            _ => message,
        });
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// The engine sends progress through <see cref="ModeBuilderLoggerService.OnWriteProgressItem"/> and fault
    /// details through this logger at Error level. Only the first line of each error is kept; the rest is a
    /// stack trace.
    /// </summary>
    private sealed partial class ObserverLogger(IEngineObserver observer) : ILogger
    {
        [System.Text.RegularExpressions.GeneratedRegex(@"^Source\s*:")]
        private static partial System.Text.RegularExpressions.Regex DetailLine();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var text = formatter(state, exception).Trim();
            // The engine follows each error with a "===== DETAIL =====" block of source and stack lines.
            if (text.Length == 0
                || text.StartsWith("=====", StringComparison.Ordinal)
                || DetailLine().IsMatch(text))
            {
                return;
            }

            observer.Log($"Error: {text.Split('\n')[0].Trim()}");
        }
    }
}
