const crypto = require('node:crypto');
const { BrowserWindow } = require('electron');
const { Client } = require('ssh2');
const { getReconnectPlan } = require('./ssh-reconnect-policy');

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

  sendStatus(record, state, message) {
    if (record.disposed) {
      return;
    }

    this.send(record, 'terminal:status', {
      state,
      message
    });
  }

  writeTerminalMessage(record, message) {
    if (!message) {
      return;
    }

    this.send(record, 'terminal:data', `\r\n${message}\r\n`);
  }

  finalize(record, status, message) {
    if (record.ended) {
      return;
    }

    clearTimeout(record.reconnectTimer);
    record.shell = null;
    this.sendStatus(record, status, message);
    this.writeTerminalMessage(record, message);
    record.ended = true;
  }

  cleanupConnection(record) {
    if (record.shell) {
      try {
        record.shell.end();
      } catch {}
    }

    record.shell = null;

    if (record.connection) {
      try {
        record.connection.end();
      } catch {}
    }

    record.connection = null;
  }

  handleUnexpectedDisconnect(record, generation, message) {
    if (record.disposed || record.ended || record.disconnectHandledGeneration === generation) {
      return;
    }

    record.disconnectHandledGeneration = generation;
    this.cleanupConnection(record);

    const plan = getReconnectPlan(record.reconnectAttempt || 0);

    if (!plan) {
      this.finalize(record, 'ended', 'Не удалось восстановить SSH-соединение. Сессия отключена.');
      return;
    }

    record.reconnectAttempt = plan.attemptNumber;
    const reconnectMessage = `${message} Переподключение ${plan.attemptNumber}/${plan.totalAttempts}${plan.delayMs > 0 ? ` через ${Math.round(plan.delayMs / 1000)} сек.` : ' сейчас.'}`;
    this.sendStatus(record, 'reconnecting', reconnectMessage);
    this.writeTerminalMessage(record, reconnectMessage);

    clearTimeout(record.reconnectTimer);
    record.reconnectTimer = setTimeout(() => {
      this.connectRecord(record);
    }, plan.delayMs);
  }

  connectRecord(record) {
    if (record.disposed || record.ended) {
      return;
    }

    const generation = (record.generation || 0) + 1;
    const connection = new Client();
    record.generation = generation;
    record.connection = connection;
    record.disconnectHandledGeneration = 0;
    record.remoteShellExited = false;

    if (record.hasEverConnected) {
      this.sendStatus(
        record,
        'reconnecting',
        `Повторное подключение к ${record.username}@${record.profile.host}`
      );
    } else {
      this.sendStatus(
        record,
        'connecting',
        `Подключение к ${record.username}@${record.profile.host}`
      );
    }

    connection.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      if (record.password && Array.isArray(prompts) && prompts.length > 0) {
        finish([record.password]);
        return;
      }

      finish([]);
    });

    connection.on('error', (error) => {
      if (record.disposed || record.ended || record.generation !== generation) {
        return;
      }

      this.handleUnexpectedDisconnect(record, generation, `Ошибка SSH: ${error.message}`);
    });

    connection.on('close', () => {
      if (record.disposed || record.ended || record.generation !== generation) {
        return;
      }

      if (record.remoteShellExited) {
        this.finalize(record, 'ended', 'Сессия завершена.');
        return;
      }

      this.handleUnexpectedDisconnect(record, generation, 'SSH-соединение потеряно.');
    });

    connection.on('ready', () => {
      if (record.disposed || record.ended || record.generation !== generation) {
        return;
      }

      const restoredConnection = record.hasEverConnected;
      record.hasEverConnected = true;
      record.reconnectAttempt = 0;
      clearTimeout(record.reconnectTimer);
      this.sendStatus(record, 'connected', `Подключено к ${record.username}@${record.profile.host}`);

      connection.shell({
        term: 'xterm-256color',
        cols: record.cols,
        rows: record.rows
      }, (error, stream) => {
        if (record.disposed || record.ended || record.generation !== generation) {
          if (stream) {
            try {
              stream.end();
            } catch {}
          }
          return;
        }

        if (error) {
          this.handleUnexpectedDisconnect(record, generation, `Не удалось открыть shell: ${error.message}`);
          return;
        }

        record.shell = stream;
        stream.setEncoding('utf8');

        stream.on('data', (chunk) => {
          this.send(record, 'terminal:data', chunk);
        });

        stream.on('exit', () => {
          record.remoteShellExited = true;
        });

        stream.on('close', () => {
          if (record.disposed || record.ended || record.generation !== generation) {
            return;
          }

          record.shell = null;

          if (record.remoteShellExited) {
            this.finalize(record, 'ended', 'Сессия завершена.');
            try {
              connection.end();
            } catch {}
            return;
          }

          this.handleUnexpectedDisconnect(record, generation, 'SSH-сессия оборвалась.');
        });

        this.writeTerminalMessage(
          record,
          restoredConnection
            ? `Соединение восстановлено: ${record.username}@${record.profile.host}`
            : `Подключено к ${record.username}@${record.profile.host}. Для выхода используйте команду exit.`
        );
        this.send(record, 'terminal:data', '\r\n');
      });
    });

    connection.connect(buildConnectionOptions({
      host: record.profile.host,
      port: record.profile.port,
      username: record.username,
      password: record.password,
      privateKey: record.privateKey,
      passphrase: record.passphrase
    }));
  }

  async openSession({ profile, username, password, privateKey, passphrase }) {
    const sessionId = crypto.randomUUID();
    const window = new BrowserWindow({
      width: 1100,
      height: 700,
      minWidth: 780,
      minHeight: 460,
      backgroundColor: '#070a12',
      title: '',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#e8ecf6',
        height: 40
      },
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    window.removeMenu();
    window.setTitle('');

    const record = {
      id: sessionId,
      window,
      connection: null,
      shell: null,
      ended: false,
      disposed: false,
      reconnectTimer: null,
      reconnectAttempt: 0,
      disconnectHandledGeneration: 0,
      generation: 0,
      remoteShellExited: false,
      hasEverConnected: false,
      profile,
      username,
      password,
      privateKey,
      passphrase,
      cols: 120,
      rows: 40
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

    this.connectRecord(record);

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

    if (!record) {
      return false;
    }

    const nextCols = Math.max(2, Number(cols) || 120);
    const nextRows = Math.max(1, Number(rows) || 40);
    record.cols = nextCols;
    record.rows = nextRows;

    if (!record.shell) {
      return false;
    }

    record.shell.setWindow(nextRows, nextCols, 0, 0);
    return true;
  }

  closeSession(sessionId) {
    const record = this.sessions.get(sessionId);

    if (!record || record.disposed) {
      return false;
    }

    record.disposed = true;
    clearTimeout(record.reconnectTimer);
    this.sessions.delete(sessionId);
    this.cleanupConnection(record);

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
