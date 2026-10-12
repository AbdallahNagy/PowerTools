using System.ServiceModel;
using System.Text.Json.Nodes;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;
using PowerTools.API.Tools.EarlyBoundGenerator;
using Xunit;

namespace PowerTools.API.EarlyBoundGenerator.Tests;

internal sealed class TempFolder : IDisposable
{
    public TempFolder()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ebg-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path);
    }

    public string Path { get; }

    public string Write(string relative, string text)
    {
        var full = System.IO.Path.Combine(Path, relative);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
        File.WriteAllText(full, text);
        return full;
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(Path, recursive: true);
        }
        catch (IOException)
        {
        }
    }
}

/// <summary>An engine that runs a script instead of ModelBuilder.</summary>
internal sealed class ScriptedEngine(Func<IReadOnlyList<string>, IEngineObserver, EngineOutcome> script) : IEarlyBoundEngine
{
    public List<IReadOnlyList<string>> Calls { get; } = [];

    public EngineOutcome Run(IReadOnlyList<string> arguments, IOrganizationService service, IEngineObserver observer)
    {
        Calls.Add(arguments);
        return script(arguments, observer);
    }
}

internal static class Settings
{
    public static GenerationSettingsDto Valid(string outputDirectory) => new()
    {
        OutputDirectory = outputDirectory,
        Namespace = "Contoso.Model",
        ServiceContextName = "DataverseContext",
        EntityNamesFilter = ["account", "contact"],
    };
}

public sealed class EarlyBoundGeneratorValidationTests
{
    [Fact]
    public void Valid_settings_have_no_problems()
    {
        using var folder = new TempFolder();
        Assert.Empty(EarlyBoundGeneratorValidation.Validate(Settings.Valid(folder.Path)));
    }

    [Fact]
    public void Namespace_must_differ_from_the_service_context_name()
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.Namespace = "Model";
        settings.ServiceContextName = "Model";

        var problem = Assert.Single(EarlyBoundGeneratorValidation.Validate(settings));
        Assert.Equal("serviceContextName", problem.Field);
    }

    [Theory]
    [InlineData("")]
    [InlineData("1Contoso")]
    [InlineData("Contoso..Model")]
    [InlineData("Contoso Model")]
    public void Namespace_must_be_a_valid_csharp_namespace(string ns)
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.Namespace = ns;

        Assert.Contains(EarlyBoundGeneratorValidation.Validate(settings), problem => problem.Field == "namespace");
    }

    [Fact]
    public void Output_folder_must_be_an_existing_full_path()
    {
        var relative = Settings.Valid("relative/folder");
        Assert.Contains(EarlyBoundGeneratorValidation.Validate(relative), problem => problem.Field == "outputDirectory");

        var missing = Settings.Valid(Path.Combine(Path.GetTempPath(), "ebg-missing-" + Guid.NewGuid().ToString("N")));
        Assert.Contains(EarlyBoundGeneratorValidation.Validate(missing), problem => problem.Field == "outputDirectory");
    }

    [Theory]
    [InlineData("../Entities")]
    [InlineData("Model/../../Entities")]
    [InlineData("/Entities")]
    [InlineData("C:\\Entities")]
    [InlineData("C:Entities")]
    [InlineData("")]
    [InlineData("Ent*ties")]
    public void Type_folders_must_be_relative_without_parent_segments(string folderName)
    {
        using var folder = new TempFolder();
        var settings = EarlyBoundGeneratorValidation.Normalize(Settings.Valid(folder.Path));
        settings.EntityTypesFolder = folderName;

        Assert.Contains(EarlyBoundGeneratorValidation.Validate(settings), problem => problem.Field == "entityTypesFolder");
    }

    [Fact]
    public void Nested_relative_type_folders_are_allowed()
    {
        Assert.True(EarlyBoundGeneratorValidation.IsSafeRelativeFolder("Model/Entities"));
        Assert.True(EarlyBoundGeneratorValidation.IsSafeRelativeFolder("Model\\Entities"));
    }

    [Fact]
    public void Messages_need_a_service_context_name()
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.ServiceContextName = "";

        Assert.Empty(EarlyBoundGeneratorValidation.Validate(settings));

        settings.GenerateMessages = true;
        var problem = Assert.Single(EarlyBoundGeneratorValidation.Validate(settings));
        Assert.Equal("serviceContextName", problem.Field);
    }

    [Theory]
    [InlineData("new_it's")]
    [InlineData("new_<x>")]
    [InlineData("a&b")]
    [InlineData("new_%")]
    public void Message_names_allow_only_letters_digits_underscore_and_star(string name)
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.GenerateMessages = true;
        settings.MessageNamesFilter = ["new_ok*", name];

        var problem = Assert.Single(EarlyBoundGeneratorValidation.Validate(EarlyBoundGeneratorValidation.Normalize(settings)));
        Assert.Equal("messageNamesFilter", problem.Field);
        Assert.Contains(name, problem.Message);
    }

    [Fact]
    public void Normalize_lowercases_and_deduplicates_tables_and_drops_blank_entries()
    {
        var settings = Settings.Valid("C:/out");
        settings.EntityNamesFilter = [" Account ", "account", "", "  ", "CONTACT"];

        var normalized = EarlyBoundGeneratorValidation.Normalize(settings);

        Assert.Equal(["account", "contact"], normalized.EntityNamesFilter);
    }

    [Fact]
    public void Normalize_clears_the_message_filter_when_messages_are_off()
    {
        var settings = Settings.Valid("C:/out");
        settings.MessageNamesFilter = ["new_*"];
        settings.GenerateMessages = false;

        Assert.Empty(EarlyBoundGeneratorValidation.Normalize(settings).MessageNamesFilter);
    }

    [Fact]
    public void Unknown_tables_are_reported_in_request_order()
    {
        var unknown = EarlyBoundGeneratorValidation.UnknownTables(
            ["account", "new_missing", "contact", "new_gone"],
            ["contact", "Account", "systemuser"]);

        Assert.Equal(["new_missing", "new_gone"], unknown);
    }
}

