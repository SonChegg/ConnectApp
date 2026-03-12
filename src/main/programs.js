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
      '%LOCALAPPDATA%\\Programs'
    ]
  },
  {
    id: 'winscp',
    name: 'WinSCP',
    kind: 'exe',
    url: 'https://winscp.net/download/WinSCP-6.5.5-Setup.exe/download',
    actionLabel: 'Установить',
    summary: 'Официальный классический установщик WinSCP с тихим режимом.',
    silentArgs: ['/VERYSILENT', '/CURRENTUSER', '/NORESTART'],
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
    url: 'https://code.visualstudio.com/thank-you?dv=win64',
    actionLabel: 'Установить',
    summary: 'Ставит user installer VS Code и запускает редактор после установки.',
    silentArgs: ['/VERYSILENT', '/CURRENTUSER', '/NORESTART', '/MERGETASKS=!runcode'],
    executableName: 'Code.exe',
    launchTargets: [
      '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe',
      '%PROGRAMFILES%\\Microsoft VS Code\\Code.exe'
    ],
    searchRoots: [
      '%LOCALAPPDATA%\\Programs',
      '%PROGRAMFILES%'
    ]
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
    url: 'https://github.com/fxsound2/fxsound-app/releases/download/latest/fxsound_setup.exe',
    actionLabel: 'Установить',
    summary: 'Скачивает инсталлятор, запускает его скрытно и пытается открыть FXSound.',
    silentArgs: ['/S'],
    executableName: 'FxSound.exe',
    launchTargets: [
      '%PROGRAMFILES%\\FxSound\\FxSound.exe',
      '%LOCALAPPDATA%\\Programs\\FxSound\\FxSound.exe'
    ],
    searchRoots: [
      '%PROGRAMFILES%',
      '%LOCALAPPDATA%\\Programs'
    ]
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

function parseFilename(response, fallbackName) {
  const contentDisposition = response.headers.get('content-disposition') || '';
  const fromHeader = /filename="?([^"]+)"?/i.exec(contentDisposition);

  if (fromHeader && fromHeader[1]) {
    return decodeURIComponent(fromHeader[1]);
  }

  const responseUrl = response.url || '';

  try {
    const url = new URL(responseUrl);
    const candidate = decodeURIComponent(path.basename(url.pathname));
    return candidate || fallbackName;
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
    const found = await shallowFindByName(expandedRoot, program.executableName, 4);

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

async function downloadFile(url, targetFile, fallbackName) {
  const response = await fetch(url, {
    redirect: 'follow'
  });

  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать файл: HTTP ${response.status}`);
  }

  const fileName = parseFilename(response, fallbackName);
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
    this.bundledFxSoundPresetPath = path.join(app.getAppPath(), 'assets', 'fxsound', 'default.fac');
  }

  getFxSoundPresetTargetDir() {
    return path.join(this.app.getPath('appData'), 'FxSound', 'Presets');
  }

  async getProgramsPayload() {
    return {
      items: PROGRAMS.map((program) => ({
        id: program.id,
        name: program.name,
        kind: program.kind,
        url: program.url,
        actionLabel: program.actionLabel,
        summary: program.summary
      })),
      hasBundledFxSoundPreset: await pathExists(this.bundledFxSoundPresetPath),
      bundledFxSoundPresetPath: this.bundledFxSoundPresetPath,
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
    const downloadedFile = await downloadFile(program.url, path.join(targetDir, 'download.bin'), `${program.id}.${program.kind}`);

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

    await runCommand(downloadedFile, program.silentArgs, {
      windowsHide: true,
      successCodes: [0, 1641, 3010]
    });

    const executable = await findProgramExecutable(program);

    if (!executable) {
      return {
        message: `${program.name} установлен, но путь запуска найти не удалось.`,
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

    if (await pathExists(this.bundledFxSoundPresetPath)) {
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

    if (!await pathExists(this.bundledFxSoundPresetPath)) {
      throw new Error(`Не найден встроенный пресет: ${this.bundledFxSoundPresetPath}`);
    }

    return this.importFxSoundPreset(this.bundledFxSoundPresetPath);
  }
}

module.exports = {
  HIDDIFY_CONFIG,
  ProgramsService
};
