namespace Restrix.Installation.Utils.Logging;

public sealed class CompositeLogger : ILogger
{
    private readonly IReadOnlyList<ILogger> _loggers;

    public CompositeLogger(params ILogger[] loggers)
    {
        _loggers = loggers ?? Array.Empty<ILogger>();
    }

    public void Log(LogLevel level, string message, Exception? exception = null)
    {
        foreach (var logger in _loggers)
        {
            logger.Log(level, message, exception);
        }
    }
}
