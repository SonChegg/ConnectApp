using System.Diagnostics;
using System.IO;
using System.Windows;

namespace Restrix.Installer;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is ViewModels.MainViewModel viewModel)
        {
            viewModel.OperationCompleted += OnOperationCompleted;
            await viewModel.StartOperationAsync();
        }
    }

    private void Window_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ButtonState == System.Windows.Input.MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private async void OnOperationCompleted(object? sender, ViewModels.OperationCompletedEventArgs e)
    {
        if (e.Success && !string.IsNullOrWhiteSpace(e.ExecutablePath))
        {
            TryLaunchApp(e.ExecutablePath);
            await Task.Delay(900);
            Close();
            return;
        }

        if (e.Success)
        {
            await Task.Delay(900);
            Close();
            return;
        }

        await Task.Delay(4000);
        Close();
    }

    private void TryLaunchApp(string executablePath)
    {
        if (!File.Exists(executablePath))
        {
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                WorkingDirectory = Path.GetDirectoryName(executablePath) ?? string.Empty,
                UseShellExecute = true
            };

            Process.Start(startInfo);
        }
        catch
        {
            // Ignore launch failures; installer already succeeded.
        }
    }
}
