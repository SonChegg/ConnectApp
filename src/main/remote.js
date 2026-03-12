const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

function assertWindowsOnly() {
  if (process.platform !== 'win32') {
    throw new Error('Эта функция работает только на Windows.');
  }
}

function quoteWindowsValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function runCommand(command, args, options = {}) {
  const successCodes = options.successCodes || [0];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: Boolean(options.detached),
      windowsHide: options.windowsHide !== false
    });

    child.on('error', reject);

    if (options.waitForExit === false) {
      child.unref();
      resolve();
      return;
    }

    child.on('exit', (code) => {
      if (successCodes.includes(code)) {
        resolve();
        return;
      }

      reject(new Error(`${command} завершился с кодом ${code}`));
    });
  });
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeRdpFile(filePath, profile, username) {
  const fullAddress = profile.port && Number(profile.port) !== 3389
    ? `${profile.host}:${profile.port}`
    : profile.host;

  const lines = [
    `full address:s:${fullAddress}`,
    `username:s:${username}`,
    'prompt for credentials on client:i:0',
    'administrative session:i:0',
    'screen mode id:i:2',
    'use multimon:i:0',
    'desktopwidth:i:1600',
    'desktopheight:i:900',
    'session bpp:i:32',
    'audiomode:i:0',
    'redirectclipboard:i:1',
    'authentication level:i:2',
    'enablecredsspsupport:i:1'
  ];

  await fs.writeFile(filePath, lines.join('\r\n'), 'utf8');
}

async function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });

    child.on('error', reject);
    child.unref();
    resolve();
  });
}

async function cacheRdpCredential(host, username, password) {
  await runCommand('cmdkey.exe', [
    `/generic:TERMSRV/${host}`,
    `/user:${username}`,
    `/pass:${password}`
  ], {
    windowsHide: true,
    successCodes: [0]
  });
}

async function removeRdpCredential(host) {
  await runCommand('cmdkey.exe', [
    `/delete:TERMSRV/${host}`
  ], {
    windowsHide: true,
    successCodes: [0, 1]
  });
}

async function launchWindowsRdp(options) {
  assertWindowsOnly();

  const rdpDir = path.join(options.userDataDir, 'rdp');
  const rdpFile = path.join(rdpDir, `${options.profile.id}.rdp`);

  await ensureDirectory(rdpDir);
  await writeRdpFile(rdpFile, options.profile, options.username);

  if (options.password) {
    await cacheRdpCredential(options.profile.host, options.username, options.password);
  }

  await spawnDetached('mstsc.exe', [rdpFile]);

  if (options.password && !options.remember) {
    setTimeout(() => {
      removeRdpCredential(options.profile.host).catch(() => {});
    }, 20000);
  }

  return {
    mode: 'rdp',
    message: `RDP запущен для ${options.profile.name}`
  };
}

async function launchLinuxTerminal(options) {
  assertWindowsOnly();

  const sessionsDir = path.join(options.userDataDir, 'sessions');
  const launchersDir = path.join(options.userDataDir, 'launchers');
  const sessionFile = path.join(sessionsDir, `${options.profile.id}-${Date.now()}.json`);
  const launcherFile = path.join(launchersDir, `${options.profile.id}-${Date.now()}.cmd`);
  const helperPath = path.join(options.appPath, 'src', 'helpers', 'ssh-terminal.js');

  await ensureDirectory(sessionsDir);
  await ensureDirectory(launchersDir);

  await fs.writeFile(sessionFile, JSON.stringify({
    host: options.profile.host,
    port: options.profile.port,
    username: options.username,
    password: options.password,
    title: options.profile.name
  }, null, 2), 'utf8');

  const launcherBody = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul',
    'set "LANG=C.UTF-8"',
    'set "LC_ALL=C.UTF-8"',
    'set "TERM=xterm-256color"',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `${quoteWindowsValue(options.execPath)} ${quoteWindowsValue(helperPath)} ${quoteWindowsValue(sessionFile)}`
  ].join('\r\n');

  await fs.writeFile(launcherFile, launcherBody, 'utf8');

  try {
    await spawnDetached('wt.exe', [
      'new-tab',
      '--title',
      options.profile.name,
      'cmd.exe',
      '/k',
      launcherFile
    ]);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await spawnDetached('cmd.exe', ['/k', launcherFile]);
    } else {
      throw error;
    }
  }

  return {
    mode: 'ssh',
    message: `Терминал открыт для ${options.profile.name}`
  };
}

async function cleanupLauncherArtifacts(userDataDir) {
  const targets = [
    path.join(userDataDir, 'sessions'),
    path.join(userDataDir, 'launchers')
  ];

  const maxAgeMs = 3 * 24 * 60 * 60 * 1000;

  for (const dirPath of targets) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);

        if ((Date.now() - stats.mtimeMs) > maxAgeMs) {
          await fs.unlink(fullPath).catch(() => {});
        }
      }
    } catch {}
  }
}

module.exports = {
  cleanupLauncherArtifacts,
  launchLinuxTerminal,
  launchWindowsRdp
};
