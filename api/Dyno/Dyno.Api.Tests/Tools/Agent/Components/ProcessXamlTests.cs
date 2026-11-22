using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Xrm.Sdk.Metadata;
using Dyno.Api.Tools.Agent.Components.Processes;
using Xunit;
using Xunit.Abstractions;

namespace Dyno.Api.Tests.Tools.Agent.Components;

/// <summary>
/// The reader and writer against real exported workflows (TestFixtures/ClassicWorkflows): reading a fixture, writing
/// it back and reading that again must give the same steps, so a process read with inspect_solution survives
/// process_apply.
/// </summary>
public sealed class ProcessXamlTests(ITestOutputHelper output)
{
    private static readonly string Folder = Path.Combine(AppContext.BaseDirectory, "Tools", "Agent", "TestFixtures", "ClassicWorkflows", "Workflows");

    public static TheoryData<string> Fixtures()
    {
        var data = new TheoryData<string>();
        foreach (var file in Directory.GetFiles(Folder, "*.xaml").Order(StringComparer.Ordinal)) data.Add(Path.GetFileName(file));
        return data;
    }

    internal static string Fixture(string prefix) =>
        File.ReadAllText(Directory.GetFiles(Folder, prefix + "*.xaml").Single());

    [Theory]
    [MemberData(nameof(Fixtures))]
    public void Every_fixture_reads_writes_and_reads_back_the_same(string file)
    {
        var xaml = File.ReadAllText(Path.Combine(Folder, file));
        var first = ProcessXamlReader.Read(xaml);
        Assert.Empty(first.Problems);
        Assert.NotEmpty(first.Steps);
        output.WriteLine($"{file}: {Count(first.Steps)} step(s), kept {string.Join(", ", first.Keeps.Keys)}");

        var written = Write(first, xaml);
        var second = ProcessXamlReader.Read(written);

        Assert.Empty(second.Problems);
        Assert.Equal(first.Steps.ToJsonString(), second.Steps.ToJsonString());
        Assert.Equal(first.Keeps.Keys.Order(), second.Keeps.Keys.Order());
        Assert.True(JsonNode.DeepEquals(JsonSerializer.SerializeToNode(first.Arguments), JsonSerializer.SerializeToNode(second.Arguments)));
    }

    [Theory]
    [InlineData("LocalPermitSLAPermitOfficer")]
    [InlineData("WFLocalPermitOnChangeProvider")]
    [InlineData("WFLocalPermitAutofinishBPF")]
    [InlineData("LocalPermitProviderFailureAction")]
    [InlineData("ActionProvider-RenewalMainAction")]
    [InlineData("TestWorkflow-SendEmail-Assign")]
    public void Fixtures_made_only_of_supported_steps_keep_nothing(string prefix)
    {
        var reading = ProcessXamlReader.Read(Fixture(prefix));

        Assert.Empty(reading.Keeps);
    }

    [Theory]
    [InlineData("LocalPermitSLAPermitOfficer")]
    [InlineData("WFLocalPermitOnChangeProvider")]
    [InlineData("WFLocalPermitAutofinishBPF")]
    [InlineData("LocalPermitProviderFailureAction")]
    [InlineData("ActionProvider-RenewalMainAction")]
    [InlineData("TestWorkflow-SendEmail-Assign")]
    public void A_written_fixture_matches_the_designer_output_activity_for_activity(string prefix)
    {
        var xaml = Fixture(prefix);
        var reading = ProcessXamlReader.Read(xaml);

        var written = Write(reading, xaml);

        Assert.Equal(Shape(XElement.Parse(xaml)), Shape(XElement.Parse(written)));
    }

    [Fact]
    public void Send_email_and_assign_read_into_typed_steps()
    {
        var reading = ProcessXamlReader.Read(Fixture("TestWorkflow-SendEmail-Assign"));

        var email = reading.Steps[0]!["sendEmail"]!;
        Assert.Equal("systemuser", email["from"]!["lookup"]!["table"]!.GetValue<string>());
        Assert.Equal(2, email["to"]!.AsArray().Count + email["cc"]!.AsArray().Count);
        Assert.Equal("Test", email["subject"]!.GetValue<string>());
        Assert.Equal("Dear,<br>This is a test email", email["body"]!.GetValue<string>());
        Assert.Null(email["regarding"]);
        Assert.Equal(1, email["values"]!["prioritycode"]!.GetValue<int>());
        Assert.Equal("systemuser", reading.Steps[1]!["assign"]!["owner"]!["lookup"]!["table"]!.GetValue<string>());
        Assert.NotNull(reading.Steps[2]!["setState"]);
    }

    [Fact]
    public void A_dispatcher_action_reads_its_argument_conditions_and_child_workflows()
    {
        var reading = ProcessXamlReader.Read(Fixture("ActionProvider-RenewalMainAction"));

        Assert.Contains(reading.Arguments, a => a.Name == "StageId");
        var first = reading.Steps.Select(s => s!["if"]).First(s => s is not null)!;
        Assert.Equal("StageId", first["condition"]!["argument"]!.GetValue<string>());
        Assert.NotEmpty(reading.ChildWorkflows);
    }

