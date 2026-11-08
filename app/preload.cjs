const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('office', {
  floors: () => ipcRenderer.invoke('floors'),
  addFloor: () => ipcRenderer.invoke('add-floor'),
  removeFloor: id => ipcRenderer.invoke('remove-floor', id),
  run: (floor, task) => ipcRenderer.send('run', floor, task),
  stop: floor => ipcRenderer.send('stop', floor),
  answer: (floor, id, ok) => ipcRenderer.send('answer', floor, id, ok),
  setAuto: (floor, on) => ipcRenderer.invoke('set-auto', floor, on),
  authCheck: names => ipcRenderer.invoke('auth-check', names),
  authLogin: name => ipcRenderer.invoke('auth-login', name),
  skills: () => ipcRenderer.invoke('skills'),
  store: () => ipcRenderer.invoke('store'),
  storeInstall: (cli, id, sha) => ipcRenderer.invoke('store-install', cli, id, sha),
  storeRemove: (cli, id) => ipcRenderer.invoke('store-remove', cli, id),
  openUrl: url => ipcRenderer.invoke('open-url', url),
  on: cb => ipcRenderer.on('office', (_, e) => cb(e)),
});
