using PowerTools.API.Tools.Agent.Kernel;
using Xunit;

namespace PowerTools.API.Tests.Tools.Agent.Kernel;

/// <summary>
/// The desktop's checked-in schemas must match the C# types. To regenerate after changing a type, run the tests with
/// POWERTOOLS_UPDATE_SCHEMAS=1 and commit the files it writes.
/// </summary>
public sealed class KernelSchemaTests
{
    private static string SchemaFolder()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "desktop", "src", "electron", "mcp")))
            dir = dir.Parent;
        Assert.NotNull(dir);
        return Path.Combine(dir!.FullName, "desktop", "src", "electron", "mcp", "schemas");
    }

    public static TheoryData<string> Names() => new(KernelSchemas.Types.Keys);

    [Theory]
    [MemberData(nameof(Names))]
    public void Checked_in_schema_matches_the_csharp_type(string name)
    {
        var expected = KernelSchemas.Export(name);
        var path = Path.Combine(SchemaFolder(), $"{name}.json");
        if (Environment.GetEnvironmentVariable("POWERTOOLS_UPDATE_SCHEMAS") == "1")
            File.WriteAllText(path, expected);

        Assert.True(File.Exists(path), $"{path} is missing. Run the tests with POWERTOOLS_UPDATE_SCHEMAS=1.");
        Assert.Equal(expected, File.ReadAllText(path).ReplaceLineEndings("\n"));
    }

    [Fact]
    public void Every_checked_in_schema_has_a_type()
    {
        var files = Directory.GetFiles(SchemaFolder(), "*.json").Select(Path.GetFileNameWithoutExtension);
        Assert.All(files, name => Assert.Contains(name, KernelSchemas.Types.Keys));
    }
}
