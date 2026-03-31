using System.Globalization;

namespace Restrix.Installation.Utils.Logging;

public sealed class ConsoleLogger : ILogger
{
    public void Log(LogLevel level, string message, Exception? exception = null)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("u", CultureInfo.InvariantCulture);
        Console.WriteLine($"[{timestamp}] {level}: {message}");

        if (exception is not null)
        {
            Console.WriteLine(exception);
        }
    }
}
