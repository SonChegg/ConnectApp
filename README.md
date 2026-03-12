# ConnectApp

Windows desktop app on Electron for:

- remote profiles for Linux and Windows servers;
- Linux SSH sessions in Windows Terminal;
- Windows RDP launch via `mstsc`;
- local SSH port forwarding;
- downloading and installing common utility apps;
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

- The UI can open on Linux/macOS for development, but RDP, hidden installers, archive extraction through PowerShell and Windows Terminal are intended for Windows.
- Credentials are stored per-user in Electron `userData`; when encryption is available, Electron `safeStorage` is used.
