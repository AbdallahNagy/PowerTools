namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>
/// Turns normalized settings into ModelBuilder command-line arguments. The same switches as
/// <c>pac modelbuilder build</c>, which always splits output into one file per object.
/// </summary>
public static class EarlyBoundGeneratorArguments
{
    public const string SettingsFileName = "builderSettings.json";

    public static IReadOnlyList<string> Build(GenerationSettingsDto settings)
    {
        var args = new List<string>
        {
            $"/outdirectory:{settings.OutputDirectory}",
            "/splitfiles",
            $"/namespace:{settings.Namespace}",
        };

        if (settings.ServiceContextName.Length > 0)
            args.Add($"/serviceContextName:{settings.ServiceContextName}");

        args.Add($"/entitytypesfolder:{settings.EntityTypesFolder}");
        args.Add($"/optionsetstypesfolder:{settings.OptionSetsTypesFolder}");
        args.Add($"/messagestypesfolder:{settings.MessagesTypesFolder}");

        // Never send a filter made only of separators: the engine would read no tables at all.
        if (settings.EntityNamesFilter.Count > 0)
            args.Add($"/entitynamesfilter:{string.Join(';', settings.EntityNamesFilter)}");

        if (settings.GenerateMessages)
        {
            args.Add("/generatesdkmessages");
            if (settings.MessageNamesFilter.Count > 0)
                args.Add($"/messagenamesfilter:{string.Join(';', settings.MessageNamesFilter)}");
        }

        if (settings.GenerateGlobalOptionSets) args.Add("/generateGlobalOptionSets");
        if (settings.EmitFieldsClasses) args.Add("/emitfieldsclasses");
        if (settings.EmitVirtualAttributes) args.Add("/emitVirtualAttributes");
        if (settings.EmitEntityETC) args.Add("/emitEntityETC");
        if (settings.SuppressINotifyPattern) args.Add("/suppressINotifyPattern");
        if (settings.SuppressGeneratedCodeAttribute) args.Add("/suppressGeneratedCodeAttribute");

        // The engine writes builderSettings.json from the effective settings, as pac does.
        args.Add("/writesettingsTemplateFile");
        return args;
    }
}
