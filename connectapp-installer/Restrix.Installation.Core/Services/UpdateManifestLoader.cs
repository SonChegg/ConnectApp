using System.Text.Json;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class UpdateManifestLoader
{
    private static readonly HttpClient HttpClient = new();
    private readonly ILogger _logger;

    public UpdateManifestLoader(ILogger logger)
    {
        _logger = logger;
    }

    public async Task<UpdateManifest> LoadAsync(string manifestUrl, CancellationToken cancellationToken)
    {
        string normalizedManifestUrl = UpdateUrlNormalizer.Normalize(manifestUrl);
        _logger.Info($"Loading update manifest: {normalizedManifestUrl}");
        EnsureUserAgent();

        string json;
        if (TryReadLocalFile(normalizedManifestUrl, out string localJson))
        {
            json = localJson;
        }
        else
        {
            json = await HttpClient.GetStringAsync(normalizedManifestUrl, cancellationToken);
        }

        UpdateManifest? manifest = JsonSerializer.Deserialize<UpdateManifest>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (manifest is null || string.IsNullOrWhiteSpace(manifest.Version) || string.IsNullOrWhiteSpace(manifest.Url))
        {
            throw new InstallerException("Update manifest is invalid or missing required fields.");
        }

        return new UpdateManifest
        {
            Version = manifest.Version,
            Url = UpdateUrlNormalizer.Normalize(manifest.Url)
        };
    }

    private static bool TryReadLocalFile(string manifestUrl, out string json)
    {
        json = string.Empty;

        if (Uri.TryCreate(manifestUrl, UriKind.Absolute, out Uri? uri) && uri.IsFile)
        {
            string path = uri.LocalPath;
            if (File.Exists(path))
            {
                json = File.ReadAllText(path);
                return true;
            }
        }

        if (File.Exists(manifestUrl))
        {
            json = File.ReadAllText(manifestUrl);
            return true;
        }

        return false;
    }

    private static void EnsureUserAgent()
    {
        if (HttpClient.DefaultRequestHeaders.UserAgent.Count > 0)
        {
            return;
        }

        HttpClient.DefaultRequestHeaders.UserAgent.ParseAdd("ConnectApp-Updater/1.0");
    }
}
