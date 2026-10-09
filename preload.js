const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // DolaProxy Chat
  chat: (messages, model = 'dola-fast', stream = false) =>
    ipcRenderer.invoke('dola:chat', { messages, model, stream }),

  // Dola Studio Video
  generateVideo: (opts) => ipcRenderer.invoke('dola:video', opts),
  getVideoStatus: (id) => ipcRenderer.invoke('dola:videoStatus', id),

  // Skills
  listSkills: () => ipcRenderer.invoke('skills:list'),
  loadSkill: (name) => ipcRenderer.invoke('skills:load', name),
  importSkill: (filePath) => ipcRenderer.invoke('skills:import', filePath),
  deleteSkill: (name) => ipcRenderer.invoke('skills:delete', name),

  // Extensions
  listExtensions: () => ipcRenderer.invoke('ext:list'),
  enableExtension: (name) => ipcRenderer.invoke('ext:enable', name),
  disableExtension: (name) => ipcRenderer.invoke('ext:disable', name),

  // Backend health
  health: () => ipcRenderer.invoke('backend:health'),

  // File dialogs
  pickFile: (filters) => ipcRenderer.invoke('dialog:pickFile', filters),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder')
});
