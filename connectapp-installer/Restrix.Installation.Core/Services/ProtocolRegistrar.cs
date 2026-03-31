using Microsoft.Win32;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class ProtocolRegistrar
{
    private readonly ILogger _logger;

    public ProtocolRegistrar(ILogger logger)
    {
        _logger = logger;
    }

    public void RegisterProtocol(InstallMode mode, string executablePath)
    {
        var root = mode == InstallMode.PerMachine ? Registry.LocalMachine : Registry.CurrentUser;
        using var classes = root.CreateSubKey(RegistryConstants.ClassesRoot);
        using var protocolKey = classes.CreateSubKey(InstallerConstants.ProtocolName);

        protocolKey.SetValue(string.Empty, InstallerConstants.ProtocolDisplayName);
        protocolKey.SetValue(InstallerConstants.UrlProtocolValueName, string.Empty);

        using var iconKey = protocolKey.CreateSubKey(RegistryConstants.DefaultIconSubKey);
        iconKey.SetValue(string.Empty, $"\"{executablePath}\"{InstallerConstants.DefaultIconSuffix}");

        using var commandKey = protocolKey.CreateSubKey(RegistryConstants.ShellOpenCommandSubKey);
        commandKey.SetValue(string.Empty, $"\"{executablePath}\" \"%1\"");

        _logger.Info($"Protocol registered: {InstallerConstants.ProtocolName} ({mode})");
    }

    public void UnregisterProtocol(InstallMode mode)
    {
        var root = mode == InstallMode.PerMachine ? Registry.LocalMachine : Registry.CurrentUser;
        using var classes = root.OpenSubKey(RegistryConstants.ClassesRoot, true);
        classes?.DeleteSubKeyTree(InstallerConstants.ProtocolName, false);
        _logger.Info($"Protocol unregistered: {InstallerConstants.ProtocolName} ({mode})");
    }
}
