import { contextBridge, ipcRenderer } from 'electron';

/** جسر محدود ومُقنَّن: لا نمرر ipcRenderer كاملًا للواجهة */
contextBridge.exposeInMainWorld('newportBridge', {
  getApiBase: (): Promise<string> => ipcRenderer.invoke('newport:api-base'),
  getToken: (): Promise<{ access: string | null; refresh: string | null }> => ipcRenderer.invoke('newport:token:get'),
  setToken: (payload: { access: string | null; refresh: string | null }): Promise<boolean> => ipcRenderer.invoke('newport:token:set', payload),
  isOnline: (): Promise<boolean> => ipcRenderer.invoke('newport:online'),
  getVersion: (): Promise<{ app: string; electron: string; chrome: string }> => ipcRenderer.invoke('newport:version'),
  timeSkew: (serverTimeIso: string): Promise<number> => ipcRenderer.invoke('newport:time-skew', serverTimeIso),
});