public sealed class EarlyBoundGeneratorArgumentsTests
{
    [Fact]
    public void Builds_pac_switches_for_a_known_settings_set()
    {
        var settings = new GenerationSettingsDto
        {
            OutputDirectory = "C:\\src\\Contoso Model",
            Namespace = "Contoso.Model",
            ServiceContextName = "DataverseContext",
            EntityTypesFolder = "Entities",
            OptionSetsTypesFolder = "OptionSets",
            MessagesTypesFolder = "Messages",
            EntityNamesFilter = ["account", "contact"],
            MessageNamesFilter = ["new_*", "WhoAmI"],
            GenerateMessages = true,
            GenerateGlobalOptionSets = true,
            EmitFieldsClasses = true,
            EmitVirtualAttributes = true,
            EmitEntityETC = false,
            SuppressINotifyPattern = true,
            SuppressGeneratedCodeAttribute = true,
        };

        Assert.Equal(
            [
                "/outdirectory:C:\\src\\Contoso Model",
                "/splitfiles",
                "/namespace:Contoso.Model",
                "/serviceContextName:DataverseContext",
                "/entitytypesfolder:Entities",
                "/optionsetstypesfolder:OptionSets",
                "/messagestypesfolder:Messages",
                "/entitynamesfilter:account;contact",
                "/generatesdkmessages",
                "/messagenamesfilter:new_*;WhoAmI",
                "/generateGlobalOptionSets",
                "/emitfieldsclasses",
                "/emitVirtualAttributes",
                "/suppressINotifyPattern",
                "/suppressGeneratedCodeAttribute",
                "/writesettingsTemplateFile",
            ],
            EarlyBoundGeneratorArguments.Build(settings));
    }

    [Fact]
    public void Empty_table_filter_and_empty_context_send_no_switch()
    {
        var settings = new GenerationSettingsDto
        {
            OutputDirectory = "/out",
            Namespace = "Model",
        };

        var args = EarlyBoundGeneratorArguments.Build(settings);

        Assert.DoesNotContain(args, arg => arg.StartsWith("/entitynamesfilter", StringComparison.Ordinal));
        Assert.DoesNotContain(args, arg => arg.StartsWith("/serviceContextName", StringComparison.Ordinal));
        Assert.DoesNotContain(args, arg => arg.StartsWith("/generatesdkmessages", StringComparison.Ordinal));
        Assert.DoesNotContain(args, arg => arg.StartsWith("/messagenamesfilter", StringComparison.Ordinal));
    }
}

public sealed class ModelBuilderEngineTests
{
    private sealed class Observer : IEngineObserver
    {
        public List<string> Stages { get; } = [];
        public List<string> Lines { get; } = [];
        public void Stage(string stage) => Stages.Add(stage);
        public void Log(string line) => Lines.Add(line);
    }

    [Fact]
    public void Generates_one_file_per_table_and_the_settings_file_from_a_fake_service()
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.EntityNamesFilter = ["account"];
        var service = new FakeMetadataService();
        var observer = new Observer();

        var outcome = new ModelBuilderEngine().Run(EarlyBoundGeneratorArguments.Build(settings), service, observer);

