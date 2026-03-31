namespace Restrix.Installation.Core.Services;

public sealed class TempDirectory : IDisposable
{
    public string Path { get; }

    public TempDirectory(string prefix)
    {
        var basePath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), prefix, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(basePath);
        Path = basePath;
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, true);
            }
        }
        catch
        {
            // Best-effort cleanup only.
        }
    }
}
