namespace Restrix.Installation.Utils.CommandLine;

public sealed class InstallerArguments
{
    public bool Silent { get; init; }
    public bool Uninstall { get; init; }
    public string? InstallDir { get; init; }
    public string? LogPath { get; init; }
    public string? SourceZipPath { get; init; }

    public static InstallerArguments From(CommandLineArgs args) =>
        new()
        {
            Silent = args.HasFlag(ArgumentKeys.Silent),
            Uninstall = args.HasFlag(ArgumentKeys.Uninstall),
            InstallDir = args.GetValue(ArgumentKeys.InstallDir),
            LogPath = args.GetValue(ArgumentKeys.Log),
            SourceZipPath = args.GetValue(ArgumentKeys.SourceZip)
        };
}
