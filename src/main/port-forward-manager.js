const net = require('node:net');
const crypto = require('node:crypto');
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

function destroyActiveChannels(channels) {
  for (const channel of channels) {
    if (channel && typeof channel.destroy === 'function') {
      channel.destroy();
    }
  }

  channels.clear();
}

class PortForwardManager {
  constructor(onChanged = () => {}) {
    this.onChanged = onChanged;
    this.forwards = new Map();
  }

  notify() {
    this.onChanged(this.list());
  }

  serialize(record) {
    return {
      id: record.id,
      name: record.name,
      forwardProfileId: record.forwardProfileId,
      host: record.host,
      sshPort: record.sshPort,
      username: record.username,
      localPort: record.localPort,
      remoteHost: record.remoteHost,
      remotePort: record.remotePort,
      createdAt: record.createdAt,
      status: record.status || 'active',
      statusMessage: record.statusMessage || '',
      reconnectAttempt: record.reconnectAttempt || 0,
      reconnectTotal: record.reconnectTotal || 0
    };
  }

  list() {
    return Array.from(this.forwards.values()).map((record) => this.serialize(record));
  }

  updateRecordStatus(record, status, message) {
    record.status = status;
    record.statusMessage = message || '';
    record.reconnectTotal = getReconnectPlan(0)?.totalAttempts || 0;
    this.notify();
  }

  cleanupConnection(record) {
    destroyActiveChannels(record.sockets || new Set());
    destroyActiveChannels(record.streams || new Set());

    if (record.connection) {
      try {
        record.connection.end();
      } catch {}
    }

    record.connection = null;
  }

  scheduleReconnect(record, reasonMessage) {
    if (record.disposed || !this.forwards.has(record.id)) {
      return;
    }

    const plan = getReconnectPlan(record.reconnectAttempt || 0);

    if (!plan) {
      this.forwards.delete(record.id);
      this.cleanupConnection(record);
      try {
        record.server.close();
      } catch {}
      this.notify();
      return;
    }

    record.reconnectAttempt = plan.attemptNumber;
    this.updateRecordStatus(
      record,
      'reconnecting',
      `${reasonMessage} Переподключение ${plan.attemptNumber}/${plan.totalAttempts}${plan.delayMs > 0 ? ` через ${Math.round(plan.delayMs / 1000)} сек.` : ' сейчас.'}`
    );

    clearTimeout(record.reconnectTimer);
    record.reconnectTimer = setTimeout(() => {
      this.connectRecord(record);
    }, plan.delayMs);
  }

