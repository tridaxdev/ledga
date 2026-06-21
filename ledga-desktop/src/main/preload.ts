import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc";
import type { LedgaAPI } from "@/common/types/LedgaAPI";
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
    }
}

contextBridge.exposeInMainWorld("ledgaAPI", ledgaAPI)