import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc";
import type { LedgaAPI } from "@/common/types/LedgaAPI";
import type { Connection } from "@/common/types/Connection";
import type { CategoryQueryParams, TransactionQueryParams } from "@/common/types/Transaction";
import type { RuleInput } from "@/common/types/Rule";
import type { CsvImportProgressEvent } from "@/common/types/CsvImportTypes";
import type { AssistantStreamChunkEvent, AssistantStreamDoneEvent, AssistantStreamErrorEvent } from "@/common/types/ChatTypes";
import { contextBridge, ipcRenderer, webUtils } from "electron";

const ledgaAPI: LedgaAPI = {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
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
        },
        syncNow: (id: string) => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsSyncNow, id),
        update: (id: string, patch: { auto_sync?: boolean }) => ipcRenderer.invoke(AllowedChannelIpc.ConnectionsUpdate, id, patch)
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
        queryByCategory: (params: CategoryQueryParams) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsQueryByCategory, params),
        updateCategory: (id: string, categoryId: string | null) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsUpdateCategory, id, categoryId),
        updateMerchant: (id: string, merchant: string) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsUpdateMerchant, id, merchant),
        markReviewed: (id: string) => ipcRenderer.invoke(AllowedChannelIpc.TransactionsMarkReviewed, id),
        onInvalidated: (callback: () => void) => {
            const listener = () => callback()
            ipcRenderer.on(AllowedChannelIpc.TransactionsInvalidated, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.TransactionsInvalidated, listener)
        }
    },
    categories: {
        getAll: () => ipcRenderer.invoke(AllowedChannelIpc.CategoriesGetAll)
    },
    rules: {
        getAll: () => ipcRenderer.invoke(AllowedChannelIpc.RulesGetAll),
        create: (input: RuleInput) => ipcRenderer.invoke(AllowedChannelIpc.RulesCreate, input),
        update: (id: string, input: Partial<RuleInput>) => ipcRenderer.invoke(AllowedChannelIpc.RulesUpdate, id, input),
        delete: (id: string) => ipcRenderer.invoke(AllowedChannelIpc.RulesDelete, id)
    },
    csv: {
        browseFile: () => ipcRenderer.invoke(AllowedChannelIpc.CsvBrowseFile),
        import: (filePath: string) => ipcRenderer.invoke(AllowedChannelIpc.CsvImport, filePath),
        onProgress: (callback: (event: CsvImportProgressEvent) => void) => {
            const listener = (_: Electron.IpcRendererEvent, event: CsvImportProgressEvent) => callback(event)
            ipcRenderer.on(AllowedChannelIpc.CsvImportProgress, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.CsvImportProgress, listener)
        }
    },
    settings: {
        revealDb: () => ipcRenderer.invoke(AllowedChannelIpc.SettingsRevealDb),
        getDbPath: () => ipcRenderer.invoke(AllowedChannelIpc.SettingsGetDbPath),
        exportCsv: () => ipcRenderer.invoke(AllowedChannelIpc.SettingsExportCsv),
        clearData: () => ipcRenderer.invoke(AllowedChannelIpc.SettingsClearData)
    },
    chats: {
        getAll: () => ipcRenderer.invoke(AllowedChannelIpc.ChatsGetAll),
        create: () => ipcRenderer.invoke(AllowedChannelIpc.ChatsCreate),
        getMessages: (chatId: string) => ipcRenderer.invoke(AllowedChannelIpc.ChatsGetMessages, chatId),
        onUpdated: (callback: () => void) => {
            const listener = () => callback()
            ipcRenderer.on(AllowedChannelIpc.ChatsUpdated, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.ChatsUpdated, listener)
        }
    },
    assistant: {
        send: (chatId: string, text: string) => ipcRenderer.invoke(AllowedChannelIpc.AssistantSend, chatId, text),
        stop: (chatId: string) => ipcRenderer.invoke(AllowedChannelIpc.AssistantStop, chatId),
        onStreamChunk: (callback: (event: AssistantStreamChunkEvent) => void) => {
            const listener = (_: Electron.IpcRendererEvent, event: AssistantStreamChunkEvent) => callback(event)
            ipcRenderer.on(AllowedChannelIpc.AssistantStreamChunk, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.AssistantStreamChunk, listener)
        },
        onStreamDone: (callback: (event: AssistantStreamDoneEvent) => void) => {
            const listener = (_: Electron.IpcRendererEvent, event: AssistantStreamDoneEvent) => callback(event)
            ipcRenderer.on(AllowedChannelIpc.AssistantStreamDone, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.AssistantStreamDone, listener)
        },
        onStreamError: (callback: (event: AssistantStreamErrorEvent) => void) => {
            const listener = (_: Electron.IpcRendererEvent, event: AssistantStreamErrorEvent) => callback(event)
            ipcRenderer.on(AllowedChannelIpc.AssistantStreamError, listener)
            return () => ipcRenderer.removeListener(AllowedChannelIpc.AssistantStreamError, listener)
        }
    }
}

contextBridge.exposeInMainWorld("ledgaAPI", ledgaAPI)