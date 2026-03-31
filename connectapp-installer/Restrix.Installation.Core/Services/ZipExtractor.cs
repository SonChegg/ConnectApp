using System.IO.Compression;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class ZipExtractor
{
    private readonly ILogger _logger;

    public ZipExtractor(ILogger logger)
    {
        _logger = logger;
    }

    public string ExtractToTemp(string zipPath, string destinationRoot)
    {
        if (!File.Exists(zipPath))
        {
            throw new InstallerException($"Zip-архив не найден: {zipPath}");
        }

        _logger.Info($"Extracting zip archive: {zipPath}");

        try
        {
            ZipFile.ExtractToDirectory(zipPath, destinationRoot, true);
        }
        catch (InvalidDataException ex)
        {
            throw new InstallerException("Zip-архив повреждён.", ex);
        }

        var appRoot = ResolveAppRoot(destinationRoot);
        _logger.Info($"Resolved application root: {appRoot}");
        return appRoot;
    }

    private static string ResolveAppRoot(string extractedRoot)
    {
        var matches = Directory.EnumerateFiles(
                extractedRoot,
                InstallerConstants.ExecutableName,
                SearchOption.AllDirectories)
            .ToList();

        if (matches.Count == 0)
        {
            throw new InstallerException($"Файл {InstallerConstants.ExecutableName} не найден после распаковки.");
        }

        if (matches.Count > 1)
        {
            throw new InstallerException($"Найдено несколько файлов {InstallerConstants.ExecutableName}. Невозможно определить корень.");
        }

        return Path.GetDirectoryName(matches[0]) ?? extractedRoot;
    }
}
