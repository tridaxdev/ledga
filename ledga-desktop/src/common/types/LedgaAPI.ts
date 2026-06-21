export interface DatabaseStats {
    size: string
    records: number
    lastBackup: string
    status: "healthy" | "error"
}

export interface LedgaAPI {
    readonly app: {
        readonly getLanguage: () => Promise<string>
        readonly setLanguage: (language: string) => Promise<boolean>
        readonly onLanguageChanged: (callback: (language: string) => void) => () => void
    }
}