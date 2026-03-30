# ConnectApp

Windows desktop app on Electron for:

- remote profiles for Linux and Windows servers;
- Linux SSH sessions in Windows Terminal;
- Windows RDP launch via `mstsc`;
- local SSH port forwarding;
- saved SSH tunnel profiles;
- downloading and installing common utility apps;
- one-click installation of all bundled programs;
- export and import of a JSON config with profiles, tunnel presets and saved credentials;
- importing a FxSound preset into the current user's roaming profile.

## Run locally

```bash
npm install
npm start
```

## Build Windows installer

```bash
npm run dist:win
```

## Build Windows installer with SignPath

This project also includes a SignPath signing hook for `electron-builder` on Windows:

```bash
npm run dist:win:signpath
```

Before running it:

1. Install the SignPath Windows KSP on the Windows machine that builds the app.
2. Keep the public X.509 certificate outside the repository and point `SIGNPATH_CERT_FILE` to it.
3. Set these environment variables in PowerShell:

```powershell
$env:SIGNPATH_CERT_FILE = "C:\signing\ConnectApp.pem"
$env:SIGNPATH_PROJECT_SLUG = "your-project-slug"
$env:SIGNPATH_POLICY_SLUG = "your-signing-policy-slug"
```

Optional variables:

```powershell
$env:SIGNPATH_TIMESTAMP_URL = "http://timestamp.digicert.com"
$env:SIGNTOOL_PATH = "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\signtool.exe"
```

Notes:

- `ConnectApp.pem` must contain only the public X.509 certificate. The private key stays in SignPath.
- If `signtool.exe` rejects PEM input on your machine, convert the certificate to `.cer` and use that path in `SIGNPATH_CERT_FILE`.
- Do not commit signing certificates or signing secrets into the repository.

## Build macOS app

```bash
npm run dist:mac
```

## FxSound preset

If you want a bundled FxSound preset inside the app, place the file here before building:

```text
/home/ConnectApp/assets/fxsound/default.fac
```

`default.fac` remains the preferred name. If it is absent, the app will pick the first `.fac` file it finds in `/home/ConnectApp/assets/fxsound/`.

At runtime the app copies presets into the current user's roaming folder:

```text
%APPDATA%\FxSound\Presets
```

## Notes

- On macOS and Linux, the app supports Linux SSH profiles, the built-in SSH terminal, local port forwarding, and config import/export.
- Windows RDP, hidden installers, FxSound preset import and archive extraction through PowerShell remain Windows-only features.
- In the built-in SSH terminal, selected text can be copied with `Ctrl+C` / `Cmd+C`, and clipboard text can be pasted with `Ctrl+V` / `Cmd+V` or the right mouse button.
- Credentials are stored per-user in Electron `userData`; when encryption is available, Electron `safeStorage` is used.
- Exported config files store saved passwords in encrypted portable form instead of plain text.
