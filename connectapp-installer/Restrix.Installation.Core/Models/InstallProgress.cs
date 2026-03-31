namespace Restrix.Installation.Core.Models;

public sealed class InstallProgress
{
    public InstallProgress(InstallPhase phase, string message, string? currentFile = null)
    {
        Phase = phase;
        Message = message;
        CurrentFile = currentFile;
    }

    public InstallPhase Phase { get; }
    public string Message { get; }
    public string? CurrentFile { get; }
}

public enum InstallPhase
{
    Preparing,
    Downloading,
    Extracting,
    Staging,
    Copying,
    Swapping,
    Finalizing
}
