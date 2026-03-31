using Microsoft.Win32;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class UninstallRegistryWriter
{
    private readonly ILogger _logger;

    public UninstallRegistryWriter(ILogger logger)
    {
        _logger = logger;
    }

    public void Write(InstallMode mode, UninstallEntry entry)
    {
        var root = mode == InstallMode.PerMachine ? Registry.LocalMachine : Registry.CurrentUser;
        var keyPath = $"{RegistryConstants.UninstallRoot}\\{InstallerConstants.UninstallKeyName}";

        using var key = root.CreateSubKey(keyPath);
        key.SetValue("DisplayName", entry.DisplayName);
        key.SetValue("DisplayVersion", entry.DisplayVersion ?? string.Empty);
        key.SetValue("Publisher", entry.Publisher ?? string.Empty);
        key.SetValue("InstallLocation", entry.InstallLocation);
        key.SetValue("DisplayIcon", entry.DisplayIcon ?? string.Empty);
        key.SetValue("UninstallString", entry.UninstallString);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);

        _logger.Info($"Uninstall entry written ({mode}): {keyPath}");
    }

    public void Delete(InstallMode mode)
    {
        var root = mode == InstallMode.PerMachine ? Registry.LocalMachine : Registry.CurrentUser;
        var keyPath = $"{RegistryConstants.UninstallRoot}\\{InstallerConstants.UninstallKeyName}";
        root.DeleteSubKeyTree(keyPath, false);
        _logger.Info($"Uninstall entry removed ({mode}): {keyPath}");
    }
}
