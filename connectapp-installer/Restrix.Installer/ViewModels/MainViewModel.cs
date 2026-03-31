using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using Restrix.Installation.Core.Constants;
using Restrix.Installation.Core.Models;
using Restrix.Installation.Core.Services;
using Restrix.Installation.Utils.Logging;

namespace Restrix.Installer.ViewModels;

public sealed class MainViewModel : INotifyPropertyChanged
{
    private readonly InstallerEngine? _installerEngine;
    private readonly UninstallEngine? _uninstallEngine;
    private readonly InstallOptions? _template;
    private readonly ILogger _logger;
    private readonly OperationKind _operationKind;

    private string _installDir;
    private string _status;
    private bool _isBusy;
    private bool _hasStarted;
    private DateTime _lastProgressUpdate;

    public MainViewModel(InstallerEngine engine, InstallOptions template, ILogger logger, bool isElevated)
    {
        _operationKind = OperationKind.Install;
        _installerEngine = engine;
        _template = template;
        _logger = logger;
        _installDir = template.InstallDir;
        _status = "Подготовка установки...";
        TitleText = "ConnectApp";
        SubtitleText = "Установщик";
        FooterText = "Пожалуйста, подождите. ConnectApp загрузится и установится автоматически.";

    }

    public MainViewModel(UninstallEngine engine, UninstallContext? context, ILogger logger)
    {
        _operationKind = OperationKind.Uninstall;
        _uninstallEngine = engine;
        _logger = logger;
        _installDir = context?.InstallDir ?? "Не установлено";
        _status = "Подготовка удаления...";
        TitleText = "ConnectApp";
        SubtitleText = "Удаление";
        FooterText = "Пожалуйста, подождите. Удаление завершится автоматически.";
    }

    public string TitleText { get; }

    public string SubtitleText { get; }

    public string FooterText { get; }

    public string InstallDir
    {
        get => _installDir;
        set
        {
            if (value == _installDir)
            {
                return;
            }

            _installDir = value;
            OnPropertyChanged();
        }
    }

    public string Status
    {
        get => _status;
        private set
        {
            if (value == _status)
            {
                return;
            }

            _status = value;
            OnPropertyChanged();
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            if (value == _isBusy)
            {
                return;
            }

            _isBusy = value;
            OnPropertyChanged();
        }
    }

    public event EventHandler<OperationCompletedEventArgs>? OperationCompleted;

    public async Task StartOperationAsync()
    {
        if (_hasStarted)
        {
            return;
        }

        _hasStarted = true;
        if (_operationKind == OperationKind.Install)
        {
            await RunInstallAsync();
        }
        else
        {
            await RunUninstallAsync();
        }
    }

    private async Task RunInstallAsync()
    {
        IsBusy = true;
        Status = "Установка ConnectApp...";

        try
        {
            if (_installerEngine is null || _template is null)
            {
                throw new InvalidOperationException("Installer engine is not configured.");
            }

            var options = new InstallOptions
            {
                SourceZipPath = _template.SourceZipPath,
                InstallDir = InstallDir,
                Mode = _template.Mode,
                Silent = _template.Silent,
                LogPath = _template.LogPath,
                InstallerExePath = _template.InstallerExePath,
                DisplayVersion = _template.DisplayVersion,
                Progress = new Progress<InstallProgress>(OnProgress)
            };

            await Task.Run(() => _installerEngine.Install(options));
            Status = "Установка завершена.";

            var launcherPath = Path.Combine(options.InstallDir, InstallerConstants.UpdaterExeName);
            if (!File.Exists(launcherPath))
            {
                launcherPath = Path.Combine(options.InstallDir, InstallerConstants.ExecutableName);
            }

            OperationCompleted?.Invoke(this, OperationCompletedEventArgs.CreateSuccess(OperationKind.Install, launcherPath));
        }
        catch (Exception ex)
        {
            _logger.Error("Installation failed.", ex);
            Status = ex.Message;
            OperationCompleted?.Invoke(this, OperationCompletedEventArgs.CreateFailure(OperationKind.Install, ex.Message));
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task RunUninstallAsync()
    {
        IsBusy = true;
        Status = "Удаление ConnectApp...";

        try
        {
            if (_uninstallEngine is null)
            {
                throw new InvalidOperationException("Uninstall engine is not configured.");
            }

            await Task.Run(() => _uninstallEngine.Uninstall());
            Status = "Удаление завершено.";
            OperationCompleted?.Invoke(this, OperationCompletedEventArgs.CreateSuccess(OperationKind.Uninstall, null));
        }
        catch (Exception ex)
        {
            _logger.Error("Uninstall failed.", ex);
            Status = ex.Message;
            OperationCompleted?.Invoke(this, OperationCompletedEventArgs.CreateFailure(OperationKind.Uninstall, ex.Message));
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void OnProgress(InstallProgress progress)
    {
        var now = DateTime.UtcNow;
        if ((now - _lastProgressUpdate).TotalMilliseconds < 60)
        {
            return;
        }

        _lastProgressUpdate = now;

        if (!string.IsNullOrWhiteSpace(progress.CurrentFile))
        {
            Status = $"{progress.Message}: {progress.CurrentFile}";
            return;
        }

        Status = progress.Message;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}

public enum OperationKind
{
    Install,
    Uninstall
}

public sealed class OperationCompletedEventArgs : EventArgs
{
    private OperationCompletedEventArgs(OperationKind kind, bool success, string? message, string? executablePath)
    {
        Kind = kind;
        Success = success;
        Message = message;
        ExecutablePath = executablePath;
    }

    public OperationKind Kind { get; }
    public bool Success { get; }
    public string? Message { get; }
    public string? ExecutablePath { get; }

    public static OperationCompletedEventArgs CreateSuccess(OperationKind kind, string? executablePath) =>
        new(kind, true, null, executablePath);

    public static OperationCompletedEventArgs CreateFailure(OperationKind kind, string message) =>
        new(kind, false, message, null);
}
