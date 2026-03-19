const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('connectApp', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  terminalInput: (sessionId, data) => ipcRenderer.send('terminal:input', { sessionId, data }),
  terminalResize: (sessionId, cols, rows) => ipcRenderer.send('terminal:resize', { sessionId, cols, rows }),
  terminalClose: (sessionId) => ipcRenderer.invoke('terminal:close', sessionId),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text) => clipboard.writeText(String(text || '')),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  saveProfile: (payload) => ipcRenderer.invoke('profiles:save', payload),
  deleteProfile: (profileId) => ipcRenderer.invoke('profiles:delete', profileId),
  connectProfile: (payload) => ipcRenderer.invoke('profiles:connect', payload),
  startForward: (payload) => ipcRenderer.invoke('forwards:start', payload),
  startSavedForward: (forwardProfileId) => ipcRenderer.invoke('forward-profiles:start', forwardProfileId),
  deleteForwardProfile: (forwardProfileId) => ipcRenderer.invoke('forward-profiles:delete', forwardProfileId),
  stopForward: (forwardId) => ipcRenderer.invoke('forwards:stop', forwardId),
  installProgram: (programId) => ipcRenderer.invoke('programs:install', programId),
  installAllPrograms: () => ipcRenderer.invoke('programs:install-all'),
  copyHiddifyConfig: () => ipcRenderer.invoke('programs:copy-hiddify-config'),
  importFxSoundPreset: () => ipcRenderer.invoke('programs:import-fxsound-preset'),
  installBundledFxSoundPreset: () => ipcRenderer.invoke('programs:install-bundled-fxsound-preset'),
  onTerminalBootstrap: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:bootstrap', listener);

    return () => {
      ipcRenderer.removeListener('terminal:bootstrap', listener);
    };
  },
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:data', listener);

    return () => {
      ipcRenderer.removeListener('terminal:data', listener);
    };
  },
  onTerminalStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:status', listener);

    return () => {
      ipcRenderer.removeListener('terminal:status', listener);
    };
  },
  onForwardsChanged: (callback) => {
    const listener = (_event, forwards) => callback(forwards);
    ipcRenderer.on('forwards:changed', listener);

    return () => {
      ipcRenderer.removeListener('forwards:changed', listener);
    };
  }
});
