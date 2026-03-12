const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('connectApp', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  saveProfile: (payload) => ipcRenderer.invoke('profiles:save', payload),
  deleteProfile: (profileId) => ipcRenderer.invoke('profiles:delete', profileId),
  connectProfile: (payload) => ipcRenderer.invoke('profiles:connect', payload),
  startForward: (payload) => ipcRenderer.invoke('forwards:start', payload),
  stopForward: (forwardId) => ipcRenderer.invoke('forwards:stop', forwardId),
  installProgram: (programId) => ipcRenderer.invoke('programs:install', programId),
  copyHiddifyConfig: () => ipcRenderer.invoke('programs:copy-hiddify-config'),
  importFxSoundPreset: () => ipcRenderer.invoke('programs:import-fxsound-preset'),
  installBundledFxSoundPreset: () => ipcRenderer.invoke('programs:install-bundled-fxsound-preset'),
  onForwardsChanged: (callback) => {
    const listener = (_event, forwards) => callback(forwards);
    ipcRenderer.on('forwards:changed', listener);

    return () => {
      ipcRenderer.removeListener('forwards:changed', listener);
    };
  }
});
