import { promises as fs } from "fs"
import * as os from "os"
import * as path from "path"
import type { LogLevel } from "@/common/types/DebugTypes"
import { LOG_LEVEL_PRIORITY, LOG_LEVELS } from "@/common/types/DebugTypes"

export interface Logger {
    debug(message: string, meta?: unknown): void
    info(message: string, meta?: unknown): void
    warn(message: string, meta?: unknown): void
    error(message: string, meta?: unknown): void
}

interface LogEntry {
    level: LogLevel
    message: string
    timestamp: string
    meta?: unknown
}

export class FileLogger implements Logger {
    private sessionId: string
    private sessionLogFile: string | null = null
    private isInitialized = false
    private appDataPath: string | null
    private minLogLevel: LogLevel
    private queue: LogEntry[] = []
    private isFlushing = false

    constructor(appDataPath?: string, minLogLevel: LogLevel = "debug") {
        this.sessionId = `${Date.now()}`
        this.appDataPath = appDataPath || null
        this.minLogLevel = minLogLevel
    }

    private async initialize(): Promise<void> {
        if (this.isInitialized) {
            return
        }

        try {
            await this.ensureLogDir()
            const logFile = this.getCurrentLogFile()

            try {
                await fs.access(logFile)
            } catch {
                const header = `Log session started: ${new Date().toISOString()}\nSession ID: ${this.sessionId}\n\n`
                await fs.writeFile(logFile, header, "utf8")
                console.log(`Created new log file: ${logFile}`)
            }

            this.isInitialized = true
        } catch (err) {
            console.error("Failed to initialize file logger:", err)
        }
    }

    private getLogDir(): string {
        if (this.appDataPath) {
            return this.appDataPath
        } else {
            return path.join(os.tmpdir(), "ledga-logs")
        }
    }

    private async ensureLogDir(): Promise<void> {
        try {
            const logDir = this.getLogDir()
            await fs.mkdir(logDir, { recursive: true })
        } catch (err) {
            console.error("Failed to create log directory:", err)
        }
    }

    private getCurrentLogFile(): string {
        if (!this.sessionLogFile) {
            const date = new Date()
            const dateStr = date.toISOString().split("T")[0]
            const timeStr = date.toISOString().split("T")[1].replace(/:/g, "-").split(".")[0]
            const fileName = `ledga-${dateStr}_${timeStr}_${this.sessionId}.log`
            this.sessionLogFile = path.join(this.getLogDir(), fileName)
        }
        return this.sessionLogFile
    }

    private formatDetails(meta?: unknown): string | null {
        if (!meta) {
            return null
        }

        if (meta instanceof Error) {
            return JSON.stringify({
                name: meta.name,
                message: meta.message,
                stack: meta.stack
            })
        } else if (typeof meta === "object") {
            try {
                return JSON.stringify(meta)
            } catch {
                return String(meta)
            }
        } else {
            return String(meta)
        }
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLogLevel]
    }

    private enqueue(level: LogLevel, message: string, meta?: unknown): void {
        this.queue.push({ level, message, timestamp: new Date().toISOString(), meta })
        this.flush()
    }

    private async flush(): Promise<void> {
        if (this.isFlushing) {
            return
        }
        this.isFlushing = true

        try {
            await this.initialize()
            const logFile = this.getCurrentLogFile()

            let entry: LogEntry | undefined
            while ((entry = this.queue.shift()) !== undefined) {
                const detailsStr = this.formatDetails(entry.meta)
                const details = detailsStr ? ` ${detailsStr}` : ""
                const logLine = `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${details}\n`
                await fs.appendFile(logFile, logLine, "utf8")
            }
        } catch (err) {
            console.error("Failed to write to log file:", err)
        } finally {
            this.isFlushing = false
        }
    }

    debug(message: string, meta?: unknown): void {
        if (!this.shouldLog(LOG_LEVELS.DEBUG)) {
            return
        }
        console.debug(`[DEBUG] ${message}`, meta || "")
        this.enqueue(LOG_LEVELS.DEBUG, message, meta)
    }

    info(message: string, meta?: unknown): void {
        if (!this.shouldLog(LOG_LEVELS.INFO)) {
            return
        }
        console.info(`[INFO] ${message}`, meta || "")
        this.enqueue(LOG_LEVELS.INFO, message, meta)
    }

    warn(message: string, meta?: unknown): void {
        if (!this.shouldLog(LOG_LEVELS.WARN)) {
            return
        }
        console.warn(`[WARN] ${message}`, meta || "")
        this.enqueue(LOG_LEVELS.WARN, message, meta)
    }

    error(message: string, meta?: unknown): void {
        if (!this.shouldLog(LOG_LEVELS.ERROR)) {
            return
        }
        console.error(`[ERROR] ${message}`, meta || "")
        this.enqueue(LOG_LEVELS.ERROR, message, meta)
    }
}