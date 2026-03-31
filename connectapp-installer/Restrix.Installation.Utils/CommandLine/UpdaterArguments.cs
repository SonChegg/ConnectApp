namespace Restrix.Installation.Utils.CommandLine;

public sealed class UpdaterArguments
{
    public bool Silent { get; init; }
    public string? InstallDir { get; init; }
    public string? LogPath { get; init; }
    public string? CurrentVersion { get; init; }
    public string? ManifestUrl { get; init; }

    public static UpdaterArguments From(CommandLineArgs args) =>
        new()
        {
            Silent = args.HasFlag(ArgumentKeys.Silent),
            InstallDir = args.GetValue(ArgumentKeys.InstallDir),
            LogPath = args.GetValue(ArgumentKeys.Log),
            CurrentVersion = args.GetValue(ArgumentKeys.CurrentVersion),
            ManifestUrl = args.GetValue(ArgumentKeys.ManifestUrl)
        };
}
