import type { Connection } from "./Connection"
import type { Result } from "./Result"

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
    readonly email: {
        readonly sync: (connectionId: string, startDate: string, endDate: string) => Promise<Result<{ newCount: number }, Error>>
        readonly getProcessingCounts: () => Promise<Result<{ processing: number; failed: number }, Error>>
        readonly onEmailsPulled: (callback: (event: { connectionId: string; newCount: number }) => void) => () => void
        readonly onProcessingUpdate: (callback: (counts: { processing: number; failed: number }) => void) => () => void
    }
}
