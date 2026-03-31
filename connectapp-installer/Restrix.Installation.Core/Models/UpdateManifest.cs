namespace Restrix.Installation.Core.Models;

public sealed class UpdateManifest
{
    public required string Version { get; init; }
    public required string Url { get; init; }
}
