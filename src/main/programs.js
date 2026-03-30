const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { clipboard, shell } = require('electron');

const HIDDIFY_CONFIG = `{
  "region": "other",
  "block-ads": false,
  "use-xray-core-when-possible": false,
  "execute-config-as-is": false,
  "log-level": "warn",
  "resolve-destination": false,
  "ipv6-mode": "ipv4_only",
  "remote-dns-address": "udp://1.1.1.2",
  "remote-dns-domain-strategy": "prefer_ipv4",
  "direct-dns-address": "1.1.1.2",
  "direct-dns-domain-strategy": "prefer_ipv4",
  "mixed-port": 12334,
  "tproxy-port": 12335,
  "local-dns-port": 16450,
  "tun-implementation": "gvisor",
  "mtu": 9000,
  "strict-route": false,
  "connection-test-url": "http://captive.apple.com/hotspot-detect.html",
  "url-test-interval": 600,
  "enable-clash-api": true,
  "clash-api-port": 16756,
  "enable-tun": false,
  "enable-tun-service": false,
  "set-system-proxy": true,
  "bypass-lan": true,
  "allow-connection-from-lan": false,
  "enable-fake-dns": false,
  "enable-dns-routing": true,
  "independent-dns-cache": true,
  "rules": [],
  "mux": {
    "enable": false,
    "padding": false,
    "max-streams": 8,
    "protocol": "h2mux"
  },
  "tls-tricks": {
    "enable-fragment": true,
    "fragment-size": "10-30",
    "fragment-sleep": "2-8",
    "mixed-sni-case": true,
    "enable-padding": true,
    "padding-size": "1-1500"
  },
  "warp": {
    "enable": false,
    "mode": "proxy_over_warp",
    "wireguard-config": "",
    "license-key": "",
    "account-id": "",
    "access-token": "",
    "clean-ip": "auto",
    "clean-port": 0,
    "noise": "1-3",
    "noise-size": "10-30",
    "noise-delay": "10-30",
    "noise-mode": "m4"
  },
  "warp2": {
    "enable": false,
    "mode": "proxy_over_warp",
    "wireguard-config": "",
    "license-key": "",
    "account-id": "",
    "access-token": "",
    "clean-ip": "auto",
    "clean-port": 0,
    "noise": "1-3",
    "noise-size": "10-30",
    "noise-delay": "10-30",
    "noise-mode": "m4"
  }
}`;

