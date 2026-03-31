namespace Restrix.Installation.Utils.Logging;

public static class LoggerExtensions
{
    public static void Trace(this ILogger logger, string message) =>
        logger.Log(LogLevel.Trace, message);

    public static void Info(this ILogger logger, string message) =>
        logger.Log(LogLevel.Info, message);

    public static void Warn(this ILogger logger, string message) =>
        logger.Log(LogLevel.Warn, message);

    public static void Error(this ILogger logger, string message, Exception? exception = null) =>
        logger.Log(LogLevel.Error, message, exception);
}