    /// <summary>Writes a reading back with a catalog built from what the XAML itself says about the environment.</summary>
    internal static string Write(ProcessReading reading, string xaml)
    {
        var root = XElement.Parse(xaml);
        var id = Guid.ParseExact(root.Attribute(XName.Get("Class", "http://schemas.microsoft.com/winfx/2006/xaml"))!.Value["XrmWorkflow".Length..], "N");
        // A workflow that only touches related records does not name its own table; customizations.xml does.
        var exported = Exported(id);
        reading.Table ??= exported?.Element("PrimaryEntity")?.Value.ToLowerInvariant();
        var mode = exported?.Element("Mode")?.Value == "0" ? ProcessMode.Background : ProcessMode.Realtime;
        var catalog = Catalog(reading, xaml.Contains("ArgumentTargetAttribute", StringComparison.Ordinal) ? ProcessKind.Action : ProcessKind.Workflow, mode);
        var steps = reading.Steps.Deserialize<List<ProcessStep>>(JsonSerializerOptions.Web)!;
        return ProcessXamlWriter.Write(id, steps, catalog);
    }

    private static XElement? Exported(Guid id) =>
        XElement.Load(Path.Combine(Folder, "..", "customizations.xml")).Descendants("Workflow")
            .FirstOrDefault(w => Guid.TryParse(w.Attribute("WorkflowId")?.Value, out var g) && g == id);

    internal static ProcessCatalog Catalog(ProcessReading reading, ProcessKind kind, ProcessMode mode = ProcessMode.Realtime)
    {
        var catalog = new ProcessCatalog { Table = reading.Table!, Kind = kind, Mode = mode };
        var columns = reading.Columns.ToDictionary(c => c.Key, c => new Dictionary<string, ValueKind?>(c.Value, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase);
        foreach (var (lookup, _) in reading.Lookups)
        {
            if (!columns.TryGetValue(reading.Table!, out var primary)) columns[reading.Table!] = primary = new(StringComparer.OrdinalIgnoreCase);
            primary[lookup] = ValueKind.Ref;
        }

        foreach (var (table, tableColumns) in columns)
        {
            var metadata = new EntityMetadata { LogicalName = table };
            SchemaWorld.Set(metadata, "PrimaryIdAttribute", $"{table}id");
            var attributes = tableColumns.Select(c => Attribute(table, c.Key, c.Value, reading)).ToList();
            if (attributes.All(a => a.LogicalName != $"{table}id")) attributes.Add(Attribute(table, $"{table}id", ValueKind.Ref, reading));
            SchemaWorld.Set(metadata, "Attributes", attributes.ToArray());
            catalog.Tables[table] = metadata;
        }

        foreach (var child in reading.ChildWorkflows) catalog.ChildWorkflows[child.ToString("D")] = child;
        foreach (var (name, message) in reading.Messages) catalog.Messages[name] = message;
        foreach (var (type, aqn) in reading.CustomTypes) catalog.CustomTypes[type] = aqn;
        foreach (var (step, element) in reading.Keeps) catalog.Keeps[step] = element;
        catalog.WorkflowVariables.AddRange(reading.WorkflowVariables);
        catalog.Arguments.AddRange(reading.Arguments);
        return catalog;
    }

    private static AttributeMetadata Attribute(string table, string column, ValueKind? kind, ProcessReading reading)
    {
        AttributeMetadata attribute = kind switch
        {
            ValueKind.Choice => new PicklistAttributeMetadata(),
            ValueKind.Bool => new BooleanAttributeMetadata(),
            ValueKind.Ref or ValueKind.Party => new LookupAttributeMetadata
            {
                Targets = [string.Equals(table, reading.Table, StringComparison.OrdinalIgnoreCase) && reading.Lookups.TryGetValue(column, out var target) ? target : "account"],
            },
            ValueKind.Date => new DateTimeAttributeMetadata(),
            ValueKind.Money => new MoneyAttributeMetadata(),
            _ => new StringAttributeMetadata(),
        };
        attribute.LogicalName = column;
        if (kind == ValueKind.Party) SchemaWorld.Set(attribute, "AttributeType", AttributeTypeCode.PartyList);
        return attribute;
    }

    private static int Count(JsonArray steps) =>
        steps.Sum(s => 1 + (s?["if"] is JsonObject branch
            ? Count(branch["then"]!.AsArray()) + (branch["else"] as JsonArray is { } e ? Count(e) : 0)
              + (branch["elseIf"] as JsonArray ?? []).Sum(b => Count(b!["then"]!.AsArray()))
            : 0));

    /// <summary>The activity tree with its attributes, without namespace declarations and the class name.</summary>
    private static string Shape(XElement root)
    {
        var copy = new XElement(root);
        foreach (var e in copy.DescendantsAndSelf())
        {
            e.Attributes().Where(a => a.IsNamespaceDeclaration || a.Name.LocalName == "Class").Remove();
            if (e.Attribute("DisplayName") is { } display) display.Value = display.Value.Trim();
            e.Name = e.Name.LocalName.Contains('.') ? e.Name.LocalName[(e.Name.LocalName.IndexOf('.') + 1)..] : e.Name.LocalName;
        }

        var text = string.Join("\n", copy.Element("Workflow")!.DescendantsAndSelf().Select(e =>
            $"{e.Name.LocalName} {string.Join(" ", e.Attributes().Select(a => $"{a.Name.LocalName}={a.Value}"))} {(e.HasElements ? "" : e.Value.Trim())}"));
        // What the designer varies without meaning: step numbers (creation order), how a GUID literal is spelled,
        // and whether a record id literal says Key or UniqueIdentifier.
        text = Regex.Replace(text, @"Step\d+", "Step#");
        text = Regex.Replace(text, @"""\{?([0-9a-fA-F-]{36})\}?""", m => $"\"{m.Groups[1].Value.ToLowerInvariant()}\"");
        return text.Replace("\"Key\" }", "\"UniqueIdentifier\" }", StringComparison.Ordinal)
            .Replace("Boolean, \"True\"", "Boolean, \"1\"", StringComparison.Ordinal)
            .Replace("Boolean, \"False\"", "Boolean, \"0\"", StringComparison.Ordinal);
    }
}
