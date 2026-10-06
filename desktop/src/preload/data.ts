import { contextBridge, ipcRenderer } from "electron";
import {
  DATA_IPC,
  type DataBridgeApi,
  type DataEvent,
  type DataRequestMessage,
  type DataResponseMessage,
} from "@shared/sync";

/** Bridge for the hidden data window (see src/renderer/data/dataMain.ts). */
const dataBridge: DataBridgeApi = {
  getConfig: () => ipcRenderer.invoke(DATA_IPC.getConfig),
  onRequest(listener: (message: DataRequestMessage) => void): void {
    ipcRenderer.on(DATA_IPC.request, (_e, message: DataRequestMessage) => listener(message));
  },
  respond(message: DataResponseMessage): void {
    ipcRenderer.send(DATA_IPC.response, message);
  },
  emit(event: DataEvent): void {
    ipcRenderer.send(DATA_IPC.event, event);
  },
};

contextBridge.exposeInMainWorld("dataBridge", dataBridge);
