namespace Restrix.Installation.Core.Models;

public sealed class UpdateOptions
{
    public required string InstallDir { get; init; }
    public required string ManifestUrl { get; init; }
    public string? CurrentVersion { get; init; }
    public bool Silent { get; init; }
    public string? LogPath { get; init; }
}
