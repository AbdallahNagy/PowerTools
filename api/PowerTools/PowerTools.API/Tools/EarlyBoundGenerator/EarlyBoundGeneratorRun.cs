using System.Diagnostics;
using System.Net.Http;
using System.Net.Sockets;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>
/// One generation: run the engine, list what it wrote, keep the settings file's extra keys on success,
/// and put the previous settings file back on failure.
/// </summary>
public sealed class EarlyBoundGeneratorRun(IEarlyBoundEngine engine)
{
    /// <summary>File system timestamps can be coarse; count files written just before the start.</summary>
    private static readonly TimeSpan TimestampTolerance = TimeSpan.FromSeconds(2);

    public void Execute(EarlyBoundGeneratorJob job, IOrganizationService service)
    {
        job.MarkRunning();
        job.Log($"Model builder engine {ModelBuilderEngine.EngineVersion}.");

        var settings = job.Settings;
        var settingsPath = Path.Combine(settings.OutputDirectory, EarlyBoundGeneratorArguments.SettingsFileName);
        var startedUtc = DateTime.UtcNow - TimestampTolerance;
        var stopwatch = Stopwatch.StartNew();

        byte[]? previousSettings;
        try
        {
            previousSettings = File.Exists(settingsPath) ? File.ReadAllBytes(settingsPath) : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            previousSettings = null;
        }

        var preserved = EarlyBoundGeneratorFolder.PreservedKeys(
            previousSettings is null ? null : System.Text.Encoding.UTF8.GetString(previousSettings));

        EngineOutcome outcome;
        try
        {
            outcome = engine.Run(EarlyBoundGeneratorArguments.Build(settings), service, job);
        }
        catch (Exception ex)
        {
            outcome = new EngineOutcome(2, ex, ex.Message);
        }

        if (outcome.ExitCode == 0)
        {
            try
            {
                EarlyBoundGeneratorFolder.MergePreservedKeys(settingsPath, preserved);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
            {
                job.Log($"Warning: settings the form does not show could not be kept in builderSettings.json: {ex.Message}");
            }

            job.Succeed(EarlyBoundGeneratorFolder.ListWritten(settings, startedUtc, includeSettingsFile: true), stopwatch.Elapsed);
            return;
        }

        RestoreSettings(settingsPath, previousSettings, job);
        var (message, kind) = EarlyBoundGeneratorFaults.Describe(outcome, settings.GenerateMessages);
        job.Log($"Error: {message}");
        job.Fail(message, kind, EarlyBoundGeneratorFolder.ListWritten(settings, startedUtc, includeSettingsFile: false), stopwatch.Elapsed);
    }

    /// <summary>builderSettings.json changes only when a run succeeds.</summary>
    private static void RestoreSettings(string settingsPath, byte[]? previous, EarlyBoundGeneratorJob job)
    {
        try
        {
            if (previous is not null) File.WriteAllBytes(settingsPath, previous);
            else if (File.Exists(settingsPath)) File.Delete(settingsPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            job.Log($"Warning: builderSettings.json could not be put back: {ex.Message}");
        }
    }
}

public static class EarlyBoundGeneratorFaults
{
    private const int PrivilegeDenied = unchecked((int)0x80040220);
    private const int PrincipalPrivilegeDenied = unchecked((int)0x80042F09);

    public static (string Message, string Kind) Describe(EngineOutcome outcome, bool generateMessages)
    {
        var exception = outcome.Exception;

        if (Find<UnauthorizedAccessException>(exception) is not null)
            return ("You do not have permission to write to this folder.", FailureKinds.FolderAccess);

        if (Find<IOException>(exception) is { } io && Find<SocketException>(exception) is null)
            return ($"A generated file could not be written: {io.Message}", FailureKinds.Folder);

        if (Find<FaultException<OrganizationServiceFault>>(exception) is { } fault)
        {
            var text = DataverseErrorFormatter.Format(fault);
            if (fault.Detail.ErrorCode is PrivilegeDenied or PrincipalPrivilegeDenied)
            {
                return (generateMessages
                    ? $"{text} Your role may not read SDK message tables. Turn off message classes and select Generate again."
                    : text, FailureKinds.Privilege);
            }

            return (text, FailureKinds.Other);
        }

        if (Find<HttpRequestException>(exception) is not null
            || Find<SocketException>(exception) is not null
            || Find<CommunicationException>(exception) is not null
            || Find<TimeoutException>(exception) is not null)
        {
            return (DataverseErrorFormatter.Format(exception!), FailureKinds.Connection);
        }

        if (exception is not null) return (DataverseErrorFormatter.Format(exception), FailureKinds.Other);
        return (outcome.Error ?? $"Generation stopped with exit code {outcome.ExitCode}.", FailureKinds.Other);
    }

    private static T? Find<T>(Exception? exception) where T : Exception
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is T match) return match;
            if (current is AggregateException aggregate)
            {
                foreach (var inner in aggregate.InnerExceptions)
                {
                    if (Find<T>(inner) is { } found) return found;
                }
            }
        }

        return null;
    }
}
