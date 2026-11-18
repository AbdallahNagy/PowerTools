using System.Xml.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Services;
using PowerTools.API.Tools.Translator;
using Xunit;

namespace PowerTools.API.Tests.Tools.Translator;

public sealed class TranslatorFormTests
{
    private static readonly Guid FormId = Guid.Parse("a1000000-0000-0000-0000-000000000001");
    private const string TabId = "{B1000000-0000-0000-0000-000000000001}";
    private const string SectionId = "{C1000000-0000-0000-0000-000000000001}";
    private const string BareSectionId = "{C2000000-0000-0000-0000-000000000002}";

    private const string FormXml =
        "<form><tabs>" +
        $"<tab name=\"general\" id=\"{TabId}\" showlabel=\"true\"><labels><label description=\"General\" languagecode=\"1033\" /></labels>" +
        "<columns><column width=\"100%\"><sections>" +
        $"<section name=\"details\" id=\"{SectionId}\"><labels><label description=\"Details\" languagecode=\"1033\" /><label description=\"Détails\" languagecode=\"1036\" /></labels><rows /></section>" +
        $"<section name=\"bare\" id=\"{BareSectionId}\"><rows /></section>" +
        "</sections></column></columns></tab>" +
        "</tabs></form>";

    private static readonly DataverseConnectionContext Connection =
        new OnlineConnectionContext("https://dev.example.test", "token");

    private static Entity Form(string xml = FormXml, bool customizable = true) =>
        new(TranslatorForms.EntityName, FormId)
        {
            ["name"] = "Information",
            ["objecttypecode"] = "account",
            ["type"] = new OptionSetValue(2),
            ["formactivationstate"] = new OptionSetValue(1),
            ["formxml"] = xml,
            ["iscustomizable"] = new BooleanManagedProperty(customizable),
        };

    private static LabelKeyDto Key(string property, string element) =>
        new()
        {
            Kind = LabelKinds.Form, Table = "account", RecordId = FormId,
            Element = TranslatorForms.NormalizeId(element), Property = property,
        };

    private static ApplyRowDto Row(LabelKeyDto key, params (int Lcid, string Text)[] labels) =>
        new() { Key = key, Labels = labels.ToDictionary(label => label.Lcid, label => label.Text) };

    [Fact]
    public void Elements_lists_tabs_then_their_sections_with_labels()
    {
        var elements = TranslatorForms.Elements(FormXml);

        Assert.Equal(
            [LabelProperties.TabLabel, LabelProperties.SectionLabel, LabelProperties.SectionLabel],
            elements.Select(element => element.Property));
        Assert.Equal("General", elements[0].Labels[1033]);
        Assert.Equal("Détails", elements[1].Labels[1036]);
        Assert.Empty(elements[2].Labels);
    }

    [Fact]
    public async Task Query_returns_tab_and_section_rows_in_form_order()
    {
        var fake = new FakeTranslatorClient();
        fake.Records[TranslatorForms.EntityName] = [Form()];

        var result = await new TranslatorService(fake).QueryLabelsAsync(
            new LabelQueryBody { Tables = ["account"], Kinds = [LabelKinds.Form] },
            default);

        Assert.Null(result.Problem);
        var rows = result.Value!.Rows;
        Assert.Equal(["General", "Details", "bare"], rows.Select(row => row.Component));
        Assert.Equal([0, 1, 2], rows.Select(row => row.Position!.Value));
        Assert.All(rows, row => Assert.Equal("Information (Main)", row.Detail));
        Assert.Equal("c1000000-0000-0000-0000-000000000001", rows[1].Key.Element);
        Assert.Equal("Détails", rows[1].Labels[1036]);
        var query = fake.Queries.Single(item => item.EntityName == TranslatorForms.EntityName);
        Assert.Contains(query.Criteria.Conditions, condition => condition.AttributeName == "formactivationstate");
    }

    [Fact]
    public async Task Query_marks_non_customizable_forms_read_only()
    {
        var fake = new FakeTranslatorClient();
        fake.Records[TranslatorForms.EntityName] = [Form(customizable: false)];

        var result = await new TranslatorService(fake).QueryLabelsAsync(
            new LabelQueryBody { Tables = ["account"], Kinds = [LabelKinds.Form] },
            default);

        Assert.All(result.Value!.Rows, row => Assert.Equal("This form is not customizable.", row.ReadOnlyReason));
    }

