using Microsoft.Win32;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class UninstallEngine
{
    private readonly ILogger _logger;
    private readonly ProcessGuard _processGuard;
    private readonly ShortcutService _shortcutService;
    private readonly ProtocolRegistrar _protocolRegistrar;
    private readonly UninstallRegistryWriter _uninstallWriter;

    public UninstallEngine(ILogger logger)
    {
        _logger = logger;
        _processGuard = new ProcessGuard(_logger);
        _shortcutService = new ShortcutService(_logger);
        _protocolRegistrar = new ProtocolRegistrar(_logger);
        _uninstallWriter = new UninstallRegistryWriter(_logger);
    }

    public void Uninstall()
    {
        var context = ResolveInstallContext();
        _processGuard.CloseIfRunning(InstallerConstants.ExecutableName, TimeSpan.FromSeconds(10));

        RemoveShortcuts(context.Mode);
        _protocolRegistrar.UnregisterProtocol(context.Mode);
        _uninstallWriter.Delete(context.Mode);

        DeleteDirectory(context.InstallDir);
        DeleteDirectory(context.InstallDir + InstallerConstants.NewFolderSuffix);
        DeleteDirectory(context.InstallDir + InstallerConstants.OldFolderSuffix);

        _logger.Info("Uninstall completed.");
    }

    public UninstallContext GetInstalledContext()
    {
        return ResolveInstallContext();
    }

    private static UninstallContext ResolveInstallContext()
    {
        if (TryReadInstall(Registry.LocalMachine, InstallMode.PerMachine, out var context))
        {
            return context;
        }

        if (TryReadInstall(Registry.CurrentUser, InstallMode.PerUser, out context))
        {
            return context;
        }

        throw new InstallerException("ConnectApp не установлен.");
    }

    private static bool TryReadInstall(RegistryKey root, InstallMode mode, out UninstallContext context)
    {
        var keyPath = $"{RegistryConstants.UninstallRoot}\\{InstallerConstants.UninstallKeyName}";
        using var key = root.OpenSubKey(keyPath);
        var installLocation = key?.GetValue("InstallLocation") as string;

        if (string.IsNullOrWhiteSpace(installLocation))
        {
            context = new UninstallContext { Mode = mode, InstallDir = string.Empty };
            return false;
        }

        context = new UninstallContext
        {
            Mode = mode,
            InstallDir = installLocation
        };
        return true;
    }

    private void RemoveShortcuts(InstallMode mode)
    {
        var desktop = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory)
            : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

        var startMenuRoot = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms)
            : Environment.GetFolderPath(Environment.SpecialFolder.Programs);

        var startMenuFolder = Path.Combine(startMenuRoot, InstallerConstants.StartMenuFolderName);

        _shortcutService.DeleteShortcut(Path.Combine(desktop, InstallerConstants.DesktopShortcutName));
        _shortcutService.DeleteShortcut(Path.Combine(startMenuFolder, InstallerConstants.StartMenuShortcutName));

        if (Directory.Exists(startMenuFolder) && !Directory.EnumerateFileSystemEntries(startMenuFolder).Any())
        {
            Directory.Delete(startMenuFolder);
        }
    }

    private void DeleteDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            try
            {
                Directory.Delete(path, true);
                _logger.Info($"Directory removed: {path}");
            }
            catch (Exception ex)
            {
                throw new InstallerException($"Не удалось удалить папку: {path}", ex);
            }
        }
    }
}
