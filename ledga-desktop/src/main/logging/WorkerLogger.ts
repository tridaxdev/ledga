import { parentPort } from "worker_threads"
import type { WorkerLogMessage } from "../../common/types/WorkerTypes"
import type { Logger } from "./FileLogger"

export class WorkerLogger implements Logger {
    private contextId?: string

    constructor(contextId?: string) {
        this.contextId = contextId
    }

    setContextId(contextId: string): void {
        this.contextId = contextId
    }

    clearContextId(): void {
        this.contextId = undefined
    }

    debug(message: string, meta?: unknown): void {
        this.sendLogMessage("debug", message, meta)
    }

    info(message: string, meta?: unknown): void {
        this.sendLogMessage("info", message, meta)
    }

    warn(message: string, meta?: unknown): void {
        this.sendLogMessage("warn", message, meta)
    }

    error(message: string, meta?: unknown): void {
        this.sendLogMessage("error", message, meta)
    }

    private sendLogMessage(level: "debug" | "info" | "warn" | "error", message: string, meta?: unknown): void {
        if (!parentPort) {
            console[level](`[WorkerLogger] ${message}`, meta)
            return
        }

        const logMessage: WorkerLogMessage = {
            type: "LOG",
            level,
            message,
            meta,
            timestamp: new Date().toISOString(),
            contextId: this.contextId
        }

        parentPort.postMessage(logMessage)
    }
}