        Assert.Equal(0, outcome.ExitCode);
        Assert.True(File.Exists(Path.Combine(folder.Path, "Entities", "account.cs")));
        Assert.True(File.Exists(Path.Combine(folder.Path, "DataverseContext.cs")));
        var written = JsonNode.Parse(File.ReadAllText(Path.Combine(folder.Path, "builderSettings.json")))!.AsObject();
        Assert.Equal("Contoso.Model", (string?)written["namespace"]);
        Assert.Equal(["account"], written["entityNamesFilter"]!.AsArray().Select(node => (string?)node));
        Assert.Contains(JobStages.ReadingMetadata, observer.Stages);
        Assert.Contains(JobStages.WritingCode, observer.Stages);
        Assert.Contains(observer.Lines, line => line.Contains("Read 1 Entities", StringComparison.Ordinal));
        Assert.DoesNotContain("ExecuteFetch", service.Requests);
        Assert.DoesNotContain("RetrieveAllEntities", service.Requests);
    }

    [Fact]
    public void A_second_run_in_the_same_process_uses_its_own_table_filter()
    {
        using var first = new TempFolder();
        using var second = new TempFolder();
        var service = new FakeMetadataService();
        var engine = new ModelBuilderEngine();

        var one = Settings.Valid(first.Path);
        one.EntityNamesFilter = ["account"];
        var two = Settings.Valid(second.Path);
        two.EntityNamesFilter = ["contact"];

        Assert.Equal(0, engine.Run(EarlyBoundGeneratorArguments.Build(one), service, new Observer()).ExitCode);
        Assert.Equal(0, engine.Run(EarlyBoundGeneratorArguments.Build(two), service, new Observer()).ExitCode);

        Assert.Equal([["account"], ["contact"]], service.RequestedTables);
        Assert.True(File.Exists(Path.Combine(second.Path, "Entities", "contact.cs")));
        Assert.False(File.Exists(Path.Combine(second.Path, "Entities", "account.cs")));
    }

    [Fact]
    public void Messages_off_sends_no_sdk_message_queries()
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        settings.EntityNamesFilter = ["account"];
        settings.MessageNamesFilter = ["new_*"];
        settings.GenerateMessages = false;
        var service = new FakeMetadataService();

        var outcome = new ModelBuilderEngine().Run(
            EarlyBoundGeneratorArguments.Build(EarlyBoundGeneratorValidation.Normalize(settings)),
            service,
            new Observer());

        Assert.Equal(0, outcome.ExitCode);
        Assert.DoesNotContain("ExecuteFetch", service.Requests);
    }

    [Fact]
    public void A_dataverse_fault_returns_a_non_zero_code_with_the_fault()
    {
        using var folder = new TempFolder();
        var settings = Settings.Valid(folder.Path);
        var service = new FakeMetadataService
        {
            OnExecute = _ => throw new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040220), Message = "Principal user is missing prvReadEntity privilege." },
                new FaultReason("Principal user is missing prvReadEntity privilege.")),
        };
        var observer = new Observer();

        var outcome = new ModelBuilderEngine().Run(EarlyBoundGeneratorArguments.Build(settings), service, observer);

        Assert.NotEqual(0, outcome.ExitCode);
        Assert.Contains(observer.Lines, line => line.StartsWith("Error:", StringComparison.Ordinal));
        var (message, kind) = EarlyBoundGeneratorFaults.Describe(outcome, generateMessages: true);
        Assert.Equal(FailureKinds.Privilege, kind);
        Assert.Contains("prvReadEntity", message);
        Assert.Contains("Turn off message classes", message);
    }
}

public sealed class EarlyBoundGeneratorRunTests
{
    private static readonly OnlineConnectionContext Connection = new("https://dev.example.test", "token");

    private static EarlyBoundGeneratorJob Job(GenerationSettingsDto settings) =>
        new(EarlyBoundGeneratorValidation.Normalize(settings), Connection);

