using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class UpdateEngine
{
    private readonly ILogger _logger;
    private readonly ProcessGuard _processGuard;
    private readonly UpdateManifestLoader _manifestLoader;
    private readonly FileDownloader _downloader;
    private readonly ZipExtractor _zipExtractor;
    private readonly DirectorySwapper _directorySwapper;
    private readonly VersionComparer _versionComparer;

    public UpdateEngine(ILogger logger)
    {
        _logger = logger;
        _processGuard = new ProcessGuard(_logger);
        _manifestLoader = new UpdateManifestLoader(_logger);
        _downloader = new FileDownloader(_logger);
        _zipExtractor = new ZipExtractor(_logger);
        _directorySwapper = new DirectorySwapper(_logger);
        _versionComparer = new VersionComparer(_logger);
    }

    public async Task<bool> RunAsync(UpdateOptions options, CancellationToken cancellationToken)
    {
        ValidateOptions(options);

        _processGuard.EnsureNotRunning(InstallerConstants.ExecutableName);

        var manifest = await _manifestLoader.LoadAsync(options.ManifestUrl, cancellationToken);
        if (!_versionComparer.IsUpdateRequired(options.CurrentVersion, manifest.Version))
        {
            _logger.Info("Update not required. Version is up to date.");
            return false;
        }

        using var tempDir = new TempDirectory(InstallerConstants.AppId);
        var zipPath = Path.Combine(tempDir.Path, "update.zip");
        await _downloader.DownloadAsync(manifest.Url, zipPath, null, null, cancellationToken);

        var extractedRoot = _zipExtractor.ExtractToTemp(zipPath, tempDir.Path);
        _directorySwapper.StageNewVersion(extractedRoot, options.InstallDir);
        _directorySwapper.Swap(options.InstallDir);

        _logger.Info("Update applied successfully.");
        return true;
    }

    private static void ValidateOptions(UpdateOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.InstallDir))
        {
            throw new InstallerException("Папка установки не указана.");
        }

        if (string.IsNullOrWhiteSpace(options.ManifestUrl))
        {
            throw new InstallerException("Ссылка на манифест не указана.");
        }
    }
}
