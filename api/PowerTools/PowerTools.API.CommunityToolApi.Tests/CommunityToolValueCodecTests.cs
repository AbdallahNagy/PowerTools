using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.CommunityToolApi;
using Xunit;

namespace PowerTools.API.CommunityToolApi.Tests;

public sealed class CommunityToolValueCodecTests
{
    [Theory]
    [InlineData("""{"$type":"EntityReference","logicalName":"account","id":"6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10","name":"Contoso"}""", typeof(EntityReference))]
    [InlineData("""{"$type":"EntityReference","logicalName":"account","id":"6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10"}""", typeof(EntityReference))]
    [InlineData("""{"$type":"OptionSetValue","value":3}""", typeof(OptionSetValue))]
    [InlineData("""{"$type":"Money","value":12.5}""", typeof(Money))]
    [InlineData("""{"$type":"DateTime","value":"2026-11-11T08:30:00.000Z"}""", typeof(DateTime))]
    [InlineData("""{"$type":"Guid","value":"6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10"}""", typeof(Guid))]
    [InlineData("""{"$type":"OptionSetValueCollection","values":[1,2]}""", typeof(OptionSetValueCollection))]
    [InlineData("\"text\"", typeof(string))]
    [InlineData("42", typeof(int))]
    [InlineData("9000000000", typeof(long))]
    [InlineData("1.5", typeof(decimal))]
    [InlineData("true", typeof(bool))]
    public void Values_round_trip(string json, Type sdkType)
    {
        var decoded = CommunityToolValueCodec.Decode(Json.Element(json), "values.x");

        Assert.IsType(sdkType, decoded);
        Assert.Equal(Json.Compact(json), Json.Serialize(CommunityToolValueCodec.Encode(decoded)));
    }

    [Fact]
    public void Null_round_trips()
    {
        Assert.Null(CommunityToolValueCodec.Decode(Json.Element("null"), "values.x"));
        Assert.Equal("null", Json.Serialize(CommunityToolValueCodec.Encode(null)));
    }

    [Fact]
    public void Decoded_values_carry_their_content()
    {
        var reference = Assert.IsType<EntityReference>(CommunityToolValueCodec.Decode(
            Json.Element("""{"$type":"EntityReference","logicalName":"account","id":"6F1C2B1E-0A4D-4C58-9B3E-2F6A7D8E9C10","name":"Contoso"}"""),
            "values.parentaccountid"));
        Assert.Equal("account", reference.LogicalName);
        Assert.Equal(Guid.Parse("6f1c2b1e-0a4d-4c58-9b3e-2f6a7d8e9c10"), reference.Id);
        Assert.Equal("Contoso", reference.Name);

        var date = Assert.IsType<DateTime>(CommunityToolValueCodec.Decode(
            Json.Element("""{"$type":"DateTime","value":"2026-11-11T10:30:00+02:00"}"""), "values.x"));
        Assert.Equal(DateTimeKind.Utc, date.Kind);
        Assert.Equal(new DateTime(2026, 11, 11, 8, 30, 0, DateTimeKind.Utc), date);

        var options = Assert.IsType<OptionSetValueCollection>(CommunityToolValueCodec.Decode(
            Json.Element("""{"$type":"OptionSetValueCollection","values":[4,7]}"""), "values.x"));
        Assert.Equal([4, 7], options.Select(option => option.Value));
    }

    [Fact]
    public void Entity_reference_out_of_dataverse_includes_name()
    {
        var id = Guid.NewGuid();
        var encoded = CommunityToolValueCodec.Encode(new EntityReference("contact", id) { Name = "Ada Lovelace" });

        Assert.Equal(
            $$$"""{"$type":"EntityReference","logicalName":"contact","id":"{{{id}}}","name":"Ada Lovelace"}""",
            Json.Serialize(encoded));
    }

    [Fact]
    public void Aliased_values_are_unwrapped()
    {
        var encoded = CommunityToolValueCodec.Encode(new AliasedValue("account", "statecode", new OptionSetValue(1)));

        Assert.Equal("""{"$type":"OptionSetValue","value":1}""", Json.Serialize(encoded));
    }

    [Fact]
    public void Entities_and_collections_encode_with_tagged_values()
    {
        var id = Guid.NewGuid();
        var entity = new Entity("account", id) { ["name"] = "Contoso", ["revenue"] = new Money(10m) };
        var encoded = CommunityToolValueCodec.Encode(new EntityCollection([entity]));

        Assert.Equal(
            $$$$"""{"$type":"EntityCollection","entities":[{"$type":"Entity","logicalName":"account","id":"{{{{id}}}}","values":{"name":"Contoso","revenue":{"$type":"Money","value":10}}}]}""",
            Json.Serialize(encoded));
    }

    [Fact]
    public void Unknown_result_types_encode_as_text()
    {
        Assert.Equal("\"System.Object\"", Json.Serialize(CommunityToolValueCodec.Encode(new object())));
    }

    [Fact]
    public void Entities_and_collections_decode()
    {
        var id = Guid.NewGuid();
        var collection = Assert.IsType<EntityCollection>(CommunityToolValueCodec.Decode(
            Json.Element($$$$"""
            {"$type":"EntityCollection","entities":[
              {"$type":"Entity","logicalName":"activityparty","values":{"partyid":{"$type":"EntityReference","logicalName":"contact","id":"{{{{id}}}}"}}},
              {"$type":"Entity","logicalName":"activityparty","id":"{{{{id}}}}","values":{"addressused":"a@example.com"}}
            ]}
            """),
            "parameters.Target"));

        Assert.Equal(2, collection.Entities.Count);
        Assert.Equal("activityparty", collection.Entities[0].LogicalName);
        Assert.Equal(Guid.Empty, collection.Entities[0].Id);
        Assert.Equal(id, collection.Entities[0].GetAttributeValue<EntityReference>("partyid").Id);
        Assert.Equal(id, collection.Entities[1].Id);
        Assert.Equal("a@example.com", collection.Entities[1]["addressused"]);
    }

    [Theory]
    [InlineData("""{"$type":"Foo","value":1}""", "Foo")]
    [InlineData("""{"value":1}""", "$type")]
    [InlineData("""{"$type":"EntityReference","logicalName":"account","id":"nope"}""", "id")]
    [InlineData("""{"$type":"OptionSetValue","value":"x"}""", "value")]
    [InlineData("""{"$type":"DateTime","value":"tomorrow"}""", "value")]
    [InlineData("""[1,2]""", "array")]
    public void Malformed_values_name_the_problem(string json, string mentioned)
    {
        var error = Assert.Throws<CommunityToolValueException>(() =>
            CommunityToolValueCodec.Decode(Json.Element(json), "values.x"));

        Assert.Contains(mentioned, error.Message);
        Assert.Contains("values.x", error.Message);
    }
}
