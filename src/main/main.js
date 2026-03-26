const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { AppStore, normalizeOptionalPort, normalizePort, normalizeText } = require('./store');
const { PortForwardManager } = require('./port-forward-manager');
const { cleanupLauncherArtifacts, launchWindowsRdp } = require('./remote');
const { ProgramsService } = require('./programs');
const { SshTerminalWindowManager } = require('./ssh-terminal-window');

let mainWindow = null;
let store = null;
let forwardManager = null;
let programsService = null;
let sshTerminalManager = null;

function ensureNonEmpty(value, fieldName) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} не заполнено.`);
  }

  return normalized;
}

function ensureWindowsOnly() {
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
    privateKeyPath: platform === 'windows' ? '' : normalizeText(payload.privateKeyPath),
    note: normalizeText(payload.note)
  };
}

function normalizeForwardName(payload) {
  const explicitName = normalizeText(payload.name);

  if (explicitName) {
    return explicitName;
  }

  const username = normalizeText(payload.username);
  const host = normalizeText(payload.host);
  const localPort = normalizeOptionalPort(payload.localPort, 0);
  const remoteHost = normalizeText(payload.remoteHost) || '127.0.0.1';
  const remotePort = normalizePort(payload.remotePort, 0);
  const parts = [];

  if (username && host) {
    parts.push(`${username}@${host}`);
  } else if (host) {
    parts.push(host);
  }

  if (localPort || remotePort) {
    parts.push(`${localPort || 0} -> ${remoteHost}:${remotePort || 0}`);
  }

  return parts.join(' • ') || 'SSH tunnel';
}

function sanitizeForwardProfileInput(payload) {
  const remotePort = normalizePort(payload.remotePort, 0);

  if (!remotePort) {
    throw new Error('Укажите удалённый порт для проброса.');
  }

  return {
    id: normalizeText(payload.id),
    name: normalizeForwardName(payload),
    host: ensureNonEmpty(payload.host, 'IP / хост'),
    sshPort: normalizePort(payload.sshPort, 22),
    username: ensureNonEmpty(payload.username, 'Логин'),
    privateKeyPath: normalizeText(payload.privateKeyPath),
    localPort: normalizeOptionalPort(payload.localPort, 0),
    remoteHost: normalizeText(payload.remoteHost) || '127.0.0.1',
    remotePort,
    note: normalizeText(payload.note)
  };
}

async function buildBootstrapPayload() {
  const profiles = await store.listProfiles();
  const profilesWithCredentialState = await Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      hasPrivateKey: Boolean(normalizeText(profile.privateKeyPath)),
      hasSavedCredential: Boolean(profile.lastUsername) && await store.hasCredential({
        platform: profile.platform,
        host: profile.host,
        port: profile.port,
        username: profile.lastUsername
      })
    }))
  );

  return {
    platform: process.platform,
    profiles: profilesWithCredentialState,
    forwardProfiles: await store.listForwardProfiles(),
    forwards: forwardManager.list(),
    programs: await programsService.getProgramsPayload()
  };
}

async function readPrivateKey(privateKeyPath) {
  const normalizedPath = normalizeText(privateKeyPath);

  if (!normalizedPath) {
    throw new Error('Выберите файл сертификата/ключа для SSH-входа.');
  }

  try {
    return {
      privateKeyPath: normalizedPath,
      privateKey: await fs.readFile(normalizedPath)
    };
  } catch {
    throw new Error(`Не удалось прочитать сертификат/ключ: ${normalizedPath}`);
  }
}

async function resolveSshAuth(options) {
  const requestedMethod = normalizeText(options.authMethod);
  const typedPrivateKeyPath = normalizeText(options.privateKeyPath);
  const storedPrivateKeyPath = normalizeText(options.storedPrivateKeyPath);
  const shouldUsePrivateKey = requestedMethod === 'privateKey'
    || (!requestedMethod && Boolean(typedPrivateKeyPath || storedPrivateKeyPath));

  if (shouldUsePrivateKey) {
    const keyRecord = await readPrivateKey(typedPrivateKeyPath || storedPrivateKeyPath);

    return {
      authMethod: 'privateKey',
      privateKeyPath: keyRecord.privateKeyPath,
      privateKey: keyRecord.privateKey,
      passphrase: normalizeText(options.passphrase)
    };
  }

  return {
    authMethod: 'password',
    password: await resolveConnectionPassword({
      platform: 'linux',
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password
    })
  };
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 660,
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
  const profile = await store.getProfile(payload.profileId);

  if (!profile) {
    throw new Error('Профиль не найден.');
  }

  if (profile.platform === 'windows' && process.platform !== 'win32') {
    throw new Error('RDP-подключение доступно только в Windows-сборке приложения.');
  }

  const username = ensureNonEmpty(payload.username || profile.lastUsername, 'Логин');
  await store.updateProfileUsername(profile.id, username);

  if (profile.platform === 'windows') {
    ensureWindowsOnly();
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

    return launchWindowsRdp({
      userDataDir: app.getPath('userData'),
      profile,
      username,
      password,
      remember: Boolean(payload.remember)
    });
  }

  const sshAuth = await resolveSshAuth({
    authMethod: payload.authMethod,
    host: profile.host,
    port: profile.port,
    username,
    password: payload.password,
    privateKeyPath: payload.privateKeyPath,
    storedPrivateKeyPath: profile.privateKeyPath,
    passphrase: payload.passphrase
  });

  if (sshAuth.authMethod === 'password' && payload.remember && normalizeText(payload.password)) {
    await store.saveCredential({
      platform: 'linux',
      host: profile.host,
      port: profile.port,
      username,
      password: sshAuth.password
    });
  }

  if (sshAuth.authMethod === 'privateKey' && sshAuth.privateKeyPath !== normalizeText(profile.privateKeyPath)) {
    await store.upsertProfile({
      ...profile,
      lastUsername: username,
      privateKeyPath: sshAuth.privateKeyPath
    });
  }

  return sshTerminalManager.openSession({
    profile: {
      ...profile,
      lastUsername: username,
      privateKeyPath: sshAuth.authMethod === 'privateKey' ? sshAuth.privateKeyPath : profile.privateKeyPath
    },
    username,
    password: sshAuth.password,
    privateKey: sshAuth.privateKey,
    passphrase: sshAuth.passphrase
  });
}

async function handleStartForward(_event, payload) {
  const forwardInput = sanitizeForwardProfileInput(payload);
  const host = forwardInput.host;
  const username = forwardInput.username;
  const sshPort = forwardInput.sshPort;
  const localPort = forwardInput.localPort;
  const remotePort = forwardInput.remotePort;
  const remoteHost = forwardInput.remoteHost;

  const sshAuth = await resolveSshAuth({
    authMethod: payload.authMethod,
    host,
    port: sshPort,
    username,
    password: payload.password,
    privateKeyPath: payload.privateKeyPath,
    storedPrivateKeyPath: '',
    passphrase: payload.passphrase
  });

  if (sshAuth.authMethod === 'password' && payload.remember && normalizeText(payload.password)) {
    await store.saveCredential({
      platform: 'linux',
      host,
      port: sshPort,
      username,
      password: sshAuth.password
    });
  }

  let savedForwardProfile = null;

  if (payload.saveToConfig !== false) {
    savedForwardProfile = await store.upsertForwardProfile({
      ...forwardInput,
      id: normalizeText(payload.id)
    });
  }

  const forward = await forwardManager.start({
    name: savedForwardProfile ? savedForwardProfile.name : forwardInput.name,
    host,
    port: sshPort,
    username,
    password: sshAuth.password,
    privateKey: sshAuth.privateKey,
    passphrase: sshAuth.passphrase,
    localPort,
    remoteHost,
    remotePort,
    forwardProfileId: savedForwardProfile ? savedForwardProfile.id : null
  });

  return {
    forward,
    forwardProfile: savedForwardProfile,
    message: `Проброс создан: 127.0.0.1:${forward.localPort} -> ${remoteHost}:${remotePort}`
  };
}

async function handleStartSavedForward(_event, forwardProfileId) {
  const forwardProfile = await store.getForwardProfile(forwardProfileId);

  if (!forwardProfile) {
    throw new Error('Профиль проброса не найден.');
  }

  const sshAuth = await resolveSshAuth({
    host: forwardProfile.host,
    port: forwardProfile.sshPort,
    username: forwardProfile.username,
    password: '',
    storedPrivateKeyPath: forwardProfile.privateKeyPath
  });

  const forward = await forwardManager.start({
    name: forwardProfile.name,
    host: forwardProfile.host,
    port: forwardProfile.sshPort,
    username: forwardProfile.username,
    password: sshAuth.password,
    privateKey: sshAuth.privateKey,
    passphrase: sshAuth.passphrase,
    localPort: forwardProfile.localPort,
    remoteHost: forwardProfile.remoteHost,
    remotePort: forwardProfile.remotePort,
    forwardProfileId: forwardProfile.id
  });

  return {
    forward,
    message: `Проброс создан: 127.0.0.1:${forward.localPort} -> ${forward.remoteHost}:${forward.remotePort}`
  };
}

async function handleImportFxSoundPreset() {
  ensureWindowsOnly();

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

async function handlePickPrivateKey() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите файл сертификата/ключа',
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      cancelled: true
    };
  }

  return {
    cancelled: false,
    path: result.filePaths[0]
  };
}

async function handleExportConfig() {
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить конфиг ConnectApp',
    defaultPath: `connect-app-config-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [
      {
        name: 'JSON',
        extensions: ['json']
      }
    ]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return {
      cancelled: true
    };
  }

  const snapshot = await store.exportConfigSnapshot();
  await fs.writeFile(saveResult.filePath, JSON.stringify(snapshot, null, 2), 'utf8');

  return {
    path: saveResult.filePath,
    profilesCount: snapshot.profiles.length,
    forwardProfilesCount: snapshot.forwardProfiles.length,
    credentialsCount: snapshot.credentials.length,
    message: 'Конфиг сохранён. Сохранённые пароли записаны в зашифрованном виде.'
  };
}