    [Fact]
    public void Success_lists_written_files_with_kinds_and_keeps_extra_settings_keys()
    {
        using var folder = new TempFolder();
        folder.Write("builderSettings.json", """
            { "namespace": "Old.Model", "generateActions": true, "codeCustomizationService": "My.Service, My" }
            """);
        folder.Write("README.md", "not generated");
        var engine = new ScriptedEngine((_, observer) =>
        {
            observer.Stage(JobStages.ReadingMetadata);
            observer.Log("Read 2 Entities");
            observer.Stage(JobStages.WritingCode);
            folder.Write("Entities/account.cs", "class Account {}");
            folder.Write("OptionSets/account_industrycode.cs", "enum X {}");
            folder.Write("Messages/new_DoThing.cs", "class Req {}");
            folder.Write("DataverseContext.cs", "class Ctx {}");
            folder.Write("builderSettings.json", """{ "namespace": "Contoso.Model", "language": "CS" }""");
            return new EngineOutcome(0, null, null);
        });
        var job = Job(Settings.Valid(folder.Path));

        new EarlyBoundGeneratorRun(engine).Execute(job, new FakeMetadataService());

        var dto = job.ToDto();
        Assert.Equal(JobStates.Succeeded, dto.State);
        Assert.Null(dto.Stage);
        Assert.Contains("Read 2 Entities", dto.Log);
        Assert.Equal(
            [
                ("builderSettings.json", GeneratedFileKinds.Settings, ""),
                ("DataverseContext.cs", GeneratedFileKinds.ServiceContext, "DataverseContext"),
                (Path.Combine("Entities", "account.cs"), GeneratedFileKinds.Table, "account"),
                (Path.Combine("Messages", "new_DoThing.cs"), GeneratedFileKinds.Message, "new_DoThing"),
                (Path.Combine("OptionSets", "account_industrycode.cs"), GeneratedFileKinds.Choice, "account_industrycode"),
            ],
            dto.Files.Select(file => (file.Path, file.Kind, file.Name)).OrderBy(file => file.Path, StringComparer.OrdinalIgnoreCase));

        var written = JsonNode.Parse(File.ReadAllText(Path.Combine(folder.Path, "builderSettings.json")))!.AsObject();
        Assert.Equal("Contoso.Model", (string?)written["namespace"]);
        Assert.True((bool?)written["generateActions"]);
        Assert.Equal("My.Service, My", (string?)written["codeCustomizationService"]);
    }

    [Fact]
    public void Failure_restores_the_previous_settings_file_and_lists_files_written_before_it()
    {
        using var folder = new TempFolder();
        const string previous = """{ "namespace": "Old.Model" }""";
        folder.Write("builderSettings.json", previous);
        var engine = new ScriptedEngine((_, _) =>
        {
            folder.Write("builderSettings.json", """{ "namespace": "Contoso.Model" }""");
            folder.Write("Entities/account.cs", "class Account {}");
            return new EngineOutcome(2, new IOException("The disk is full."), "The disk is full.");
        });
        var job = Job(Settings.Valid(folder.Path));

        new EarlyBoundGeneratorRun(engine).Execute(job, new FakeMetadataService());

        var dto = job.ToDto();
        Assert.Equal(JobStates.Failed, dto.State);
        Assert.Equal(FailureKinds.Folder, dto.ErrorKind);
        Assert.Contains("The disk is full.", dto.Error);
        var file = Assert.Single(dto.Files);
        Assert.Equal(Path.Combine("Entities", "account.cs"), file.Path);
        Assert.Equal(previous, File.ReadAllText(Path.Combine(folder.Path, "builderSettings.json")));
    }

    [Fact]
    public void Failure_removes_a_settings_file_the_failed_run_created()
    {
        using var folder = new TempFolder();
        var engine = new ScriptedEngine((_, _) =>
        {
            folder.Write("builderSettings.json", "{}");
            return new EngineOutcome(2, null, "Exiting program with exit code 2");
        });
        var job = Job(Settings.Valid(folder.Path));

        new EarlyBoundGeneratorRun(engine).Execute(job, new FakeMetadataService());

        Assert.Equal(JobStates.Failed, job.State);
        Assert.False(File.Exists(Path.Combine(folder.Path, "builderSettings.json")));
        Assert.Equal("Exiting program with exit code 2", job.ToDto().Error);
    }

    [Fact]
    public void Folder_access_and_connection_failures_get_their_own_kind()
    {
        Assert.Equal(
            ("You do not have permission to write to this folder.", FailureKinds.FolderAccess),
            EarlyBoundGeneratorFaults.Describe(new EngineOutcome(2, new UnauthorizedAccessException("denied"), null), false));

        var (_, kind) = EarlyBoundGeneratorFaults.Describe(
            new EngineOutcome(2, new CommunicationException("The connection was closed."), null),
            false);
        Assert.Equal(FailureKinds.Connection, kind);
    }

    [Fact]
    public void Files_older_than_the_run_are_not_listed()
    {
        using var folder = new TempFolder();
        var old = folder.Write("Entities/old.cs", "class Old {}");
        File.SetLastWriteTimeUtc(old, DateTime.UtcNow.AddHours(-1));
        var engine = new ScriptedEngine((_, _) =>
        {
            folder.Write("Entities/account.cs", "class Account {}");
            return new EngineOutcome(0, null, null);
        });
        var job = Job(Settings.Valid(folder.Path));

        new EarlyBoundGeneratorRun(engine).Execute(job, new FakeMetadataService());

        Assert.Equal(["account"], job.ToDto().Files.Select(file => file.Name));
        Assert.True(File.Exists(old));
    }
}

