namespace Restrix.Installation.Core.Models;

public sealed class UninstallEntry
{
    public required string DisplayName { get; init; }
    public string? DisplayVersion { get; init; }
    public string? Publisher { get; init; }
    public required string InstallLocation { get; init; }
    public string? DisplayIcon { get; init; }
    public required string UninstallString { get; init; }
}
