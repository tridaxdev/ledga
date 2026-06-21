import i18next from "i18next"
import { BrowserWindow } from "electron"
import type { Logger } from "../logging/FileLogger"
import { registerIpcHandler } from "../ipc/registerIpcHandler"
import { LanguageStore } from "./LanguageStore"
import en from "./translations/en.json"
import { detectSystemLanguage } from "./utils"
import { SUPPORTED_LANGUAGES } from "@/common/i18n/language"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"

export async function initializeI18next(logger: Logger, onLanguageChange?: () => void): Promise<typeof i18next> {
    const storageBackend = new LanguageStore(logger)
    const currentLanguage = storageBackend.getLanguage()
    const systemLanguage = detectSystemLanguage()

    await i18next.init({
        lng: currentLanguage,
        fallbackLng: systemLanguage,
        supportedLngs: SUPPORTED_LANGUAGES,

        resources: {
            en: { translation: en }
        },

        interpolation: {
            escapeValue: false
        },

        debug: false
    })

    i18next.on("languageChanged", (language: string) => {
        storageBackend.setLanguage(language)

        if (onLanguageChange) {
            onLanguageChange()
        }

        const allWindows = BrowserWindow.getAllWindows()
        allWindows.forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send("language-changed", language)
            }
        })
    })

    logger.info(`i18next initialized with language: ${currentLanguage}`)

    registerIpcHandler(AllowedChannelIpc.AppGetLanguage, async () => {
        return i18next.language
    })

    registerIpcHandler(AllowedChannelIpc.AppSetLanguage, async (_, ...args) => {
        const language = args[0] as string
        try {
            await i18next.changeLanguage(language)
            return true
        } catch {
            return false
        }
    })

    return i18next
}

export function getI18nextInstance(): typeof i18next {
    return i18next
}

export const t = i18next.t.bind(i18next)
