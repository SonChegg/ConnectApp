using System.Diagnostics;
using System.IO;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Core.Services;
using Restrix.Installation.Utils.CommandLine;
using Restrix.Installation.Utils.Logging;
using Restrix.Installation.Utils.System;

namespace Restrix.Updater;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        CommandLineArgs parsed = ArgumentParser.Parse(args);
        UpdaterArguments updaterArgs = UpdaterArguments.From(parsed);

        if (updaterArgs.Silent && ShouldShowConsole())
        {
            ConsoleHelper.EnsureConsole();
        }

        string logPath = ResolveLogPath(updaterArgs.LogPath);
        using FileLogger fileLogger = new FileLogger(logPath);
        ILogger logger = updaterArgs.Silent && ShouldShowConsole()
            ? new CompositeLogger(fileLogger, new ConsoleLogger())
            : fileLogger;

        string installDir = ResolveInstallDir(updaterArgs.InstallDir);
        string manifestUrl = ResolveManifestUrl(updaterArgs.ManifestUrl);
        string? currentVersion = ResolveCurrentVersion(updaterArgs.CurrentVersion, installDir, logger);

        UpdateOptions options = new UpdateOptions
        {
            InstallDir = installDir,
            ManifestUrl = manifestUrl,
            CurrentVersion = currentVersion,
            Silent = updaterArgs.Silent,
            LogPath = logPath
        };

        UpdateEngine engine = new UpdateEngine(logger);

        try
        {
            await engine.RunAsync(options, CancellationToken.None);
            LaunchApp(options.InstallDir, logger);
            return 0;
        }
        catch (InstallerException ex)
        {
            logger.Error("Update failed.", ex);
            LaunchApp(options.InstallDir, logger);
            return 1;
        }
    }

    private static string ResolveLogPath(string? logPath)
    {
        if (!string.IsNullOrWhiteSpace(logPath))
        {
            return Path.GetFullPath(logPath);
        }

        string baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(baseDir, InstallerConstants.AppName, InstallerConstants.UpdaterLogFileName);
    }

    private static string ResolveInstallDir(string? installDir)
    {
        if (!string.IsNullOrWhiteSpace(installDir))
        {
            return Path.GetFullPath(installDir);
        }

        return AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    }

    private static bool ShouldShowConsole()
    {
        return Debugger.IsAttached ||
               string.Equals(
                   Environment.GetEnvironmentVariable("CONNECTAPP_SHOW_CONSOLE"),
                   "1",
                   StringComparison.OrdinalIgnoreCase) ||
               string.Equals(
                   Environment.GetEnvironmentVariable("RESTRIX_SHOW_CONSOLE"),
                   "1",
                   StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveManifestUrl(string? manifestUrl)
    {
        if (!string.IsNullOrWhiteSpace(manifestUrl))
        {
            return UpdateUrlNormalizer.Normalize(manifestUrl);
        }

        return InstallerConstants.DefaultManifestUrl;
    }

    private static string? ResolveCurrentVersion(string? currentVersion, string installDir, ILogger logger)
    {
        if (!string.IsNullOrWhiteSpace(currentVersion))
        {
            return currentVersion;
        }

        string exePath = Path.Combine(installDir, InstallerConstants.ExecutableName);
        if (!File.Exists(exePath))
        {
            logger.Warn($"Executable not found for version read: {exePath}");
            return null;
        }

        try
        {
            FileVersionInfo info = FileVersionInfo.GetVersionInfo(exePath);
            return info.FileVersion;
        }
        catch (Exception ex)
        {
            logger.Warn($"Failed to read version from {exePath}: {ex.Message}");
            return null;
        }
    }

    private static void LaunchApp(string installDir, ILogger logger)
    {
        string exePath = Path.Combine(installDir, InstallerConstants.ExecutableName);
        if (!File.Exists(exePath))
        {
            logger.Error($"Executable not found: {exePath}");
            return;
        }

        try
        {
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                WorkingDirectory = installDir,
                UseShellExecute = true
            };

            Process.Start(startInfo);
            logger.Info("ConnectApp launched.");
        }
        catch (Exception ex)
        {
            logger.Error("Failed to launch ConnectApp.", ex);
        }
    }
}
