/** Account-only preload for the owned welcome window. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('aikoBrowserAccount', {
  locale: () => ipcRenderer.invoke('aiko:account:locale'),
  login: () => ipcRenderer.invoke('aiko:account:login'),
  cancel: () => ipcRenderer.invoke('aiko:account:cancel'),
})
