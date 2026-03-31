namespace Restrix.Installation.Core.Constants;

public static class InstallerConstants
{
    public const string AppId = "ConnectApp";
    public const string AppName = "ConnectApp";
    public const string ExecutableName = "ConnectApp.exe";
    public const string InstallerExeName = "ConnectApp.Installer.exe";
    public const string UpdaterExeName = "updater.exe";
    public const string ProtocolName = "connectapp";
    public const string ProtocolDisplayName = "URL:ConnectApp Protocol";
    public const string StartMenuFolderName = "ConnectApp";
    public const string DesktopShortcutName = "ConnectApp.lnk";
    public const string StartMenuShortcutName = "ConnectApp.lnk";
    public const string UninstallKeyName = "ConnectApp";
    public const string Publisher = "SonChegg";
    public const string LogFileName = "installer.log";
    public const string UpdaterLogFileName = "updater.log";
    public const string ReleasesBaseUrl = "https://github.com/SonChegg/ConnectApp/releases/latest/download";
    public const string LegacyReleasesBaseUrl = "https://updates.restrix.ru/releases";
    public const string LegacyAlternateReleasesBaseUrl = "https://alpha.updates.restrix.ru/releases";
    public const string LegacyReleasesBaseUrlHttp = "http://alpha.updates.restrix.ru/releases";
    public const string DefaultZipUrl = ReleasesBaseUrl + "/ConnectApp.win-unpacked.zip";
    public const string DefaultManifestUrl = ReleasesBaseUrl + "/connectapp-manifest.json";
    public const string UrlProtocolValueName = "URL Protocol";
    public const string DefaultIconSuffix = ",0";
    public const string NewFolderSuffix = ".new";
    public const string OldFolderSuffix = ".old";
}
