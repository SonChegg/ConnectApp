using Restrix.Installation.Core.Interop;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class ShortcutService
{
    private readonly ILogger _logger;

    public ShortcutService(ILogger logger)
    {
        _logger = logger;
    }

    public void CreateShortcut(
        string shortcutPath,
        string targetPath,
        string? arguments,
        string? workingDirectory,
        string? description,
        string? iconPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);

        var link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);

        if (!string.IsNullOrWhiteSpace(arguments))
        {
            link.SetArguments(arguments);
        }

        if (!string.IsNullOrWhiteSpace(workingDirectory))
        {
            link.SetWorkingDirectory(workingDirectory);
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            link.SetDescription(description);
        }

        if (!string.IsNullOrWhiteSpace(iconPath))
        {
            link.SetIconLocation(iconPath, 0);
        }

        ((IPersistFile)link).Save(shortcutPath, true);
        _logger.Info($"Shortcut created: {shortcutPath}");
    }

    public void DeleteShortcut(string shortcutPath)
    {
        if (File.Exists(shortcutPath))
        {
            File.Delete(shortcutPath);
            _logger.Info($"Shortcut removed: {shortcutPath}");
        }
    }
}
