namespace PowerTools.API.Tools.PluginRegistration.Validation;

public static class RegistrationOptionValues
{
    public const int IsolationNone = 1;
    public const int IsolationSandbox = 2;

    public const int SourceDatabase = 0;
    public const int SourceDisk = 1;

    public const int StagePreValidation = 10;
    public const int StagePreOperation = 20;
    public const int StagePostOperation = 40;
    public const int StagePostOperationDeprecated = 50;

    public const int ModeSynchronous = 0;
    public const int ModeAsynchronous = 1;

    public const int DeploymentServer = 0;
    public const int DeploymentOffline = 1;
    public const int DeploymentBoth = 2;

    public const int StateEnabled = 0;
    public const int StateDisabled = 1;
    public const int StatusEnabled = 1;
    public const int StatusDisabled = 2;

    public const int ImagePre = 0;
    public const int ImagePost = 1;
    public const int ImageBoth = 2;

    public const int ComponentTypePluginType = 90;
    public const int ComponentTypePluginAssembly = 91;
    public const int ComponentTypeSdkMessageProcessingStep = 92;

    public const int ConfigurationMaxLength = 4096;
    public const int CatalogPageSize = 5000;
    public const int NameMaxLength = 256;

    public const string CultureNeutral = "neutral";

    public static readonly int[] CatalogStages =
    [
        StagePreValidation,
        StagePreOperation,
        StagePostOperation,
        StagePostOperationDeprecated,
    ];

    public static readonly int[] WritableStages =
    [
        StagePreValidation,
        StagePreOperation,
        StagePostOperation,
    ];
}