    [Fact]
    public void Merge_changes_only_the_given_languages_and_adds_missing_labels()
    {
        var (xml, missing) = TranslatorForms.Merge(FormXml,
        [
            Row(Key(LabelProperties.TabLabel, TabId), (1036, "Général")),
            Row(Key(LabelProperties.SectionLabel, SectionId), (1036, "Infos")),
            Row(Key(LabelProperties.SectionLabel, BareSectionId), (1036, "Nu")),
        ]);

        Assert.Empty(missing);
        var elements = TranslatorForms.Elements(xml);
        Assert.Equal("General", elements[0].Labels[1033]);
        Assert.Equal("Général", elements[0].Labels[1036]);
        Assert.Equal("Details", elements[1].Labels[1033]);
        Assert.Equal("Infos", elements[1].Labels[1036]);
        Assert.Equal("Nu", elements[2].Labels[1036]);
        // Other attributes are kept.
        Assert.Equal("true", (string?)XDocument.Parse(xml).Descendants("tab").Single().Attribute("showlabel"));
    }

    [Fact]
    public void Merge_reports_tabs_and_sections_that_are_gone()
    {
        var gone = Row(Key(LabelProperties.TabLabel, "{D0000000-0000-0000-0000-000000000000}"), (1036, "X"));
        // A section id is not matched as a tab.
        var wrongType = Row(Key(LabelProperties.TabLabel, SectionId), (1036, "Y"));

        var (_, missing) = TranslatorForms.Merge(FormXml, [gone, wrongType]);

        Assert.Equal([gone, wrongType], missing);
    }

    [Fact]
    public async Task Apply_updates_formxml_once_per_form_publishes_the_table_and_adds_the_form_to_a_solution()
    {
        var fake = new FakeTranslatorClient();
        fake.FormXml[FormId] = FormXml;
        fake.Records["solution"] =
        [
            new Entity("solution", Guid.NewGuid())
            {
                ["uniquename"] = "Labels", ["friendlyname"] = "Labels", ["ismanaged"] = false, ["isvisible"] = true,
            },
        ];
        var service = new TranslatorService(fake);
        var prepared = await service.PrepareApplyAsync(
            new ApplyBody
            {
                Rows =
                [
                    Row(Key(LabelProperties.TabLabel, TabId), (1036, "Général")),
                    Row(Key(LabelProperties.SectionLabel, SectionId), (1036, "Infos")),
                ],
                Solution = new ApplySolutionDto { UniqueName = "Labels" },
            },
            default);
        Assert.Null(prepared.Problem);
        var job = new TranslatorJob(prepared.Value!, Connection);

        await new TranslatorApply(fake, new NoDelay()).RunAsync(job, CancellationToken.None);

        var dto = job.ToDto();
        Assert.Equal(2, dto.Succeeded);
        Assert.Equal([FormId], fake.FormReads);
        var update = Assert.IsType<UpdateRequest>(fake.Batches[0].Single());
        Assert.Equal(FormId, update.Target.Id);
        var elements = TranslatorForms.Elements(update.Target.GetAttributeValue<string>("formxml"));
        Assert.Equal("Général", elements[0].Labels[1036]);
        Assert.Equal("Infos", elements[1].Labels[1036]);
        Assert.Contains("<entity>account</entity>", fake.Published.Single());
        var add = fake.Batches.Skip(1).SelectMany(batch => batch).Single();
        Assert.Equal(SolutionComponentTypes.SystemForm, (int)add["ComponentType"]);
        Assert.Equal(FormId, (Guid)add["ComponentId"]);
    }

    [Fact]
    public async Task Apply_skips_forms_that_no_longer_exist()
    {
        var fake = new FakeTranslatorClient();
        var service = new TranslatorService(fake);
        var prepared = await service.PrepareApplyAsync(
            new ApplyBody { Rows = [Row(Key(LabelProperties.TabLabel, TabId), (1036, "Général"))] },
            default);
        var job = new TranslatorJob(prepared.Value!, Connection);

        await new TranslatorApply(fake, new NoDelay()).RunAsync(job, CancellationToken.None);

        var result = job.ToDto().Results.Single();
        Assert.Equal(ApplyOutcomes.Skipped, result.Outcome);
        Assert.Equal("This form no longer exists.", result.Message);
        Assert.Empty(fake.Batches);
    }

    [Fact]
    public void Validation_requires_a_form_id_and_element()
    {
        var key = Key(LabelProperties.TabLabel, TabId);
        Assert.Null(TranslatorValidation.KeyProblem(key));
        key.Element = null;
        Assert.NotNull(TranslatorValidation.KeyProblem(key));
        Assert.NotNull(TranslatorValidation.KeyProblem(new LabelKeyDto
        {
            Kind = LabelKinds.Form, Table = "account", RecordId = FormId, Element = "x", Property = LabelProperties.RecordName,
        }));
        Assert.Equal(TranslatorValidation.BaseRequiredMessage,
            TranslatorValidation.ValueProblem(key, 1033, " ", 1033, new HashSet<int> { 1033 }));
    }
}
