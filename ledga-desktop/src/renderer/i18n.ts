import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { getLedgaAPI } from "./hooks/apiClient"

const resources = {
    en: {
        translation: () => import("./translations/en.json")
    }
}

i18n.use(initReactI18next).init({
    fallbackLng: "en",
    supportedLngs: ["en", "de"],

    resources: {},

    interpolation: {
        escapeValue: false
    },

    react: {
        useSuspense: false
    }
})

Object.keys(resources).forEach(lng => {
    const langResources = resources[lng as keyof typeof resources]
    langResources.translation().then((module: { default?: Record<string, unknown> }) => {
        i18n.addResourceBundle(lng, "translation", module.default || module, true, true)
    })
})

try {
    const ledgaAPI = getLedgaAPI()

    const storedLanguage = await ledgaAPI.app.getLanguage()
    if (storedLanguage && storedLanguage !== i18n.language) {
        await i18n.changeLanguage(storedLanguage)
    }

    ledgaAPI.app.onLanguageChanged((language: string) => {
        if (language && language !== i18n.language) {
            i18n.changeLanguage(language)
        }
    })
} catch (error) {
    console.warn("Failed to initialize language sync:", error)
}

export default i18n
