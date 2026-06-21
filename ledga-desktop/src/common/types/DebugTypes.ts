export interface LogEntry {
    timestamp: string
    level: string
    message: string
    metadata?: string
}

export interface LogFile {
    filename: string
    path: string
    size: number
    lastModified: Date
}

export interface ReadLogFileRequest {
    filePath: string
    level: LogLevel
}

export const LOG_LEVELS = {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error"
} as const

export const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
} as const

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS]
