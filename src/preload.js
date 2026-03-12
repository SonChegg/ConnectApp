const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('connectApp', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
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
  onForwardsChanged: (callback) => {
    const listener = (_event, forwards) => callback(forwards);
    ipcRenderer.on('forwards:changed', listener);

    return () => {
      ipcRenderer.removeListener('forwards:changed', listener);
    };
  }
});
