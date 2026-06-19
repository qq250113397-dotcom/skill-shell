const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skillShell', {
  scan: () => ipcRenderer.invoke('scan-snapshot'),
  getRoots: () => ipcRenderer.invoke('get-roots'),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  readSkill: (payload) => ipcRenderer.invoke('read-skill', payload),
  translateText: (payload) => ipcRenderer.invoke('translate-text', payload),
  liveTranslateToggle: () => ipcRenderer.invoke('live-translate-toggle'),
  liveTranslateStatus: () => ipcRenderer.invoke('live-translate-status'),
  liveTranslateRegionStart: () => ipcRenderer.invoke('live-translate-region-start'),
  liveTranslateRegionSet: (payload) => ipcRenderer.invoke('live-translate-region-set', payload),
  liveTranslateRegionClear: () => ipcRenderer.invoke('live-translate-region-clear'),
  liveTranslateOnce: () => ipcRenderer.invoke('live-translate-once'),
  createSkill: (payload) => ipcRenderer.invoke('create-skill', payload),
  renameSkill: (payload) => ipcRenderer.invoke('rename-skill', payload),
  updateSkill: (payload) => ipcRenderer.invoke('update-skill', payload),
  deleteSkill: (payload) => ipcRenderer.invoke('delete-skill', payload),
  onLiveTranslationUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('live-translation-update', listener);
    return () => ipcRenderer.removeListener('live-translation-update', listener);
  },
  onLiveTranslationStatus: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('live-translation-status', listener);
    return () => ipcRenderer.removeListener('live-translation-status', listener);
  },
});
