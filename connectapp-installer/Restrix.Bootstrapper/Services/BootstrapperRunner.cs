using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using Restrix.Installation.Utils.CommandLine;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Bootstrapper.Services;

public sealed class BootstrapperRunner
{
    private const string InstallerZipFileName = "ConnectApp.Installer.zip";
    private const string InstallerExeName = "ConnectApp.Installer.exe";

    private readonly ILogger _logger;

    public BootstrapperRunner(ILogger logger)
    {
        _logger = logger;
    }

    public async Task<int> RunAsync(string installerZipUrl, string[] originalArgs, IProgress<long>? progress, IProgress<long?>? totalSize)
    {
        var cacheRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ConnectApp",
            "bootstrapper",
            "current");
        ResetDirectory(cacheRoot);

        var zipPath = Path.Combine(cacheRoot, InstallerZipFileName);
        await DownloadAsync(installerZipUrl, zipPath, progress, totalSize);

        var extractDir = Path.Combine(cacheRoot, "installer");
        Directory.CreateDirectory(extractDir);
        ZipFile.ExtractToDirectory(zipPath, extractDir, true);

        var installerPath = ResolveInstallerPath(extractDir);
        _logger.Info($"Installer extracted to: {extractDir}");
        LogExtractedSummary(extractDir);
        _logger.Info($"Installer exe: {installerPath}");
        ValidateInstallerPackage(Path.GetDirectoryName(installerPath) ?? extractDir);
        return RunInstaller(installerPath, originalArgs, extractDir);
    }

    private async Task DownloadAsync(string url, string destinationPath, IProgress<long>? progress, IProgress<long?>? totalSize)
    {
        if (IsEmbeddedUrl(url))
        {
            await ExtractEmbeddedZipAsync(destinationPath, progress, totalSize);
            return;
        }

        _logger.Info($"Downloading installer zip: {url}");

        using var http = new HttpClient();
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ConnectApp.Bootstrapper", "1.0"));

        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        totalSize?.Report(response.Content.Headers.ContentLength);
        await using var stream = await response.Content.ReadAsStreamAsync();
        await using var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.Read);

        var buffer = new byte[81920];
        int read;
        long totalRead = 0;
        while ((read = await stream.ReadAsync(buffer)) > 0)
        {
            await fileStream.WriteAsync(buffer.AsMemory(0, read));
            totalRead += read;
            progress?.Report(totalRead);
        }

        _logger.Info($"Installer zip downloaded: {destinationPath}");
    }

    private static bool IsEmbeddedUrl(string url)
    {
        return url.StartsWith("embedded:", StringComparison.OrdinalIgnoreCase);
    }

    private async Task ExtractEmbeddedZipAsync(string destinationPath, IProgress<long>? progress, IProgress<long?>? totalSize)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly.GetManifestResourceNames()
            .FirstOrDefault(name => name.EndsWith(InstallerZipFileName, StringComparison.OrdinalIgnoreCase));

        if (resourceName is null)
        {
            throw new FileNotFoundException($"Embedded installer zip not found in bootstrapper resources: {InstallerZipFileName}");
        }

        _logger.Info($"Using embedded installer zip: {resourceName}");

        await using var resource = assembly.GetManifestResourceStream(resourceName);
        if (resource is null)
        {
            throw new FileNotFoundException($"Embedded installer zip stream not available: {resourceName}");
        }

        totalSize?.Report(resource.CanSeek ? resource.Length : null);

        await using var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.Read);
        var buffer = new byte[81920];
        int read;
        long totalRead = 0;
        while ((read = await resource.ReadAsync(buffer)) > 0)
        {
            await fileStream.WriteAsync(buffer.AsMemory(0, read));
            totalRead += read;
            progress?.Report(totalRead);
        }

        _logger.Info($"Embedded installer zip written: {destinationPath}");
    }

    private static string ResolveInstallerPath(string root)
    {
        var matches = Directory.EnumerateFiles(root, InstallerExeName, SearchOption.AllDirectories).ToList();
        if (matches.Count == 0)
        {
            throw new FileNotFoundException($"Installer executable not found in extracted files: {InstallerExeName}");
        }

        if (matches.Count > 1)
        {
            throw new InvalidOperationException($"Multiple installer executables found: {InstallerExeName}");
        }

        return matches[0];
    }

    private void ValidateInstallerPackage(string root)
    {
        if (!File.Exists(Path.Combine(root, InstallerExeName)))
        {
            return;
        }

        var requiredFiles = new[]
        {
            "PresentationNative_cor3.dll",
            "wpfgfx_cor3.dll",
            "D3DCompiler_47_cor3.dll",
            "vcruntime140_cor3.dll"
        };

        var missing = requiredFiles
            .Where(file => !File.Exists(Path.Combine(root, file)))
            .ToList();

        if (missing.Count > 0)
        {
            _logger.Warn("Installer package is missing WPF native files. " +
                         "If the installer is single-file self-contained this is expected. Missing: " +
                         string.Join(", ", missing));
        }
    }

    private int RunInstaller(string installerPath, string[] originalArgs, string extractRoot)
    {
        if (!File.Exists(installerPath))
        {
            _logger.Error($"Installer not found: {installerPath}");
            return 1;
        }

        var forwardedArgs = originalArgs
            .Where(arg => !arg.StartsWith("/" + ArgumentKeys.InstallerUrl, StringComparison.OrdinalIgnoreCase)
                       && !arg.StartsWith("-" + ArgumentKeys.InstallerUrl, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        var logArg = EnsureLogArgument(forwardedArgs, extractRoot);
        var finalArgs = forwardedArgs.Concat(logArg).ToArray();

        var startInfo = new ProcessStartInfo
        {
            FileName = installerPath,
            UseShellExecute = true,
            WorkingDirectory = Path.GetDirectoryName(installerPath) ?? string.Empty,
            Arguments = string.Join(" ", finalArgs.Select(QuoteIfNeeded))
        };

        _logger.Info("Launching installer.");
        using var process = Process.Start(startInfo);
        if (process is null)
        {
            _logger.Error("Failed to start installer process.");
            return 1;
        }

        var windowFound = false;
        var windowWaitUntil = DateTime.UtcNow.AddSeconds(4);
        while (DateTime.UtcNow < windowWaitUntil && !process.HasExited)
        {
            process.Refresh();
            if (process.MainWindowHandle != IntPtr.Zero)
            {
                windowFound = true;
                break;
            }
            Thread.Sleep(200);
        }

        if (!windowFound)
        {
            _logger.Warn("Installer started but no main window detected yet.");
        }

        if (process.WaitForExit(10000))
        {
            _logger.Error($"Installer exited immediately with code {process.ExitCode}.");
            return process.ExitCode;
        }

        _logger.Info("Installer started.");
        return 0;
    }

    private void LogExtractedSummary(string root)
    {
        try
        {
            var files = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
                .Select(path => path.Substring(root.Length).TrimStart(Path.DirectorySeparatorChar))
                .ToList();
            _logger.Info($"Extracted files: {files.Count}");

            foreach (var entry in files.Take(12))
            {
                _logger.Info($" - {entry}");
            }
        }
        catch (Exception ex)
        {
            _logger.Warn($"Failed to list extracted files: {ex.Message}");
        }
    }

    private static IEnumerable<string> EnsureLogArgument(string[] args, string extractRoot)
    {
        if (args.Any(arg => arg.StartsWith("/" + ArgumentKeys.Log, StringComparison.OrdinalIgnoreCase)
                         || arg.StartsWith("-" + ArgumentKeys.Log, StringComparison.OrdinalIgnoreCase)))
        {
            return Array.Empty<string>();
        }

        var logPath = Path.Combine(extractRoot, "ConnectApp.Installer.log");
        return new[] { "/" + ArgumentKeys.Log + "=" + logPath };
    }

    private void ResetDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, true);
        }

        Directory.CreateDirectory(path);
        _logger.Info($"Bootstrapper cache prepared: {path}");
    }

    private static string QuoteIfNeeded(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "\"\"";
        }

        return value.Contains(' ') ? "\"" + value + "\"" : value;
    }
}
