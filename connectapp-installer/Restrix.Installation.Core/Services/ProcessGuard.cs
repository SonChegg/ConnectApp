using System.Diagnostics;
using Restrix.Installation.Core.Exceptions;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installation.Core.Services;

public sealed class ProcessGuard
{
    private readonly ILogger _logger;

    public ProcessGuard(ILogger logger)
    {
        _logger = logger;
    }

    public void EnsureNotRunning(string executableName)
    {
        var processName = Path.GetFileNameWithoutExtension(executableName);
        var running = Process.GetProcessesByName(processName);

        if (running.Length > 0)
        {
            _logger.Warn($"{processName} is running. Install/Update aborted.");
            throw new InstallerException($"{processName} запущен. Закройте приложение и повторите попытку.");
        }
    }

    public void CloseIfRunning(string executableName, TimeSpan gracefulTimeout)
    {
        var processName = Path.GetFileNameWithoutExtension(executableName);
        var running = Process.GetProcessesByName(processName);

        if (running.Length == 0)
        {
            return;
        }

        _logger.Info($"{processName} is running. Attempting to close.");

        foreach (var process in running)
        {
            try
            {
                if (process.HasExited)
                {
                    continue;
                }

                var closed = false;
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    closed = process.CloseMainWindow();
                }

                if (closed)
                {
                    if (!process.WaitForExit((int)gracefulTimeout.TotalMilliseconds))
                    {
                        _logger.Warn($"Process {process.Id} did not exit gracefully. Killing.");
                        process.Kill(true);
                        process.WaitForExit(5000);
                    }
                }
                else
                {
                    _logger.Warn($"Process {process.Id} has no window or CloseMainWindow failed. Killing.");
                    process.Kill(true);
                    process.WaitForExit(5000);
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to close process {process.Id}.", ex);
                throw new InstallerException($"{processName} запущен и не может быть закрыт автоматически.", ex);
            }
            finally
            {
                process.Dispose();
            }
        }

        var stillRunning = Process.GetProcessesByName(processName);
        if (stillRunning.Length > 0)
        {
            throw new InstallerException($"{processName} всё ещё запущен после попытки закрытия.");
        }
    }
}