  connectRecord(record, lifecycle = {}) {
    if (record.disposed) {
      return;
    }

    const connection = new Client();
    const generation = (record.generation || 0) + 1;
    record.generation = generation;
    record.connection = connection;
    record.disconnectHandledGeneration = 0;

    connection.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      if (record.password && Array.isArray(prompts) && prompts.length > 0) {
        finish([record.password]);
        return;
      }

      finish([]);
    });

    connection.on('error', (error) => {
      if (record.disposed || record.generation !== generation) {
        return;
      }

      record.lastDisconnectReason = error && error.message
        ? `SSH-туннель оборвался: ${error.message}`
        : 'SSH-туннель оборвался.';

      if (!record.started) {
        lifecycle.rejectStart?.(error);
        return;
      }

      if (record.disconnectHandledGeneration === generation) {
        return;
      }

      record.disconnectHandledGeneration = generation;
      this.cleanupConnection(record);
      this.scheduleReconnect(record, record.lastDisconnectReason);
    });

    connection.on('close', () => {
      if (record.disposed || record.generation !== generation) {
        return;
      }

      if (!record.started) {
        lifecycle.rejectStart?.(new Error('SSH-соединение было закрыто до запуска проброса.'));
        return;
      }

      if (record.disconnectHandledGeneration === generation) {
        return;
      }

      record.disconnectHandledGeneration = generation;
      this.cleanupConnection(record);
      this.scheduleReconnect(record, record.lastDisconnectReason || 'SSH-соединение потеряно.');
    });

    connection.on('ready', () => {
      if (record.disposed || record.generation !== generation) {
        return;
      }

      record.lastDisconnectReason = '';
      record.reconnectAttempt = 0;
      clearTimeout(record.reconnectTimer);

      if (!record.started) {
        lifecycle.onReady?.(connection);
        return;
      }

      this.updateRecordStatus(record, 'active', 'Туннель активен.');
    });

    connection.connect(buildConnectionOptions(record));
  }

  async start(options) {
    const id = crypto.randomUUID();
    const server = net.createServer();
    const sockets = new Set();
    const streams = new Set();
    const record = {
      id,
      name: options.name,
      forwardProfileId: options.forwardProfileId || null,
      host: options.host,
      port: options.port,
      sshPort: options.port,
      username: options.username,
      password: options.password,
      privateKey: options.privateKey,
      passphrase: options.passphrase,
      localPort: options.localPort,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort,
      createdAt: new Date().toISOString(),
      server,
      sockets,
      streams,
      connection: null,
      reconnectTimer: null,
      reconnectAttempt: 0,
      reconnectTotal: getReconnectPlan(0)?.totalAttempts || 0,
      status: 'connecting',
      statusMessage: 'Подключение SSH-туннеля...',
      disconnectHandledGeneration: 0,
      generation: 0,
      started: false,
      disposed: false,
      lastDisconnectReason: ''
    };

    return new Promise((resolve, reject) => {
      let finished = false;

      const rejectStart = (error) => {
        if (finished) {
          return;
        }

        finished = true;
        record.disposed = true;
        clearTimeout(record.reconnectTimer);
        destroyActiveChannels(sockets);
        destroyActiveChannels(streams);
        try {
          server.close();
        } catch {}
        if (record.connection) {
          record.connection.end();
        }
        reject(error);
      };

      server.on('error', (error) => {
        if (!finished) {
          rejectStart(error);
          return;
        }

        if (this.forwards.has(id)) {
          this.stop(id).catch(() => {});
        }
      });

      server.on('connection', (socket) => {
        if (!this.forwards.has(id)) {
          socket.destroy();
          return;
        }

        if (!record.connection || record.status !== 'active') {
          socket.destroy();
          return;
        }

        sockets.add(socket);
        socket.on('close', () => {
          sockets.delete(socket);
        });

        record.connection.forwardOut(
          socket.remoteAddress || '127.0.0.1',
          socket.remotePort || 0,
          options.remoteHost,
          options.remotePort,
          (error, stream) => {
            if (error) {
              socket.destroy(error);
              return;
            }

            if (!this.forwards.has(id)) {
              stream.destroy();
              socket.destroy();
              return;
            }

            streams.add(stream);

            stream.on('close', () => {
              streams.delete(stream);
            });

            socket.pipe(stream).pipe(socket);

            socket.on('error', () => {
              stream.end();
            });

            stream.on('error', () => {
              socket.destroy();
            });

            socket.on('close', () => {
              if (!stream.destroyed) {
                stream.destroy();
              }
            });

            stream.on('close', () => {
              if (!socket.destroyed) {
                socket.destroy();
              }
            });
          }
        );
      });

      this.connectRecord(record, {
        rejectStart,
        onReady: () => {
        server.listen(options.localPort, '127.0.0.1', () => {
          finished = true;
          record.started = true;

          const address = server.address();
          const actualLocalPort = typeof address === 'object' && address ? address.port : options.localPort;
          record.localPort = actualLocalPort;
          record.status = 'active';
          record.statusMessage = 'Туннель активен.';

          this.forwards.set(id, record);
          this.notify();
          resolve(this.serialize(record));
        });
        }
      });
    });
  }

  async stop(id) {
    const record = this.forwards.get(id);

    if (!record) {
      return false;
    }

    record.disposed = true;
    clearTimeout(record.reconnectTimer);
    this.forwards.delete(id);
    destroyActiveChannels(record.sockets || new Set());
    destroyActiveChannels(record.streams || new Set());

    await new Promise((resolve) => {
      try {
        record.server.close(() => resolve());
      } catch {
        resolve();
      }
    });

    if (record.connection) {
      record.connection.end();
    }
    this.notify();
    return true;
  }

  async stopAll() {
    const ids = Array.from(this.forwards.keys());

    for (const id of ids) {
      await this.stop(id);
    }
  }
}

module.exports = {
  PortForwardManager
};
