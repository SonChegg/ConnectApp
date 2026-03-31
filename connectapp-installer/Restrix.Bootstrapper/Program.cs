using System.IO;
using Restrix.Bootstrapper.Services;
using Restrix.Installation.Utils.CommandLine;
using Restrix.Installation.Utils.Logging;
using Restrix.Installation.Utils.System;

namespace Restrix.Bootstrapper;

public static class Program
{
    private const string DefaultInstallerZipUrl = "embedded://installer";

    [STAThread]
    public static async Task<int> Main(string[] args)
    {
        var parsed = ArgumentParser.Parse(args);
        var silent = parsed.HasFlag(ArgumentKeys.Silent);
        var installerUrl = parsed.GetValue(ArgumentKeys.InstallerUrl) ?? DefaultInstallerZipUrl;

        var logPath = ResolveLogPath();
        using var fileLogger = new FileLogger(logPath);
        ILogger logger = fileLogger;

        var runner = new BootstrapperRunner(logger);

        var totalBytes = (long?)null;
        var totalReporter = new Progress<long?>(value => totalBytes = value);
        var progressReporter = new Progress<long>(_ => { });

        var runTask = Task.Run(() => runner.RunAsync(installerUrl, args, progressReporter, totalReporter));

        try
        {
            var exitCode = await runTask;
            return exitCode;
        }
        catch (Exception ex)
        {
            logger.Error("Bootstrapper failed.", ex);
            return 1;
        }
    }

    private static string ResolveLogPath()
    {
        var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(baseDir, "ConnectApp", "bootstrapper.log");
    }
}
