namespace Restrix.Installation.Core.Models;

public sealed class UninstallContext
{
    public required InstallMode Mode { get; init; }
    public required string InstallDir { get; init; }
}
