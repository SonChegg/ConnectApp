namespace Restrix.Installation.Core.Exceptions;

public sealed class InstallerException : Exception
{
    public InstallerException(string message) : base(message)
    {
    }

    public InstallerException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
