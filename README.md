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

## Build macOS app

```bash
npm run dist:mac
```

## FxSound preset

If you want a bundled FxSound preset inside the app, place the file here before building:

```text
/home/ConnectApp/assets/fxsound/default.fac
```

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
