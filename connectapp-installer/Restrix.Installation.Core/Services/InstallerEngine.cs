using System.Diagnostics;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class InstallerEngine
{
    private readonly ILogger _logger;
    private readonly ProcessGuard _processGuard;
    private readonly FileDownloader _downloader;
    private readonly ZipExtractor _zipExtractor;
    private readonly DirectorySwapper _directorySwapper;
    private readonly ShortcutService _shortcutService;
    private readonly ProtocolRegistrar _protocolRegistrar;
    private readonly UninstallRegistryWriter _uninstallWriter;

    public InstallerEngine(ILogger logger)
    {
        _logger = logger;
        _processGuard = new ProcessGuard(_logger);
        _downloader = new FileDownloader(_logger);
        _zipExtractor = new ZipExtractor(_logger);
        _directorySwapper = new DirectorySwapper(_logger);
        _shortcutService = new ShortcutService(_logger);
        _protocolRegistrar = new ProtocolRegistrar(_logger);
        _uninstallWriter = new UninstallRegistryWriter(_logger);
    }

    public void Install(InstallOptions options)
    {
        ValidateOptions(options);

        Report(options, InstallPhase.Preparing, "Проверка запущенных процессов");
        _processGuard.EnsureNotRunning(InstallerConstants.ExecutableName);

        Report(options, InstallPhase.Preparing, "Подготовка временной папки");
        using var tempDir = new TempDirectory(InstallerConstants.AppId);
        var zipPath = ResolveZipPath(options, tempDir.Path);
        var extractRoot = Path.Combine(tempDir.Path, "extract");
        Directory.CreateDirectory(extractRoot);
        Report(options, InstallPhase.Extracting, "Распаковка файлов");
        var extractedRoot = _zipExtractor.ExtractToTemp(zipPath, extractRoot);
        Report(options, InstallPhase.Staging, "Подготовка файлов для установки");
        _directorySwapper.StageNewVersion(
            extractedRoot,
            options.InstallDir,
            file => Report(options, InstallPhase.Copying, "Копирование", file));
        Report(options, InstallPhase.Swapping, "Замена текущей версии");
        _directorySwapper.Swap(options.InstallDir);

        var exePath = Path.Combine(options.InstallDir, InstallerConstants.ExecutableName);
        Report(options, InstallPhase.Finalizing, "Создание ярлыков");
        CreateShortcuts(options.Mode, exePath);

        var launcherPath = Path.Combine(options.InstallDir, InstallerConstants.UpdaterExeName);
        if (!File.Exists(launcherPath))
        {
            launcherPath = exePath;
        }

        Report(options, InstallPhase.Finalizing, "Регистрация протокола");
        _protocolRegistrar.RegisterProtocol(options.Mode, launcherPath);
        Report(options, InstallPhase.Finalizing, "Запись данных в систему");
        WriteUninstallEntry(options, exePath);
    }

    private void ValidateOptions(InstallOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.SourceZipPath))
        {
            throw new InstallerException("Путь к пакету установки пуст.");
        }

        if (string.IsNullOrWhiteSpace(options.InstallDir))
        {
            throw new InstallerException("Папка установки не указана.");
        }
    }

    private void CreateShortcuts(InstallMode mode, string exePath)
    {
        var installDir = Path.GetDirectoryName(exePath) ?? string.Empty;
        var launcherPath = Path.Combine(installDir, InstallerConstants.UpdaterExeName);
        if (!File.Exists(launcherPath))
        {
            launcherPath = exePath;
        }

        var desktop = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory)
            : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

        var startMenuRoot = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms)
            : Environment.GetFolderPath(Environment.SpecialFolder.Programs);

        var startMenuFolder = Path.Combine(startMenuRoot, InstallerConstants.StartMenuFolderName);
        var workingDir = Path.GetDirectoryName(exePath) ?? startMenuFolder;

        _shortcutService.CreateShortcut(
            Path.Combine(desktop, InstallerConstants.DesktopShortcutName),
            launcherPath,
            arguments: null,
            workingDirectory: workingDir,
            description: InstallerConstants.AppName,
            iconPath: exePath);

        _shortcutService.CreateShortcut(
            Path.Combine(startMenuFolder, InstallerConstants.StartMenuShortcutName),
            launcherPath,
            arguments: null,
            workingDirectory: workingDir,
            description: InstallerConstants.AppName,
            iconPath: exePath);
    }

    private void WriteUninstallEntry(InstallOptions options, string exePath)
    {
        var version = options.DisplayVersion ?? FileVersionInfo.GetVersionInfo(exePath).FileVersion;
        var installerExePath = options.InstallerExePath ?? exePath;
        var uninstallCommand = $"\"{installerExePath}\" /uninstall";

        var entry = new UninstallEntry
        {
            DisplayName = InstallerConstants.AppName,
            DisplayVersion = version ?? string.Empty,
            Publisher = InstallerConstants.Publisher,
            InstallLocation = options.InstallDir,
            DisplayIcon = exePath,
            UninstallString = uninstallCommand
        };

        _uninstallWriter.Write(options.Mode, entry);
    }

    private string ResolveZipPath(InstallOptions options, string tempRoot)
    {
        if (string.IsNullOrWhiteSpace(options.SourceZipPath))
        {
            throw new InstallerException("Путь к пакету установки пуст.");
        }

        if (IsRemoteUrl(options.SourceZipPath))
        {
            var destination = Path.Combine(tempRoot, "package.zip");
            Report(options, InstallPhase.Downloading, "Скачивание установочного пакета");
            long? totalBytes = null;
            var totalReporter = new Progress<long?>(value => totalBytes = value);
            var progressReporter = new Progress<long>(value =>
            {
                if (totalBytes.HasValue && totalBytes.Value > 0)
                {
                    var percent = (int)Math.Clamp(value * 100.0 / totalBytes.Value, 0, 100);
                    Report(options, InstallPhase.Downloading, $"Скачивание {percent}%");
                }
                else
                {
                    var mb = Math.Max(1, value / 1024 / 1024);
                    Report(options, InstallPhase.Downloading, $"Скачивание {mb} МБ");
                }
            });

            _downloader.DownloadAsync(options.SourceZipPath, destination, progressReporter, totalReporter, CancellationToken.None)
                .GetAwaiter()
                .GetResult();
            return destination;
        }
        throw new InstallerException("Пакет установки должен быть по http/https ссылке.");
    }

    private static bool IsRemoteUrl(string value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
               (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    private static void Report(InstallOptions options, InstallPhase phase, string message, string? currentFile = null)
    {
        options.Progress?.Report(new InstallProgress(phase, message, currentFile));
    }
}
