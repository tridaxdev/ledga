export const SUPPORTED_LANGUAGES = ["en"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function isSupportedLanguage(code: string): code is SupportedLanguage {
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
}
