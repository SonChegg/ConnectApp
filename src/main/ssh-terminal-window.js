const crypto = require('node:crypto');
const { BrowserWindow } = require('electron');
const { Client } = require('ssh2');

function buildConnectionOptions(options) {
  const connectionOptions = {
    host: options.host,
    port: options.port,
    username: options.username,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    tryKeyboard: true,
    hostVerifier: () => true
  };

  if (options.password) {
    connectionOptions.password = options.password;
  }

  if (options.privateKey) {
    connectionOptions.privateKey = options.privateKey;
  }

  if (options.passphrase) {
    connectionOptions.passphrase = options.passphrase;
  }

  return connectionOptions;
}

class SshTerminalWindowManager {
  constructor({ preloadPath, htmlPath }) {
    this.preloadPath = preloadPath;
    this.htmlPath = htmlPath;
    this.sessions = new Map();
  }

  send(record, channel, payload) {
    if (!record.window || record.window.isDestroyed()) {
      return;
    }

    record.window.webContents.send(channel, payload);
  }

  markEnded(record, status, message) {
    if (record.ended) {
      return;
    }

    record.ended = true;
    record.shell = null;
    this.send(record, 'terminal:status', {
      state: status,
      message
    });

    if (message) {
      this.send(record, 'terminal:data', `\r\n${message}\r\n`);
    }
  }

  async openSession({ profile, username, password, privateKey, passphrase }) {
    const sessionId = crypto.randomUUID();
    const window = new BrowserWindow({
      width: 1100,
      height: 700,
      minWidth: 780,
      minHeight: 460,
      backgroundColor: '#08111f',
      title: `${profile.name} - SSH`,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    window.removeMenu();

    const record = {
      id: sessionId,
      window,
      connection: new Client(),
      shell: null,
      ended: false,
      disposed: false
    };

    this.sessions.set(sessionId, record);

    window.on('closed', () => {
      this.closeSession(sessionId);
    });

    await window.loadFile(this.htmlPath);

    this.send(record, 'terminal:bootstrap', {
      sessionId,
      title: profile.name,
      subtitle: `${username}@${profile.host}:${profile.port}`
    });

    this.send(record, 'terminal:status', {
      state: 'connecting',
      message: `Подключение к ${username}@${profile.host}`
    });

    record.connection.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      if (password && Array.isArray(prompts) && prompts.length > 0) {
        finish([password]);
        return;
      }

      finish([]);
    });

    record.connection.on('error', (error) => {
      this.markEnded(record, 'error', `Ошибка SSH: ${error.message}`);
    });

    record.connection.on('close', () => {
      this.markEnded(record, 'ended', 'Сессия завершена.');
    });

    record.connection.on('ready', () => {
      this.send(record, 'terminal:status', {
        state: 'connected',
        message: `Подключено к ${username}@${profile.host}`
      });

      record.connection.shell({
        term: 'xterm-256color',
        cols: 120,
        rows: 40
      }, (error, stream) => {
        if (error) {
          this.markEnded(record, 'error', `Не удалось открыть shell: ${error.message}`);
          return;
        }

        record.shell = stream;
        stream.setEncoding('utf8');

        stream.on('data', (chunk) => {
          this.send(record, 'terminal:data', chunk);
        });

        stream.on('close', () => {
          this.markEnded(record, 'ended', 'Сессия завершена.');
        });

        this.send(record, 'terminal:data', `Подключено к ${username}@${profile.host}. Для выхода используйте команду exit.\r\n\r\n`);
      });
    });

    record.connection.connect(buildConnectionOptions({
      host: profile.host,
      port: profile.port,
      username,
      password,
      privateKey,
      passphrase
    }));

    return {
      mode: 'ssh',
      message: `Терминал открыт для ${profile.name}`
    };
  }

  handleInput(sessionId, data) {
    const record = this.sessions.get(sessionId);

    if (!record || !record.shell || typeof data !== 'string' || data.length === 0) {
      return false;
    }

    record.shell.write(data);
    return true;
  }

  handleResize(sessionId, cols, rows) {
    const record = this.sessions.get(sessionId);

    if (!record || !record.shell) {
      return false;
    }

    const nextCols = Math.max(2, Number(cols) || 120);
    const nextRows = Math.max(1, Number(rows) || 40);
    record.shell.setWindow(nextRows, nextCols, 0, 0);
    return true;
  }

  closeSession(sessionId) {
    const record = this.sessions.get(sessionId);

    if (!record || record.disposed) {
      return false;
    }

    record.disposed = true;
    this.sessions.delete(sessionId);

    if (record.shell) {
      try {
        record.shell.end();
      } catch {}
    }

    try {
      record.connection.end();
    } catch {}

    if (record.window && !record.window.isDestroyed()) {
      record.window.destroy();
    }

    return true;
  }

  closeAll() {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.closeSession(sessionId);
    }
  }
}

module.exports = {
  SshTerminalWindowManager
};
