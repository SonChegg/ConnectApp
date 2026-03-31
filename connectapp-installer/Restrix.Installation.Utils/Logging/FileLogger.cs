using System.Globalization;
using System.Text;

namespace Restrix.Installation.Utils.Logging;

public sealed class FileLogger : ILogger, IDisposable
{
    private readonly object _lock = new();
    private readonly StreamWriter _writer;

    public FileLogger(string logPath)
    {
        if (string.IsNullOrWhiteSpace(logPath))
        {
            throw new ArgumentException("Log path is empty.", nameof(logPath));
        }

        var directory = Path.GetDirectoryName(logPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _writer = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = true,
            NewLine = Environment.NewLine
        };
    }

    public void Log(LogLevel level, string message, Exception? exception = null)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("u", CultureInfo.InvariantCulture);
        var line = $"[{timestamp}] {level}: {message}";

        if (exception is not null)
        {
            line = $"{line}{Environment.NewLine}{exception}";
        }

        lock (_lock)
        {
            _writer.WriteLine(line);
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _writer.Dispose();
        }
    }
}
