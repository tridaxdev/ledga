import Store from "electron-store"
import type { Logger } from "../logging/FileLogger"
import { detectSystemLanguage } from "./utils"
import { isSupportedLanguage, type SupportedLanguage } from "@/common/i18n/language"

interface LanguageStoreSchema {
    language: SupportedLanguage
}

export class LanguageStore {
    private store: Store<LanguageStoreSchema>
    private logger: Logger

    constructor(logger: Logger) {
        this.logger = logger

        const systemLanguage = detectSystemLanguage()
        this.store = new Store<LanguageStoreSchema>({
            name: "language-preferences",
            defaults: {
                language: systemLanguage
            }
        })
    }

    getLanguage(): string {
        const existing = this.store.get("language") as SupportedLanguage | undefined
        if (existing) return existing

        const detected = detectSystemLanguage()
        this.store.set("language", detected)
        this.logger.info(`Initialized language from system locale as: ${detected}`)
        return detected
    }

    setLanguage(language: string): boolean {
        if (!isSupportedLanguage(language)) {
            this.logger.warn(`Attempted to set unsupported language: ${language}`)
            return false
        }

        this.store.set("language", language)
        this.logger.info(`Language changed to: ${language}`)
        return true
    }
}
