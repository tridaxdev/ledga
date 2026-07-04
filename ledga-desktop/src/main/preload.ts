import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc";
import type { LedgaAPI } from "@/common/types/LedgaAPI";
import type { Connection } from "@/common/types/Connection";
import type { TransactionQueryParams } from "@/common/types/Transaction";
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
    },
    emails: {
        getProcessingCounts: () => ipcRenderer.invoke(AllowedChannelIpc.EmailsGetProcessingCounts),
        onProcessingUpdate: (callback: (counts: { processing: number; failed: number }) => void) => {
            const listener = (_: Electron.IpcRendererEvent, counts: { processing: number; failed: number }) => callback(counts)
            ipcRenderer.on(AllowedChannelIpc.EmailsProcessingUpdate, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.EmailsProcessingUpdate, listener)
        },
        onPulled: (callback: (event: { connectionId: string; newCount: number }) => void) => {
            const listener = (_: Electron.IpcRendererEvent, event: { connectionId: string; newCount: number }) => callback(event)
            ipcRenderer.on(AllowedChannelIpc.EmailsPulled, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.EmailsPulled, listener)
        }
    },
    transactions: {
        query: (params: TransactionQueryParams) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsQuery, params),
        updateCategory: (id: string, categoryId: string | null) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsUpdateCategory, id, categoryId)
    },
    categories: {
        getAll: () => ipcRenderer.invoke(AllowedChannelIpc.CategoriesGetAll)
    }
}

contextBridge.exposeInMainWorld("ledgaAPI", ledgaAPI)