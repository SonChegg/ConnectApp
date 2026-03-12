const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { AppStore, normalizePort, normalizeText } = require('./store');
const { PortForwardManager } = require('./port-forward-manager');
const { cleanupLauncherArtifacts, launchLinuxTerminal, launchWindowsRdp } = require('./remote');
const { ProgramsService } = require('./programs');

let mainWindow = null;
let store = null;
let forwardManager = null;
let programsService = null;

function ensureNonEmpty(value, fieldName) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} не заполнено.`);
  }

  return normalized;
}

function ensureSupportedPlatform() {
  if (process.platform !== 'win32') {
    throw new Error('Это действие доступно только в Windows-сборке приложения.');
  }
}

function sanitizeProfileInput(payload) {
  const platform = payload.platform === 'windows' ? 'windows' : 'linux';
  const defaultPort = platform === 'windows' ? 3389 : 22;

  return {
    id: normalizeText(payload.id),
    name: ensureNonEmpty(payload.name, 'Название профиля'),
    platform,
    host: ensureNonEmpty(payload.host, 'IP / хост'),
    port: normalizePort(payload.port, defaultPort),
    lastUsername: normalizeText(payload.lastUsername),
    note: normalizeText(payload.note)
  };
}

async function buildBootstrapPayload() {
  return {
    platform: process.platform,
    profiles: await store.listProfiles(),
    forwards: forwardManager.list(),
    programs: await programsService.getProgramsPayload()
  };
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#0a1220',
    title: 'ConnectApp',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu();
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

async function resolveConnectionPassword(payload) {
  const typedPassword = normalizeText(payload.password);

  if (typedPassword) {
    return typedPassword;
  }

  const saved = await store.getCredential({
    platform: payload.platform,
    host: payload.host,
    port: payload.port,
    username: payload.username
  });

  if (saved && saved.password) {
    return saved.password;
  }

  throw new Error('Пароль не найден. Введите пароль или сохраните его заранее.');
}

async function handleProfileConnect(_event, payload) {
  ensureSupportedPlatform();

  const profile = await store.getProfile(payload.profileId);

  if (!profile) {
    throw new Error('Профиль не найден.');
  }

  const username = ensureNonEmpty(payload.username || profile.lastUsername, 'Логин');
  const password = await resolveConnectionPassword({
    platform: profile.platform,
    host: profile.host,
    port: profile.port,
    username,
    password: payload.password
  });

  if (payload.remember && normalizeText(payload.password)) {
    await store.saveCredential({
      platform: profile.platform,
      host: profile.host,
      port: profile.port,
      username,
      password
    });
  }

  await store.updateProfileUsername(profile.id, username);

  if (profile.platform === 'windows') {
    return launchWindowsRdp({
      userDataDir: app.getPath('userData'),
      profile,
      username,
      password,
      remember: Boolean(payload.remember)
    });
  }

  return launchLinuxTerminal({
    userDataDir: app.getPath('userData'),
    appPath: app.getAppPath(),
    execPath: process.execPath,
    profile,
    username,
    password
  });
}

async function handleStartForward(_event, payload) {
  const host = ensureNonEmpty(payload.host, 'IP / хост');
  const username = ensureNonEmpty(payload.username, 'Логин');
  const sshPort = normalizePort(payload.sshPort, 22);
  const localPort = normalizePort(payload.localPort, 0);
  const remotePort = normalizePort(payload.remotePort, 0);
  const remoteHost = normalizeText(payload.remoteHost) || '127.0.0.1';

  if (!remotePort) {
    throw new Error('Укажите удалённый порт для проброса.');
  }

  const password = await resolveConnectionPassword({
    platform: 'linux',
    host,
    port: sshPort,
    username,
    password: payload.password
  });

  if (payload.remember && normalizeText(payload.password)) {
    await store.saveCredential({
      platform: 'linux',
      host,
      port: sshPort,
      username,
      password
    });
  }

  const forward = await forwardManager.start({
    name: payload.name || `${username}@${host}`,
    host,
    port: sshPort,
    username,
    password,
    localPort,
    remoteHost,
    remotePort
  });

  return {
    forward,
    message: `Проброс создан: 127.0.0.1:${forward.localPort} -> ${remoteHost}:${remotePort}`
  };
}

async function handleImportFxSoundPreset() {
  ensureSupportedPlatform();

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите .fac файл',
    properties: ['openFile'],
    filters: [
      {
        name: 'FxSound preset',
        extensions: ['fac']
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      cancelled: true
    };
  }

  return programsService.importFxSoundPreset(result.filePaths[0]);
}

function registerIpcHandlers() {
  ipcMain.handle('app:bootstrap', async () => buildBootstrapPayload());
  ipcMain.handle('profiles:save', async (_event, payload) => {
    await store.upsertProfile(sanitizeProfileInput(payload));
    return store.listProfiles();
  });
  ipcMain.handle('profiles:delete', async (_event, profileId) => {
    await store.deleteProfile(profileId);
    return store.listProfiles();
  });
  ipcMain.handle('profiles:connect', handleProfileConnect);
  ipcMain.handle('forwards:start', handleStartForward);
  ipcMain.handle('forwards:stop', async (_event, forwardId) => {
    const stopped = await forwardManager.stop(forwardId);
    return {
      stopped
    };
  });
  ipcMain.handle('programs:install', async (_event, programId) => programsService.installProgram(programId));
  ipcMain.handle('programs:copy-hiddify-config', async () => programsService.copyHiddifyConfig());
  ipcMain.handle('programs:import-fxsound-preset', async () => handleImportFxSoundPreset());
  ipcMain.handle('programs:install-bundled-fxsound-preset', async () => programsService.installBundledFxSoundPreset());
}

app.whenReady().then(async () => {
  store = new AppStore(app.getPath('userData'));
  await store.init();
  await cleanupLauncherArtifacts(app.getPath('userData'));

  programsService = new ProgramsService({
    app,
    userDataDir: app.getPath('userData')
  });

  forwardManager = new PortForwardManager((forwards) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('forwards:changed', forwards);
    }
  });

  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('before-quit', async () => {
  if (forwardManager) {
    await forwardManager.stopAll();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
