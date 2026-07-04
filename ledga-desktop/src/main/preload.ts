import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc";
import type { LedgaAPI } from "@/common/types/LedgaAPI";
import type { Connection } from "@/common/types/Connection";
import { contextBridge, ipcRenderer } from "electron";

const ledgaAPI: LedgaAPI = {
    app: {
        getLanguage: async () => {
            return ipcRenderer.invoke(AllowedChannelIpc.AppGetLanguage)
        },
        setLanguage: async (language: string) => {
            return ipcRenderer.invoke(AllowedChannelIpc.AppSetLanguage, language)
        },
        onLanguageChanged: (callback: (language: string) => void) => {
            const listener = (_: Electron.IpcRendererEvent, language: string) => {
                callback(language)
            }
            ipcRenderer.on("language-changed", listener)
            return () => ipcRenderer.removeListener("language-changed", listener)
        }
    },
    connections: {
        getAll: () => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsGetAll),
        startOAuth: () => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsStartOAuth),
        cancelOAuth: (flowId?: string) => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsCancelOAuth, flowId),
        finalize: (flowId: string, autoSync: boolean) => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsFinalize, flowId, autoSync),
        disconnect: (id: string) => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsDelete, id),
        onOAuthCompleted: (callback: (connection: Connection) => void) => {
            const listener = (_: Electron.IpcRendererEvent, connection: Connection) => callback(connection)
            ipcRenderer.on(AllowedChannelIpc.ConnectionsOAuthCompleted, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.ConnectionsOAuthCompleted, listener)
        }
    }
}

contextBridge.exposeInMainWorld("ledgaAPI", ledgaAPI)