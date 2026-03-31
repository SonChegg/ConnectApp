using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class VersionComparer
{
    private readonly ILogger _logger;

    public VersionComparer(ILogger logger)
    {
        _logger = logger;
    }

    public bool IsUpdateRequired(string? currentVersion, string latestVersion)
    {
        if (string.IsNullOrWhiteSpace(currentVersion))
        {
            _logger.Info("Current version is unknown. Update will be applied.");
            return true;
        }

        if (TryParseVersion(currentVersion, out var current) && TryParseVersion(latestVersion, out var latest))
        {
            return latest > current;
        }

        _logger.Warn("Version parsing failed. Update will be applied.");
        return !string.Equals(currentVersion, latestVersion, StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryParseVersion(string input, out Version version)
    {
        var cleaned = input.Split('-', '+')[0];
        return Version.TryParse(cleaned, out version!);
    }
}
