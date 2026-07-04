import type { Connection } from './Connection'
import type { Result } from './Result'

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
    readonly connections: {
        readonly getAll: () => Promise<Result<Connection[], Error>>
        readonly connect: () => Promise<Result<Connection, Error>>
        readonly disconnect: (id: string) => Promise<Result<void, Error>>
        readonly onOAuthCompleted: (callback: (connection: Connection) => void) => () => void
    }
}