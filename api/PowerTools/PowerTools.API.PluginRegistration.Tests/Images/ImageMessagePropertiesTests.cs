using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class ImageMessagePropertiesTests
{
    [Theory]
    [InlineData("Create", "Id")]
    [InlineData("Update", "Target")]
    [InlineData("Delete", "Target")]
    [InlineData("SetState", "EntityMoniker")]
    [InlineData("CreateMultiple", "Ids")]
    [InlineData("Send", "EmailId")]
    public void Maps_known_messages(string message, string property)
    {
        Assert.True(ImageMessageProperties.TryGet(message, out var actual));
        Assert.Equal(property, actual);
    }

    [Fact]
    public void Rejects_unknown_messages()
    {
        Assert.False(ImageMessageProperties.TryGet("Retrieve", out _));
    }
}
