using Restrix.Installation.Core.Constants;

namespace Restrix.Installation.Core.Services;

public static class UpdateUrlNormalizer
{
    public static string Normalize(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return url;
        }

        string normalized = url.Trim();
        normalized = ReplaceLegacyBase(
            normalized,
            InstallerConstants.LegacyReleasesBaseUrl,
            InstallerConstants.ReleasesBaseUrl);
        normalized = ReplaceLegacyBase(
            normalized,
            InstallerConstants.LegacyAlternateReleasesBaseUrl,
            InstallerConstants.ReleasesBaseUrl);
        normalized = ReplaceLegacyBase(
            normalized,
            InstallerConstants.LegacyReleasesBaseUrlHttp,
            InstallerConstants.ReleasesBaseUrl);

        return normalized;
    }

    private static string ReplaceLegacyBase(string url, string legacyBase, string canonicalBase)
    {
        if (!url.StartsWith(legacyBase, StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }

        return canonicalBase + url[legacyBase.Length..];
    }
}