public sealed class EarlyBoundGeneratorJobStoreTests
{
    private static readonly OnlineConnectionContext Connection = new("https://dev.example.test", "token");

    [Fact]
    public void A_second_job_is_refused_while_one_is_queued_or_running()
    {
        var store = new InMemoryEarlyBoundGeneratorJobStore();
        var settings = Settings.Valid("/out");

        var first = store.TryEnqueue(settings, Connection);
        Assert.NotNull(first);
        Assert.Null(store.TryEnqueue(settings, Connection));

        Assert.Same(first, store.DequeueNext());
        first!.MarkRunning();
        Assert.Equal(JobStates.Running, first.State);
        Assert.Null(store.TryEnqueue(settings, Connection));

        first.Succeed([], TimeSpan.FromSeconds(1));
        var second = store.TryEnqueue(settings, Connection);
        Assert.NotNull(second);
        Assert.NotEqual(first.Id, second!.Id);
        Assert.Same(first, store.Get(first.Id));
    }

    [Fact]
    public void The_log_keeps_only_the_newest_lines()
    {
        var job = new EarlyBoundGeneratorJob(Settings.Valid("/out"), Connection);
        for (var i = 0; i < EarlyBoundGeneratorJob.MaxLogLines + 10; i++) job.Log($"line {i}");

        var log = job.ToDto().Log;
        Assert.Equal(EarlyBoundGeneratorJob.MaxLogLines, log.Count);
        Assert.Equal("line 10", log[0]);
    }
}

public sealed class EarlyBoundGeneratorFolderTests
{
    [Fact]
    public void Loads_settings_from_builderSettings_json()
    {
        using var folder = new TempFolder();
        folder.Write("builderSettings.json", """
            {
              "suppressINotifyPattern": true,
              "namespace": "Contoso.Model",
              "serviceContextName": "Ctx",
              "generateSdkMessages": true,
              "entityTypesFolder": "Tables",
              "entityNamesFilter": ["account", "contact"],
              "messageNamesFilter": "new_a;new_b",
              "emitEntityETC": "yes"
            }
            """);

        var info = EarlyBoundGeneratorFolder.Inspect(folder.Path);

        Assert.True(info.Exists);
        Assert.False(info.HasOtherFiles);
        Assert.Null(info.SettingsError);
        var settings = info.Settings!;
        Assert.Equal("Contoso.Model", settings.Namespace);
        Assert.Equal("Ctx", settings.ServiceContextName);
        Assert.True(settings.GenerateSdkMessages);
        Assert.True(settings.SuppressINotifyPattern);
        Assert.Equal("Tables", settings.EntityTypesFolder);
        Assert.Equal(["account", "contact"], settings.EntityNamesFilter);
        Assert.Equal(["new_a", "new_b"], settings.MessageNamesFilter);
        Assert.Null(settings.EmitEntityETC);
        Assert.Null(settings.OptionSetsTypesFolder);
    }

    [Fact]
    public void Reports_an_unreadable_settings_file_and_other_files()
    {
        using var folder = new TempFolder();
        folder.Write("builderSettings.json", "{ not json");
        folder.Write("Program.cs", "class P {}");

        var info = EarlyBoundGeneratorFolder.Inspect(folder.Path);

        Assert.True(info.HasOtherFiles);
        Assert.Null(info.Settings);
        Assert.False(string.IsNullOrWhiteSpace(info.SettingsError));
    }

    [Fact]
    public void An_empty_folder_has_no_files_and_no_settings()
    {
        using var folder = new TempFolder();

        var info = EarlyBoundGeneratorFolder.Inspect(folder.Path);

        Assert.True(info.Exists);
        Assert.False(info.HasOtherFiles);
        Assert.Null(info.Settings);
        Assert.Null(info.SettingsError);
    }

    [Fact]
    public void Preserved_keys_leave_out_every_key_the_form_controls()
    {
        var preserved = EarlyBoundGeneratorFolder.PreservedKeys("""
            { "namespace": "A", "Language": "VB", "entityNamesFilter": [], "generateActions": false, "custom": { "x": 1 } }
            """);

        Assert.Equal(["generateActions", "custom"], preserved.Select(pair => pair.Key));
        Assert.Empty(EarlyBoundGeneratorFolder.PreservedKeys("{ broken"));
        Assert.Empty(EarlyBoundGeneratorFolder.PreservedKeys(null));
    }
}
