const fs = require('node:fs/promises');
const { Client } = require('ssh2');

async function main() {
  const sessionFile = process.argv[2];

  if (!sessionFile) {
    throw new Error('Путь к файлу сессии не передан.');
  }

  const raw = await fs.readFile(sessionFile, 'utf8');
  await fs.unlink(sessionFile).catch(() => {});

  const session = JSON.parse(raw);
  const connection = new Client();
  let shellStream = null;
  let rawModeEnabled = false;

  function restoreTerminal() {
    if (process.stdin.isTTY && rawModeEnabled) {
      process.stdin.setRawMode(false);
    }

    process.stdin.pause();
  }

  function exitWith(code) {
    restoreTerminal();
    connection.end();
    process.exit(code);
  }

  connection.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    if (Array.isArray(prompts) && prompts.length > 0) {
      finish([session.password]);
      return;
    }

    finish([]);
  });

  connection.on('error', (error) => {
    process.stderr.write(`\r\nОшибка SSH: ${error.message}\r\n`);
    exitWith(1);
  });

  connection.on('ready', () => {
    process.stdout.write(`Подключено к ${session.username}@${session.host}. Для выхода нажмите Ctrl+].\r\n\r\n`);

    connection.shell({
      term: process.env.TERM || 'xterm-256color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40
    }, (error, stream) => {
      if (error) {
        process.stderr.write(`\r\nНе удалось открыть shell: ${error.message}\r\n`);
        exitWith(1);
        return;
      }

      shellStream = stream;

      stream.on('close', () => {
        process.stdout.write('\r\nСессия завершена.\r\n');
        exitWith(0);
      });

      stream.on('data', (chunk) => {
        process.stdout.write(chunk);
      });

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        rawModeEnabled = true;
      }

      process.stdin.resume();
      process.stdin.on('data', (chunk) => {
        if (chunk.length === 1 && chunk[0] === 0x1d) {
          process.stdout.write('\r\nОтключение...\r\n');
          exitWith(0);
        }

        stream.write(chunk);
      });
    });
  });

  process.stdout.on('resize', () => {
    if (!shellStream) {
      return;
    }

    shellStream.setWindow(
      process.stdout.rows || 40,
      process.stdout.columns || 120,
      0,
      0
    );
  });

  process.on('SIGINT', () => {
    if (shellStream) {
      shellStream.write('\u0003');
      return;
    }

    exitWith(130);
  });

  process.on('SIGTERM', () => {
    exitWith(0);
  });

  connection.connect({
    host: session.host,
    port: session.port,
    username: session.username,
    password: session.password,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    tryKeyboard: true,
    hostVerifier: () => true
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
