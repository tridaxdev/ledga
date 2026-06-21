import * as fs from "fs"
import * as path from "path"
import type { Logger } from "../logging/FileLogger"
import type { LogEntry, LogFile, LogLevel } from "../../common/types/DebugTypes"
import { LOG_LEVEL_PRIORITY, LOG_LEVELS } from "../../common/types/DebugTypes"

export class DebugService {
    constructor(
        private logDirectory: string,
        private logger: Logger
    ) {}

    async getLogFiles(): Promise<LogFile[]> {
        try {
            if (!fs.existsSync(this.logDirectory)) {
                this.logger.warn("Log directory does not exist:", this.logDirectory)
                return []
            }

            const files = await fs.promises.readdir(this.logDirectory)
            const logFiles: LogFile[] = []

            for (const file of files) {
                if (file.endsWith(".log")) {
                    const filePath = path.join(this.logDirectory, file)
                    try {
                        const stats = await fs.promises.stat(filePath)
                        logFiles.push({
                            filename: file,
                            path: filePath,
                            size: stats.size,
                            lastModified: stats.mtime
                        })
                    } catch (error) {
                        this.logger.warn(`Failed to get stats for log file ${file}:`, error)
                    }
                }
            }

            return logFiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        } catch (error) {
            this.logger.error("Failed to get log files:", error)
            return []
        }
    }

    async readLogFile(filePath: string, level: LogLevel = LOG_LEVELS.INFO): Promise<LogEntry[]> {
        try {
            if (!fs.existsSync(filePath)) {
                this.logger.warn("Log file does not exist:", filePath)
                return []
            }

            if (!filePath.startsWith(this.logDirectory)) {
                this.logger.error("Attempted to read file outside log directory:", filePath)
                throw new Error("Access denied: file outside log directory")
            }

            const content = await fs.promises.readFile(filePath, "utf8")
            const lines = content.split("\n").filter(line => line.trim())

            const entries: LogEntry[] = []

            for (const line of lines) {
                const entry = this.parseLogLine(line)
                if (entry && this.shouldIncludeEntry(entry.level, level)) {
                    entries.push(entry)
                }
            }

            return entries
        } catch (error) {
            this.logger.error("Failed to read log file:", error)
            throw error
        }
    }

    private shouldIncludeEntry(entryLevel: string, minLevel: LogLevel): boolean {
        const entryPriority = LOG_LEVEL_PRIORITY[entryLevel.toLowerCase() as keyof typeof LOG_LEVEL_PRIORITY]
        const minPriority = LOG_LEVEL_PRIORITY[minLevel]

        return entryPriority !== undefined && entryPriority >= minPriority
    }

    private parseLogLine(line: string): LogEntry | null {
        try {
            const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)
            if (!timestampMatch) {
                return null
            }

            const timestamp = timestampMatch[1]
            const remainder = line.substring(timestamp.length).trim()

            const levelMatch = remainder.match(/^\[(\w+)\]/)
            if (!levelMatch) {
                return null
            }

            const level = levelMatch[1]
            const messageStart = remainder.indexOf("]") + 1
            const messagePart = remainder.substring(messageStart).trim()

            let message = messagePart
            let metadata: string | undefined

            const jsonMatch = messagePart.match(/^(.+?)(\s+\{.+\})$/)
            if (jsonMatch) {
                message = jsonMatch[1].trim()
                metadata = jsonMatch[2].trim()
            }

            return {
                timestamp,
                level: level.toLowerCase(),
                message,
                metadata
            }
        } catch {
            return null
        }
    }
}
