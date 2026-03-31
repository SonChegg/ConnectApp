using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class DirectorySwapper
{
    private readonly ILogger _logger;

    public DirectorySwapper(ILogger logger)
    {
        _logger = logger;
    }

    public string StageNewVersion(string sourceDir, string installDir, Action<string>? onFileCopy = null)
    {
        var stagingDir = installDir + InstallerConstants.NewFolderSuffix;
        if (Directory.Exists(stagingDir))
        {
            Directory.Delete(stagingDir, true);
        }

        _logger.Info($"Staging new version to: {stagingDir}");

        try
        {
            Directory.Move(sourceDir, stagingDir);
        }
        catch (IOException)
        {
            _logger.Warn("Atomic move to staging failed. Falling back to copy.");
            CopyDirectory(sourceDir, stagingDir, sourceDir, onFileCopy);
        }

        return stagingDir;
    }

    public void Swap(string installDir)
    {
        var stagingDir = installDir + InstallerConstants.NewFolderSuffix;
        var backupDir = installDir + InstallerConstants.OldFolderSuffix;

        if (!Directory.Exists(stagingDir))
        {
            throw new InstallerException($"Временная папка установки не найдена: {stagingDir}");
        }

        if (Directory.Exists(backupDir))
        {
            Directory.Delete(backupDir, true);
        }

        try
        {
            if (Directory.Exists(installDir))
            {
                _logger.Info($"Moving current install to backup: {backupDir}");
                Directory.Move(installDir, backupDir);
            }

            _logger.Info($"Swapping in new version: {installDir}");
            Directory.Move(stagingDir, installDir);

            if (Directory.Exists(backupDir))
            {
                Directory.Delete(backupDir, true);
            }
        }
        catch (Exception ex)
        {
            _logger.Error("Swap failed. Attempting rollback.", ex);

            if (!Directory.Exists(installDir) && Directory.Exists(backupDir))
            {
                Directory.Move(backupDir, installDir);
            }

            if (Directory.Exists(stagingDir))
            {
                Directory.Delete(stagingDir, true);
            }

            throw new InstallerException("Не удалось заменить версию. Откат выполнен.", ex);
        }
    }

    private static void CopyDirectory(string sourceDir, string destinationDir, string rootDir, Action<string>? onFileCopy)
    {
        Directory.CreateDirectory(destinationDir);

        foreach (var file in Directory.GetFiles(sourceDir))
        {
            var destination = Path.Combine(destinationDir, Path.GetFileName(file));
            File.Copy(file, destination, true);
            onFileCopy?.Invoke(Path.GetRelativePath(rootDir, file));
        }

        foreach (var directory in Directory.GetDirectories(sourceDir))
        {
            var destination = Path.Combine(destinationDir, Path.GetFileName(directory));
            CopyDirectory(directory, destination, rootDir, onFileCopy);
        }
    }
}
