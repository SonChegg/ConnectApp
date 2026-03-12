const terminalTitle = document.getElementById('terminalTitle');
const terminalSubtitle = document.getElementById('terminalSubtitle');
const terminalStatus = document.getElementById('terminalStatus');
const terminalViewport = document.getElementById('terminalViewport');

const term = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontFamily: 'Consolas, "Cascadia Mono", monospace',
  fontSize: 15,
  lineHeight: 1.25,
  scrollback: 5000,
  theme: {
    background: '#040a12',
    foreground: '#d6e4f0',
    cursor: '#58e0bc',
    selectionBackground: 'rgba(88, 224, 188, 0.24)',
    black: '#07101c',
    red: '#ff7a88',
    green: '#58e0bc',
    yellow: '#ffd36b',
    blue: '#6cb2ff',
    magenta: '#c58cff',
    cyan: '#65d9ff',
    white: '#eaf4ff',
    brightBlack: '#58718c',
    brightRed: '#ff9aa5',
    brightGreen: '#81ffd7',
    brightYellow: '#ffe18d',
    brightBlue: '#8cc4ff',
    brightMagenta: '#dca5ff',
    brightCyan: '#89e6ff',
    brightWhite: '#ffffff'
  }
});
const fitAddon = new FitAddon.FitAddon();
let sessionId = '';
let resizeTimer = null;

term.loadAddon(fitAddon);
term.open(terminalViewport);
term.focus();

function updateStatus(payload) {
  if (!payload) {
    return;
  }

  terminalStatus.textContent = payload.message || '';
}

function sendResize() {
  if (!sessionId) {
    return;
  }

  window.connectApp.terminalResize(sessionId, term.cols, term.rows);
}

function fitTerminal() {
  fitAddon.fit();

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(sendResize, 10);
}

term.onData((data) => {
  if (!sessionId) {
    return;
  }

  window.connectApp.terminalInput(sessionId, data);
});

const detachBootstrap = window.connectApp.onTerminalBootstrap((payload) => {
  sessionId = payload.sessionId;
  terminalTitle.textContent = payload.title || 'SSH';
  terminalSubtitle.textContent = payload.subtitle || '';
  document.title = payload.title ? `${payload.title} - SSH` : 'SSH';
  fitTerminal();
});

const detachData = window.connectApp.onTerminalData((chunk) => {
  if (typeof chunk === 'string' && chunk.length > 0) {
    term.write(chunk);
  }
});

const detachStatus = window.connectApp.onTerminalStatus((payload) => {
  updateStatus(payload);
});

window.addEventListener('resize', () => {
  fitTerminal();
});

window.addEventListener('beforeunload', () => {
  clearTimeout(resizeTimer);

  if (sessionId) {
    window.connectApp.terminalClose(sessionId).catch(() => {});
  }

  detachBootstrap();
  detachData();
  detachStatus();
});