const PROGRAMS = [
  {
    id: 'ayugram',
    name: 'AyuGram',
    kind: 'zip',
    url: 'https://github.com/AyuGram/AyuGramDesktop/releases/download/v6.3.10/AyuGram.zip',
    actionLabel: 'Скачать архив',
    summary: 'Портативная сборка. Архив распакуется, после чего откроется папка.',
    extractFolder: 'AyuGram'
  },
  {
    id: 'yandex-music',
    name: 'Yandex Music',
    kind: 'exe',
    url: 'https://music-desktop-application.s3.yandex.net/stable/Yandex_Music_x64_5.75.2.exe',
    actionLabel: 'Установить',
    summary: 'Скачивает установщик, запускает его скрытно и пытается открыть приложение.',
    silentArgs: ['/S'],
    executableName: 'YandexMusic.exe',
    launchTargets: [
      '%LOCALAPPDATA%\\Programs\\YandexMusic\\YandexMusic.exe',
      '%LOCALAPPDATA%\\Programs\\Yandex Music\\Yandex Music.exe'
    ],
    searchRoots: [
      '%LOCALAPPDATA%\\Programs',
      '%LOCALAPPDATA%'
    ],
    searchDepth: 6
  },
  {
    id: 'winscp',
    name: 'WinSCP',
    kind: 'exe',
    url: 'https://winscp.net/download/WinSCP-6.5.5-Setup.exe',
    actionLabel: 'Установить',
    summary: 'Официальный классический установщик WinSCP с тихим режимом.',
    installArgs: [
      ['/VERYSILENT', '/CURRENTUSER', '/NORESTART'],
      ['/SILENT', '/CURRENTUSER', '/NORESTART']
    ],
    executableName: 'WinSCP.exe',
    launchTargets: [
      '%LOCALAPPDATA%\\Programs\\WinSCP\\WinSCP.exe',
      '%PROGRAMFILES%\\WinSCP\\WinSCP.exe',
      '%PROGRAMFILES(X86)%\\WinSCP\\WinSCP.exe'
    ],
    searchRoots: [
      '%LOCALAPPDATA%\\Programs',
      '%PROGRAMFILES%',
      '%PROGRAMFILES(X86)%'
    ]
  },
  {
    id: 'vscode',
    name: 'VS Code',
    kind: 'exe',
    url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable',
    actionLabel: 'Установить',
    summary: 'Ставит user installer VS Code и запускает редактор после установки.',
    installArgs: [
      ['/VERYSILENT', '/CURRENTUSER', '/NORESTART', '/MERGETASKS=!runcode'],
      ['/SILENT', '/CURRENTUSER', '/NORESTART', '/MERGETASKS=!runcode']
    ],
    executableName: 'Code.exe',
    launchTargets: [
      '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe',
      '%PROGRAMFILES%\\Microsoft VS Code\\Code.exe'
    ],
    searchRoots: [
      '%LOCALAPPDATA%\\Programs',
      '%LOCALAPPDATA%',
      '%PROGRAMFILES%'
    ],
    searchDepth: 6
  },
  {
    id: 'hiddify',
    name: 'Hiddify',
    kind: 'zip',
    url: 'https://github.com/hiddify/hiddify-next/releases/download/v2.5.7/Hiddify-Windows-Portable-x64.zip',
    actionLabel: 'Скачать архив',
    summary: 'Портативная версия. Архив распакуется, затем откроется папка с файлами.',
    extractFolder: 'Hiddify'
  },
  {
    id: 'fxsound',
    name: 'FXSound',
    kind: 'exe',
    url: 'https://download.fxsound.com/fxsoundlatest',
    actionLabel: 'Установить',
    summary: 'Скачивает инсталлятор, запускает его скрытно и пытается открыть FXSound.',
    installArgs: [
      ['/S'],
      ['/silent'],
      ['/quiet']
    ],
    executableName: 'FxSound.exe',
    launchTargets: [
      '%PROGRAMFILES%\\FxSound\\FxSound.exe',
      '%LOCALAPPDATA%\\Programs\\FxSound\\FxSound.exe'
    ],
    searchRoots: [
      '%PROGRAMFILES%',
      '%PROGRAMFILES(X86)%',
      '%LOCALAPPDATA%',
      '%LOCALAPPDATA%\\Programs'
    ],
    searchDepth: 6
  }
];

function assertWindowsOnly() {
  if (process.platform !== 'win32') {
    throw new Error('Раздел программ рассчитан на Windows.');
  }
}

function expandEnvPath(template) {
  return template.replace(/%([^%]+)%/g, (_match, name) => process.env[name] || '');
}

async function pathExists(filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  const successCodes = options.successCodes || [0];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: options.windowsHide !== false
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (successCodes.includes(code)) {
        resolve(code);
        return;
      }

      reject(new Error(`${command} завершился с кодом ${code}`));
    });
  });
}

function hasExpectedExtension(fileName, expectedExtensions = []) {
  if (!fileName || expectedExtensions.length === 0) {
    return false;
  }

  const extension = path.extname(fileName).toLowerCase();
  return expectedExtensions.includes(extension);
}

function parseFilename(response, fallbackName, expectedExtensions = []) {
  const contentDisposition = response.headers.get('content-disposition') || '';
  const fromHeader = /filename="?([^"]+)"?/i.exec(contentDisposition);

  if (fromHeader && fromHeader[1]) {
    const fileName = decodeURIComponent(fromHeader[1]);

    if (!expectedExtensions.length || hasExpectedExtension(fileName, expectedExtensions)) {
      return fileName;
    }
  }

  const responseUrl = response.url || '';

  try {
    const url = new URL(responseUrl);
    const candidate = decodeURIComponent(path.basename(url.pathname));

    if (!candidate) {
      return fallbackName;
    }

    if (!expectedExtensions.length) {
      return candidate;
    }

    if (hasExpectedExtension(candidate, expectedExtensions)) {
      return candidate;
    }

    return fallbackName;
  } catch {
    return fallbackName;
  }
}

