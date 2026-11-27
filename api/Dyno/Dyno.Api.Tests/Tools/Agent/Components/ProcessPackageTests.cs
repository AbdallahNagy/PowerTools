using System.IO.Compression;
using System.Xml.Linq;
using Dyno.Api.Tools.Agent;
using Dyno.Api.Tools.Agent.Components.Processes;
using Xunit;

namespace Dyno.Api.Tests.Tools.Agent.Components;

/// <summary>The solution file process_apply imports must look like a classic designer export, byte for byte where the import cares.</summary>
public sealed class ProcessPackageTests
{
    private static readonly PublisherInfo Publisher = new(Guid.NewGuid(), "contoso", "contoso", 10000, "Contoso");

    private static ProcessDefinition Process(ProcessKind kind) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Notify owner",
        Kind = kind,
        PrimaryEntity = "account",
        Xaml = ProcessXamlTests.Fixture("LocalPermitSLAPermitOfficer"),
        UniqueName = kind == ProcessKind.Action ? "NotifyOwner" : null,
    };

    [Theory]
    [InlineData(ProcessKind.Workflow)]
    [InlineData(ProcessKind.Action)]
    public void No_entry_starts_with_a_byte_order_mark(ProcessKind kind)
    {
        using var zip = Open(ProcessPackage.Build("DynoProcessTest", Publisher, "9.2.26112.0", Process(kind)));

        Assert.Equal(4, zip.Entries.Count);
        foreach (var entry in zip.Entries)
        {
            var bytes = Read(entry);
            Assert.True(bytes.Length > 0, entry.FullName);
            Assert.Equal((byte)'<', bytes[0]);
        }
    }

    [Fact]
    public void The_xaml_entry_is_the_process_xaml_and_parses_from_its_first_character()
    {
        var process = Process(ProcessKind.Workflow);
        using var zip = Open(ProcessPackage.Build("DynoProcessTest", Publisher, "9.2.26112.0", process));

        var customizations = XDocument.Parse(Text(zip.GetEntry("customizations.xml")!));
        var fileName = customizations.Descendants("XamlFileName").Single().Value;
        var xaml = Text(zip.GetEntry(fileName.TrimStart('/'))!);

        Assert.Equal(process.Xaml, xaml);
        // As the import reads it: the text as it stands, with nothing before the root element.
        Assert.Equal("Activity", XDocument.Parse(xaml).Root!.Name.LocalName);
    }

    private static ZipArchive Open(byte[] file) => new(new MemoryStream(file), ZipArchiveMode.Read);

    private static byte[] Read(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }

    // Decodes without skipping a byte order mark, so a stray one shows up as U+FEFF and fails the parse.
    private static string Text(ZipArchiveEntry entry) => new System.Text.UTF8Encoding(false).GetString(Read(entry));
}
