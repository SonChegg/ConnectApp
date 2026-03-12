const net = require('node:net');
const crypto = require('node:crypto');
const { Client } = require('ssh2');

function buildConnectionOptions(options) {
  return {
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    tryKeyboard: true,
    hostVerifier: () => true
  };
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
      host: record.host,
      sshPort: record.sshPort,
      username: record.username,
      localPort: record.localPort,
      remoteHost: record.remoteHost,
      remotePort: record.remotePort,
      createdAt: record.createdAt
    };
  }

  list() {
    return Array.from(this.forwards.values()).map((record) => this.serialize(record));
  }

  async start(options) {
    const id = crypto.randomUUID();
    const connection = new Client();
    const server = net.createServer();

    return new Promise((resolve, reject) => {
      let finished = false;

      const rejectStart = (error) => {
        if (finished) {
          return;
        }

        finished = true;
        try {
          server.close();
        } catch {}
        connection.end();
        reject(error);
      };

      connection.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        if (Array.isArray(prompts) && prompts.length > 0) {
          finish([options.password]);
          return;
        }

        finish([]);
      });

      connection.on('error', (error) => {
        if (!finished) {
          rejectStart(error);
          return;
        }

        if (this.forwards.has(id)) {
          this.stop(id).catch(() => {});
        }
      });

      connection.on('close', () => {
        if (this.forwards.has(id)) {
          this.forwards.delete(id);
          this.notify();
        }
      });

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
        connection.forwardOut(
          socket.remoteAddress || '127.0.0.1',
          socket.remotePort || 0,
          options.remoteHost,
          options.remotePort,
          (error, stream) => {
            if (error) {
              socket.destroy(error);
              return;
            }

            socket.pipe(stream).pipe(socket);

            socket.on('error', () => {
              stream.end();
            });

            stream.on('error', () => {
              socket.destroy();
            });
          }
        );
      });

      connection.on('ready', () => {
        server.listen(options.localPort, '127.0.0.1', () => {
          finished = true;

          const address = server.address();
          const actualLocalPort = typeof address === 'object' && address ? address.port : options.localPort;
          const record = {
            id,
            name: options.name,
            host: options.host,
            sshPort: options.port,
            username: options.username,
            localPort: actualLocalPort,
            remoteHost: options.remoteHost,
            remotePort: options.remotePort,
            createdAt: new Date().toISOString(),
            connection,
            server
          };

          this.forwards.set(id, record);
          this.notify();
          resolve(this.serialize(record));
        });
      });

      connection.connect(buildConnectionOptions(options));
    });
  }

  async stop(id) {
    const record = this.forwards.get(id);

    if (!record) {
      return false;
    }

    this.forwards.delete(id);

    await new Promise((resolve) => {
      try {
        record.server.close(() => resolve());
      } catch {
        resolve();
      }
    });

    record.connection.end();
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