async function shallowFindByName(rootDir, fileName, maxDepth, currentDepth = 0) {
  if (!rootDir || currentDepth > maxDepth) {
    return null;
  }

  let entries;

  try {
    entries = await fsPromises.readdir(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return path.join(rootDir, entry.name);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const found = await shallowFindByName(
      path.join(rootDir, entry.name),
      fileName,
      maxDepth,
      currentDepth + 1
    );

    if (found) {
      return found;
    }
  }

  return null;
}

async function findProgramExecutable(program) {
  for (const target of program.launchTargets || []) {
    const expanded = expandEnvPath(target);

    if (expanded && await pathExists(expanded)) {
      return expanded;
    }
  }

  for (const root of program.searchRoots || []) {
    const expandedRoot = expandEnvPath(root);
    const searchDepth = Number(program.searchDepth) > 0 ? Number(program.searchDepth) : 4;
    const found = await shallowFindByName(expandedRoot, program.executableName, searchDepth);

    if (found) {
      return found;
    }
  }

  return null;
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

async function ensureDirectory(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

function toPowerShellStringArray(values) {
  const items = Array.isArray(values) ? values : [];
  return `@(${items.map((value) => `'${escapePowerShell(value)}'`).join(', ')})`;
}

async function runWindowsInstaller(installerPath, attempts, options = {}) {
  assertWindowsOnly();

  const strategies = Array.isArray(attempts) && attempts.length > 0
    ? attempts
    : [[]];
  let lastError = null;

  for (const args of strategies) {
    try {
      await runCommand('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$process = Start-Process -FilePath '${escapePowerShell(installerPath)}' -ArgumentList ${toPowerShellStringArray(args)} -WindowStyle Hidden -PassThru -Wait; exit $process.ExitCode`
      ], {
        windowsHide: true,
        successCodes: options.successCodes || [0, 1641, 3010]
      });

      return {
        args
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Не удалось запустить установщик.');
}

async function waitForProgramExecutable(program, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const executable = await findProgramExecutable(program);

    if (executable) {
      return executable;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
  }

  return null;
}

async function downloadFile(url, targetFile, fallbackName, expectedExtensions = []) {
  const response = await fetch(url, {
    redirect: 'follow'
  });

  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать файл: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('text/html')) {
    throw new Error(`Сервер вернул HTML-страницу вместо файла: ${url}`);
  }

  const fileName = parseFilename(response, fallbackName, expectedExtensions);
  const destination = path.join(path.dirname(targetFile), fileName);

  await ensureDirectory(path.dirname(destination));

  await pipeline(
    Readable.fromWeb(response.body),
    fs.createWriteStream(destination)
  );

  return destination;
}

async function extractZip(archivePath, destinationPath) {
  assertWindowsOnly();

  await ensureDirectory(destinationPath);

  await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath '${escapePowerShell(archivePath)}' -DestinationPath '${escapePowerShell(destinationPath)}' -Force`
  ], {
    windowsHide: true,
    successCodes: [0]
  });
}

class ProgramsService {
  constructor({ app, userDataDir }) {
    this.app = app;
    this.userDataDir = userDataDir;
    this.downloadsDir = path.join(userDataDir, 'downloads');
    this.portableDir = path.join(userDataDir, 'portable-apps');
    this.bundledFxSoundPresetDir = path.join(app.getAppPath(), 'assets', 'fxsound');
  }

  getFxSoundPresetTargetDir() {
    return path.join(this.app.getPath('appData'), 'FxSound', 'Presets');
  }

  async resolveBundledFxSoundPresetPath() {
    const preferredPath = path.join(this.bundledFxSoundPresetDir, 'default.fac');

    if (await pathExists(preferredPath)) {
      return preferredPath;
    }

    let entries;

    try {
      entries = await fsPromises.readdir(this.bundledFxSoundPresetDir, { withFileTypes: true });
    } catch {
      return preferredPath;
    }

    const presetEntry = entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.fac')
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
      [0];

    if (!presetEntry) {
      return preferredPath;
    }

    return path.join(this.bundledFxSoundPresetDir, presetEntry.name);
  }

  async getProgramsPayload() {
    const bundledFxSoundPresetPath = await this.resolveBundledFxSoundPresetPath();
    const hasBundledFxSoundPreset = await pathExists(bundledFxSoundPresetPath);

    return {
      items: PROGRAMS.map((program) => ({
        id: program.id,
        name: program.name,
        kind: program.kind,
        url: program.url,
        actionLabel: program.actionLabel,
        summary: program.summary
      })),
      hasBundledFxSoundPreset,
      bundledFxSoundPresetPath,
      fxSoundPresetTargetDir: this.getFxSoundPresetTargetDir()
    };
  }

  async copyHiddifyConfig() {
    clipboard.writeText(HIDDIFY_CONFIG);
    return {
      message: 'Конфиг Hiddify скопирован в буфер.'
    };
  }

  getProgramOrThrow(programId) {
    const program = PROGRAMS.find((item) => item.id === programId);

    if (!program) {
      throw new Error('Неизвестная программа.');
    }

    return program;
  }

  async installProgramDefinition(program, options = {}) {
    const openPortableFolder = options.openPortableFolder !== false;
    const openExecutable = options.openExecutable !== false;
    const targetDir = path.join(this.downloadsDir, program.id);
    const downloadedFile = await downloadFile(
      program.url,
      path.join(targetDir, 'download.bin'),
      `${program.id}.${program.kind}`,
      [`.${program.kind}`]
    );

    if (program.kind === 'zip') {
      const destination = path.join(this.portableDir, program.extractFolder);
      await extractZip(downloadedFile, destination);

      if (openPortableFolder) {
        const openError = await shell.openPath(destination);

        if (openError) {
          throw new Error(openError);
        }
      }

      return {
        message: `${program.name} распакован${openPortableFolder ? '. Папка открыта' : ''}.`,
        type: 'zip',
        destination
      };
    }

    await runWindowsInstaller(downloadedFile, program.installArgs || [program.silentArgs || []], {
      successCodes: [0, 1641, 3010]
    });

    const executable = await waitForProgramExecutable(program, program.installTimeoutMs || 90000);

    if (!executable) {
      return {
        message: `${program.name} установщик завершил работу, но путь запуска найти не удалось.`,
        type: 'exe'
      };
    }

    if (openExecutable) {
      const openError = await shell.openPath(executable);

      if (openError) {
        throw new Error(openError);
      }
    }

    return {
      message: `${program.name} установлен${openExecutable ? ' и запущен' : ''}.`,
      type: 'exe',
      executable
    };
  }

  async installProgram(programId) {
    assertWindowsOnly();
    const program = this.getProgramOrThrow(programId);
    return this.installProgramDefinition(program, {
      openExecutable: true,
      openPortableFolder: true
    });
  }

  async installAllPrograms() {
    assertWindowsOnly();

    const installed = [];
    const failed = [];

    for (const program of PROGRAMS) {
      try {
        const result = await this.installProgramDefinition(program, {
          openExecutable: true,
          openPortableFolder: true
        });

        installed.push(result.message);
      } catch (error) {
        failed.push(`${program.name}: ${error.message}`);
      }
    }

    const bundledFxSoundPresetPath = await this.resolveBundledFxSoundPresetPath();

    if (await pathExists(bundledFxSoundPresetPath)) {
      try {
        const presetResult = await this.installBundledFxSoundPreset();
        installed.push(`FxSound preset: ${presetResult.message}`);
      } catch (error) {
        failed.push(`FxSound preset: ${error.message}`);
      }
    }

    if (installed.length === 0 && failed.length > 0) {
      throw new Error(`Не удалось установить программы. ${failed.join(' | ')}`);
    }

    let message = `Готово: ${installed.length} действий выполнено.`;

    if (failed.length > 0) {
      message += ` Ошибки: ${failed.join(' | ')}`;
    }

    return {
      installed,
      failed,
      message
    };
  }

  async importFxSoundPreset(sourceFile) {
    assertWindowsOnly();

    if (!sourceFile) {
      throw new Error('Файл пресета не выбран.');
    }

    const targetDir = this.getFxSoundPresetTargetDir();
    const fileName = path.basename(sourceFile);
    const targetFile = path.join(targetDir, fileName);

    await ensureDirectory(targetDir);
    await fsPromises.copyFile(sourceFile, targetFile);

    return {
      message: `Пресет скопирован в ${targetFile}`
    };
  }

  async installBundledFxSoundPreset() {
    assertWindowsOnly();

    const bundledFxSoundPresetPath = await this.resolveBundledFxSoundPresetPath();

    if (!await pathExists(bundledFxSoundPresetPath)) {
      throw new Error(`Не найден встроенный пресет: ${bundledFxSoundPresetPath}`);
    }

    return this.importFxSoundPreset(bundledFxSoundPresetPath);
  }
}

module.exports = {
  HIDDIFY_CONFIG,
  ProgramsService
};
