using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Models;

namespace Restrix.Installation.Core.Services;

public static class InstallPathResolver
{
    public static string GetDefaultInstallDir(InstallMode mode)
    {
        var baseDir = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
            : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        return Path.Combine(baseDir, InstallerConstants.AppName);
    }
}
