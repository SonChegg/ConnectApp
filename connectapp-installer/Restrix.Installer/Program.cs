using System.Diagnostics;
using System.IO;
using System.Windows;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Core.Services;
using Restrix.Installation.Utils.CommandLine;
using Restrix.Installation.Utils.Logging;
using Restrix.Installation.Utils.Security;
using Restrix.Installation.Utils.System;
using Restrix.Installer.ViewModels;

namespace Restrix.Installer;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        CommandLineArgs parsed = ArgumentParser.Parse(args);
        InstallerArguments installerArgs = InstallerArguments.From(parsed);

        if (installerArgs.Silent && ShouldShowConsole())
        {
            ConsoleHelper.EnsureConsole();
        }

        bool isElevated = ElevationChecker.IsElevated();
        InstallMode mode = isElevated ? InstallMode.PerMachine : InstallMode.PerUser;
        string installDir = ResolveInstallDir(installerArgs.InstallDir, mode);

        if (!isElevated && IsUnderProgramFiles(installDir))
        {
            ReportError("Для установки в Program Files нужны права администратора.", installerArgs.Silent);
            return 1;
        }

        string logPath = ResolveLogPath(installerArgs.LogPath, mode);
        using FileLogger fileLogger = new FileLogger(logPath);
        ILogger logger = installerArgs.Silent && ShouldShowConsole()
            ? new CompositeLogger(fileLogger, new ConsoleLogger())
            : fileLogger;

        if (installerArgs.Uninstall)
        {
            UninstallEngine uninstallEngine = new UninstallEngine(logger);

            if (installerArgs.Silent)
            {
                try
                {
                    uninstallEngine.Uninstall();
                    return 0;
                }
                catch (InstallerException ex)
                {
                    logger.Error("Uninstall failed.", ex);
                    return 1;
                }
            }

            UninstallContext? context = null;
            try
            {
                context = uninstallEngine.GetInstalledContext();
            }
            catch (InstallerException ex)
            {
                logger.Error("Install context not found.", ex);
            }

            App uninstallApp = new App();
            MainWindow uninstallWindow = new MainWindow
            {
                DataContext = new MainViewModel(uninstallEngine, context, logger)
            };
            uninstallApp.Run(uninstallWindow);
            return 0;
        }

        string sourceZipPath = ResolveSourceZip(installerArgs.SourceZipPath);
        string? installerExePath = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;

        InstallOptions optionsTemplate = new InstallOptions
        {
            SourceZipPath = sourceZipPath,
            InstallDir = installDir,
            Mode = mode,
            Silent = installerArgs.Silent,
            LogPath = logPath,
            InstallerExePath = installerExePath,
            DisplayVersion = null
        };

        InstallerEngine engine = new InstallerEngine(logger);

        if (installerArgs.Silent)
        {
            try
            {
                engine.Install(optionsTemplate);
                return 0;
            }
            catch (InstallerException ex)
            {
                logger.Error("Installation failed.", ex);
                return 1;
            }
        }

        App app = new App();
        MainWindow window = new MainWindow
        {
            DataContext = new MainViewModel(engine, optionsTemplate, logger, isElevated)
        };
        app.Run(window);
        return 0;
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

    private static string ResolveInstallDir(string? installDir, InstallMode mode)
    {
        if (!string.IsNullOrWhiteSpace(installDir))
        {
            return Path.GetFullPath(installDir);
        }

        return InstallPathResolver.GetDefaultInstallDir(mode);
    }

    private static string ResolveLogPath(string? logPath, InstallMode mode)
    {
        if (!string.IsNullOrWhiteSpace(logPath))
        {
            return Path.GetFullPath(logPath);
        }

        string baseDir = mode == InstallMode.PerMachine
            ? Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)
            : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        return Path.Combine(baseDir, InstallerConstants.AppName, InstallerConstants.LogFileName);
    }

    private static string ResolveSourceZip(string? sourceZip)
    {
        if (!string.IsNullOrWhiteSpace(sourceZip))
        {
            return UpdateUrlNormalizer.Normalize(sourceZip);
        }

        return InstallerConstants.DefaultZipUrl;
    }

    private static bool IsUnderProgramFiles(string path)
    {
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        return IsUnderRoot(path, programFiles) || IsUnderRoot(path, programFilesX86);
    }

    private static bool IsUnderRoot(string path, string root)
    {
        if (string.IsNullOrWhiteSpace(root))
        {
            return false;
        }

        string fullPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase);
    }

    private static void ReportError(string message, bool silent)
    {
        if (silent)
        {
            Console.WriteLine(message);
            return;
        }

        MessageBox.Show(message, "Установщик ConnectApp", MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
