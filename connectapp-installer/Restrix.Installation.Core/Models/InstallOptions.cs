namespace Restrix.Installation.Core.Models;

public sealed class InstallOptions
{
    public required string SourceZipPath { get; init; }
    public required string InstallDir { get; init; }
    public required InstallMode Mode { get; init; }
    public bool Silent { get; init; }
    public string? LogPath { get; init; }
    public string? InstallerExePath { get; init; }
    public string? DisplayVersion { get; init; }
    public IProgress<InstallProgress>? Progress { get; init; }
}
