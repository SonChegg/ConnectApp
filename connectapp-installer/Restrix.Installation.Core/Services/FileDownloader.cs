using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class FileDownloader
{
    private static readonly HttpClient HttpClient = new();
    private readonly ILogger _logger;

    public FileDownloader(ILogger logger)
    {
        _logger = logger;
    }

    public async Task<string> DownloadAsync(
        string url,
        string destinationPath,
        IProgress<long>? progress,
        IProgress<long?>? totalSize,
        CancellationToken cancellationToken)
    {
        string normalizedUrl = UpdateUrlNormalizer.Normalize(url);
        EnsureUserAgent();

        if (TryCopyLocalFile(normalizedUrl, destinationPath, progress, totalSize))
        {
            return destinationPath;
        }

        _logger.Info($"Downloading update package: {normalizedUrl}");

        try
        {
            using HttpResponseMessage response = await HttpClient.GetAsync(
                normalizedUrl,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            response.EnsureSuccessStatusCode();
            totalSize?.Report(response.Content.Headers.ContentLength);

            string? directory = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await using FileStream fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
            await using Stream stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            byte[] buffer = new byte[81920];
            int read;
            long totalRead = 0;
            while ((read = await stream.ReadAsync(buffer, cancellationToken)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                totalRead += read;
                progress?.Report(totalRead);
            }

            return destinationPath;
        }
        catch (Exception ex)
        {
            throw new InstallerException("Не удалось скачать пакет установки.", ex);
        }
    }

    private bool TryCopyLocalFile(
        string url,
        string destinationPath,
        IProgress<long>? progress,
        IProgress<long?>? totalSize)
    {
        if (TryResolveLocalPath(url, out var localPath))
        {
            _logger.Info($"Copying update package from local path: {localPath}");
            string? directory = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.Copy(localPath, destinationPath, true);
            var length = new FileInfo(localPath).Length;
            progress?.Report(length);
            totalSize?.Report(length);
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

        HttpClient.DefaultRequestHeaders.UserAgent.ParseAdd("ConnectApp-Installer/1.0");
    }

    private static bool TryResolveLocalPath(string url, out string localPath)
    {
        localPath = string.Empty;

        if (Uri.TryCreate(url, UriKind.Absolute, out Uri? uri) && uri.IsFile)
        {
            localPath = uri.LocalPath;
            return File.Exists(localPath);
        }

        if (File.Exists(url))
        {
            localPath = url;
            return true;
        }

        return false;
    }
}