async function handleImportConfig() {
  const openResult = await dialog.showOpenDialog(mainWindow, {
    title: 'Открыть конфиг ConnectApp',
    properties: ['openFile'],
    filters: [
      {
        name: 'JSON',
        extensions: ['json']
      }
    ]
  });

  if (openResult.canceled || openResult.filePaths.length === 0) {
    return {
      cancelled: true
    };
  }

  const raw = await fs.readFile(openResult.filePaths[0], 'utf8');
  let snapshot;

  try {
    snapshot = JSON.parse(raw);
  } catch {
    throw new Error('Не удалось прочитать JSON-конфиг.');
  }

  const summary = await store.importConfigSnapshot(snapshot);

  return {
    message: `Конфиг загружен: профилей ${summary.profilesCount}, порт-профилей ${summary.forwardProfilesCount}, учёток ${summary.credentialsCount}.`,
    state: await buildBootstrapPayload()
  };
}

function registerIpcHandlers() {
  ipcMain.handle('app:bootstrap', async () => buildBootstrapPayload());
  ipcMain.handle('app:open-external', async (_event, url) => shell.openExternal(url));
  ipcMain.on('terminal:input', (_event, payload) => {
    sshTerminalManager.handleInput(payload.sessionId, payload.data);
  });
  ipcMain.on('terminal:resize', (_event, payload) => {
    sshTerminalManager.handleResize(payload.sessionId, payload.cols, payload.rows);
  });
  ipcMain.handle('terminal:close', async (_event, sessionId) => ({
    closed: sshTerminalManager.closeSession(sessionId)
  }));
  ipcMain.handle('app:pick-private-key', async () => handlePickPrivateKey());
  ipcMain.handle('config:export', async () => handleExportConfig());
  ipcMain.handle('config:import', async () => handleImportConfig());
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
  ipcMain.handle('forward-profiles:start', handleStartSavedForward);
  ipcMain.handle('forward-profiles:delete', async (_event, forwardProfileId) => {
    await store.deleteForwardProfile(forwardProfileId);
    return store.listForwardProfiles();
  });
  ipcMain.handle('forwards:stop', async (_event, forwardId) => {
    const stopped = await forwardManager.stop(forwardId);
    return {
      stopped
    };
  });
  ipcMain.handle('programs:install', async (_event, programId) => programsService.installProgram(programId));
  ipcMain.handle('programs:install-all', async () => programsService.installAllPrograms());
  ipcMain.handle('programs:copy-hiddify-config', async () => programsService.copyHiddifyConfig());
  ipcMain.handle('programs:import-fxsound-preset', async () => handleImportFxSoundPreset());
  ipcMain.handle('programs:install-bundled-fxsound-preset', async () => programsService.installBundledFxSoundPreset());
}

app.whenReady().then(async () => {
  store = new AppStore(app.getPath('userData'));
  await store.init();
  await cleanupLauncherArtifacts(app.getPath('userData'));
  sshTerminalManager = new SshTerminalWindowManager({
    preloadPath: path.join(__dirname, '..', 'preload.js'),
    htmlPath: path.join(__dirname, '..', 'renderer', 'terminal.html')
  });

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

  if (sshTerminalManager) {
    sshTerminalManager.closeAll();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
