using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.EarlyBound;
using Xunit;

namespace PowerTools.API.EarlyBound.Tests;

public sealed class EarlyBoundCodeWriterTests
{
    private static EarlyBoundTable Account() => new(
        "account",
        "Account",
        "Account",
        [
            new EarlyBoundColumn("name", "Name", "Account Name", EarlyBoundColumnKind.String),
            new EarlyBoundColumn("accountid", "AccountId", "Account", EarlyBoundColumnKind.Guid, IsPrimaryId: true),
            new EarlyBoundColumn("revenue", "Revenue", "Annual Revenue", EarlyBoundColumnKind.Money),
            new EarlyBoundColumn("parentaccountid", "ParentAccountId", "Parent Account", EarlyBoundColumnKind.Lookup),
            new EarlyBoundColumn("createdon", "CreatedOn", "Created On", EarlyBoundColumnKind.DateTime, IsReadOnly: true),
            new EarlyBoundColumn(
                "industrycode",
                "IndustryCode",
                "Industry",
                EarlyBoundColumnKind.Choice,
                Options: [new EarlyBoundOption(2, "Agriculture & Food"), new EarlyBoundOption(1, "Accounting")]),
        ]);

    [Fact]
    public void Writes_a_class_with_constants_and_typed_properties()
    {
        var code = EarlyBoundCodeWriter.Write("Contoso.Model", [Account()]);

        Assert.Contains("namespace Contoso.Model", code);
        Assert.Contains("[Microsoft.Xrm.Sdk.Client.EntityLogicalNameAttribute(\"account\")]", code);
        Assert.Contains("public partial class Account : Entity", code);
        Assert.Contains("public const string EntityLogicalName = \"account\";", code);
        Assert.Contains("public const string Name = \"name\";", code);
        Assert.Contains("public Account() : base(EntityLogicalName) { }", code);
        Assert.Contains("public string Name", code);
        Assert.Contains("public Money Revenue", code);
        Assert.Contains("public EntityReference ParentAccountId", code);
        Assert.Contains("/// <summary>Account Name</summary>", code);
    }

    [Fact]
    public void Writes_choices_as_enums_sorted_by_value()
    {
        var code = EarlyBoundCodeWriter.Write("Contoso.Model", [Account()]);

        Assert.Contains("public Account_IndustryCode? IndustryCode", code);
        Assert.Contains("public enum Account_IndustryCode", code);
        var accounting = code.IndexOf("Accounting = 1,", StringComparison.Ordinal);
        var agriculture = code.IndexOf("AgricultureFood = 2,", StringComparison.Ordinal);
        Assert.True(accounting > 0 && agriculture > accounting);
    }

    [Fact]
    public void Read_only_columns_have_no_setter_and_the_primary_id_sets_the_record_id()
    {
        var code = EarlyBoundCodeWriter.Write("Contoso.Model", [Account()]);

        var createdOn = Block(code, "public DateTime? CreatedOn");
        Assert.DoesNotContain("set", createdOn);
        Assert.Contains("base.Id = value ?? Guid.Empty;", Block(code, "public Guid? AccountId"));
    }

    [Fact]
    public void Renames_members_that_would_not_compile()
    {
        var table = new EarlyBoundTable(
            "new_item",
            "new_Item",
            "Item",
            [
                new EarlyBoundColumn("new_item", "new_Item", "Item", EarlyBoundColumnKind.String),
                new EarlyBoundColumn("id", "Id", "Id", EarlyBoundColumnKind.String),
                new EarlyBoundColumn("new_1st", "new_1st", "First", EarlyBoundColumnKind.String),
                new EarlyBoundColumn(
                    "new_kind",
                    "new_Kind",
                    "Kind",
                    EarlyBoundColumnKind.Choice,
                    Options: [new EarlyBoundOption(1, "Same"), new EarlyBoundOption(2, "Same"), new EarlyBoundOption(3, "")]),
            ]);

        var code = EarlyBoundCodeWriter.Write("Contoso.Model", [table]);

        Assert.Contains("public string new_ItemAttribute", code);
        Assert.Contains("public string IdAttribute", code);
        Assert.Contains("public string new_1st", code);
        Assert.Contains("Same = 1,", code);
        Assert.Contains("Same_2 = 2,", code);
        Assert.Contains("Value3 = 3,", code);
    }

    [Fact]
    public void Escapes_display_names_in_comments()
    {
        var table = new EarlyBoundTable("x", "X", "A <b> & c", []);

        var code = EarlyBoundCodeWriter.Write("Contoso.Model", [table]);

        Assert.Contains("/// <summary>A &lt;b&gt; &amp; c</summary>", code);
    }

    [Theory]
    [InlineData("Contoso.Model", true)]
    [InlineData("Contoso", true)]
    [InlineData("Contoso..Model", false)]
    [InlineData("1Contoso", false)]
    [InlineData("Contoso.class", false)]
    [InlineData("Contoso Model", false)]
    public void Validates_namespaces(string value, bool valid) =>
        Assert.Equal(valid, EarlyBoundCodeWriter.IsValidNamespace(value));

    [Fact]
    public void Maps_column_metadata_to_kinds()
    {
        var name = new StringAttributeMetadata { LogicalName = "name", SchemaName = "Name", DisplayName = Label("Account Name") };
        var choice = new PicklistAttributeMetadata
        {
            LogicalName = "industrycode",
            SchemaName = "IndustryCode",
            OptionSet = new OptionSetMetadata(new OptionMetadataCollection([new OptionMetadata(Label("Accounting"), 1)])),
        };
        var file = new FileAttributeMetadata { LogicalName = "new_file", SchemaName = "new_File" };

        var mappedName = EarlyBoundMetadata.ToColumn(name);
        var mappedChoice = EarlyBoundMetadata.ToColumn(choice);

        Assert.Equal(EarlyBoundColumnKind.String, mappedName!.Kind);
        Assert.Equal("Account Name", mappedName.DisplayName);
        Assert.Equal(EarlyBoundColumnKind.Choice, mappedChoice!.Kind);
        Assert.Equal([new EarlyBoundOption(1, "Accounting")], mappedChoice.Options);
        Assert.Null(EarlyBoundMetadata.ToColumn(file));
    }

    private static Label Label(string text) => new(text, 1033);

    private static string Block(string code, string header)
    {
        var start = code.IndexOf(header, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing {header}");
        var end = code.IndexOf("\n        }\n", start, StringComparison.Ordinal);
        return code[start..end];
    }
}
