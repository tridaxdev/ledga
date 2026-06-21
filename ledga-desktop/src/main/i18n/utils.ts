import { app } from "electron"
import { isSupportedLanguage, type SupportedLanguage } from "@/common/i18n/language"

export function detectSystemLanguage(): SupportedLanguage {
    const locales = app.getPreferredSystemLanguages?.() ?? []
    const primary = locales[0] ?? app.getLocale()
    const code = primary.split("-")[0]

    return isSupportedLanguage(code) ? code : "en"
}
