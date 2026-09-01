using System.Diagnostics;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Performance;

public sealed class LargeCatalogTests
{
    private const int AssemblyCount = 100;
    private const int HandlersPerAssembly = 10;
    private const int StepsPerHandler = 10;
    private const int ImagesPerStep = 2;
    private static readonly TimeSpan WindowsCiThreshold = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task Complete_large_catalog_is_assembled_within_the_windows_ci_budget()
    {
        var rows = CreateRows();
        var service = new PluginRegistrationCatalogService();
        var stopwatch = Stopwatch.StartNew();

        var catalog = await service.RetrieveCatalogAsync(
            new FakePluginRegistrationGateway(rows),
            CancellationToken.None);

        stopwatch.Stop();
        Assert.True(stopwatch.Elapsed < WindowsCiThreshold,
            $"Complete catalog assembly took {stopwatch.Elapsed}; threshold is {WindowsCiThreshold}.");
        Assert.Equal(AssemblyCount, catalog.Assemblies.Count);
        Assert.Equal(AssemblyCount * HandlersPerAssembly,
            catalog.Assemblies.Sum(assembly => assembly.Handlers.Count));
        Assert.Equal(AssemblyCount * HandlersPerAssembly * StepsPerHandler,
            catalog.Assemblies.SelectMany(assembly => assembly.Handlers).Sum(handler => handler.Steps.Count));
        Assert.Equal(AssemblyCount * HandlersPerAssembly * StepsPerHandler * ImagesPerStep,
            catalog.Assemblies.SelectMany(assembly => assembly.Handlers)
                .SelectMany(handler => handler.Steps).Sum(step => step.Images.Count));

        var lastImage = catalog.Assemblies[^1].Handlers[^1].Steps[^1].Images[^1];
        Assert.Equal("Needle Image 19999", lastImage.Name);
    }

    private static PluginRegistrationRows CreateRows()
    {
        var assemblies = new List<PluginAssemblyRow>(AssemblyCount);
        var handlers = new List<PluginTypeRow>(AssemblyCount * HandlersPerAssembly);
        var steps = new List<PluginStepRow>(AssemblyCount * HandlersPerAssembly * StepsPerHandler);
        var images = new List<PluginImageRow>(AssemblyCount * HandlersPerAssembly * StepsPerHandler * ImagesPerStep);
        var handlerNumber = 0;
        var stepNumber = 0;
        var imageNumber = 0;

        for (var assemblyNumber = 0; assemblyNumber < AssemblyCount; assemblyNumber++)
        {
            var assemblyId = Id(1, assemblyNumber);
            assemblies.Add(new PluginAssemblyRow(assemblyId, $"Assembly {assemblyNumber:D3}", "1.0.0.0",
                "neutral", "31bf3856ad364e35", 0, 2, false, true, assemblyNumber + 1,
                "Large catalog fixture"));

            for (var handlerIndex = 0; handlerIndex < HandlersPerAssembly; handlerIndex++, handlerNumber++)
            {
                var handlerId = Id(2, handlerNumber);
                handlers.Add(new PluginTypeRow(handlerId, assemblyId,
                    $"LargeCatalog.Plugin{handlerNumber:D4}", $"Plugin {handlerNumber:D4}", null, null, null,
                    false, false, true, handlerNumber + 1, "Large catalog fixture"));

                for (var stepIndex = 0; stepIndex < StepsPerHandler; stepIndex++, stepNumber++)
                {
                    var stepId = Id(3, stepNumber);
                    steps.Add(new PluginStepRow(stepId, handlerId, $"Step {stepNumber:D5}", null, "Update",
                        "Account", null, "Post-operation", "Synchronous", 40, 0, 1, true, false, true,
                        stepNumber + 1, false, "Large catalog fixture"));

                    for (var imageIndex = 0; imageIndex < ImagesPerStep; imageIndex++, imageNumber++)
                    {
                        var name = imageNumber == 19_999 ? "Needle Image 19999" : $"Image {imageNumber:D5}";
                        images.Add(new PluginImageRow(Id(4, imageNumber), stepId, name, null, "Post Image", "Target",
                            ["name", "accountnumber"], false, true, imageNumber + 1, "Large catalog fixture"));
                    }
                }
            }
        }

        return new PluginRegistrationRows(assemblies, handlers, steps, images);
    }

    private static Guid Id(byte kind, int number)
    {
        Span<byte> bytes = stackalloc byte[16];
        bytes[0] = kind;
        BitConverter.TryWriteBytes(bytes[4..], number);
        return new Guid(bytes);
    }
}
