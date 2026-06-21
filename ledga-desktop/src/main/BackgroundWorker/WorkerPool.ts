import type { Worker } from "worker_threads"
import type { Logger } from "../logging/FileLogger"
import {
    CANCELLED_EXIT_CODE,
    type ProcessingPriority,
    type WorkerTaskType,
    type WorkerToMainMessage,
    type WorkerTaskMessage,
    type WorkerLogMessage,
} from "../../common/types/WorkerTypes"

export interface BackgroundTask<TPayload, TResult> {
    id: string
    type: WorkerTaskType
    priority: ProcessingPriority
    payload: TPayload
    timeout: number
    resolve: (result: TResult) => void
    reject: (error: Error) => void
    enqueuedAt: number
}

export interface PoolStats {
    busy: number
    available: number
    maxConcurrent: number
}

export class WorkerPool {
    private availableWorkers: Worker[] = []
    private busyWorkers = new Map<string, Worker>()
    private taskQueue: BackgroundTask<unknown, unknown>[] = []

    constructor(
        private readonly name: string,
        private readonly maxConcurrent: number,
        private readonly logger: Logger,
        private readonly workerFactory: () => Worker
    ) {}

    async execute<TPayload, TResult>(task: BackgroundTask<TPayload, TResult>): Promise<TResult> {
        return new Promise<TResult>((resolve, reject) => {
            const taskWithCallbacks: BackgroundTask<TPayload, TResult> = {
                ...task,
                resolve,
                reject,
                enqueuedAt: Date.now()
            }
            this.enqueue(taskWithCallbacks)
            this.processQueue().catch(error => {
                this.logger.error(`[${this.name}] Error processing queue:`, error)
            })
        })
    }

    private enqueue<TPayload, TResult>(task: BackgroundTask<TPayload, TResult>): void {
        this.taskQueue.push(task as BackgroundTask<unknown, unknown>)
        this.taskQueue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority
            }
            return a.enqueuedAt - b.enqueuedAt
        })
        this.logger.debug(`[${this.name}] Queued task ${task.id} of type ${task.type}, queue size: ${this.taskQueue.length}`)
    }

    private async processQueue(): Promise<void> {
        while (this.taskQueue.length > 0 && this.canProcessMoreTasks()) {
            const task = this.taskQueue.shift()
            if (task) {
                const worker = this.getWorker()
                if (worker) {
                    this.busyWorkers.set(task.id, worker)
                    this.executeTaskOnWorker(worker, task).catch(error => {
                        this.logger.error(`[${this.name}] Error executing task ${task.id}:`, error)
                        task.reject(error)
                    })
                } else {
                    this.taskQueue.unshift(task)
                    break
                }
            }
        }
    }

    private canProcessMoreTasks(): boolean {
        return this.busyWorkers.size < this.maxConcurrent
    }

    private getWorker(): Worker | null {
        const worker = this.availableWorkers.pop()
        if (worker) {
            this.logger.debug(`[${this.name}] Reusing available worker`)
            return worker
        }
        if (this.busyWorkers.size < this.maxConcurrent) {
            this.logger.debug(`[${this.name}] Creating new worker`)
            return this.createWorker()
        }
        return null
    }

    private createWorker(): Worker {
        try {
            const worker = this.workerFactory()

            const errorHandler = (error: Error) => {
                this.logger.error(`[${this.name}] Worker error:`, error)
                this.handleWorkerError(worker, error)
            }

            const exitHandler = (code: number | null) => {
                if (code !== 0 && code !== null && code !== CANCELLED_EXIT_CODE) {
                    this.logger.error(`[${this.name}] Worker stopped with exit code ${code}`)
                }
                this.cleanupWorker(worker, errorHandler, exitHandler)
            }

            worker.on("error", errorHandler)
            worker.on("exit", exitHandler)

            return worker
        } catch (error) {
            this.logger.error(`[${this.name}] Failed to create worker:`, error)
            throw error
        }
    }

    private async executeTaskOnWorker(worker: Worker, task: BackgroundTask<unknown, unknown>): Promise<void> {
        try {
            this.logger.debug(`[${this.name}] Worker starting task ${task.id} of type ${task.type}`)
            const timeout = task.timeout

            const result = await this.runWorker(worker, task, timeout)

            if (this.busyWorkers.has(task.id)) {
                this.busyWorkers.delete(task.id)
                this.availableWorkers.push(worker)
            }

            this.logger.debug(`[${this.name}] Worker completed task ${task.id}`)
            ;(task.resolve as (result: unknown) => void)(result)

            this.processQueue().catch(error => {
                this.logger.error(`[${this.name}] Error processing queue after task completion:`, error)
            })
        } catch (error) {
            this.logger.error(`[${this.name}] Worker failed task ${task.id}:`, error)
            try {
                await this.terminateWorker(worker)
            } finally {
                this.removeWorker(worker)
                task.reject(error instanceof Error ? error : new Error(String(error)))
                this.processQueue().catch(queueError => {
                    this.logger.error(`[${this.name}] Error processing queue after task failure:`, queueError)
                })
            }
        }
    }

    private async runWorker(worker: Worker, task: BackgroundTask<unknown, unknown>, timeout: number): Promise<unknown> {
        return new Promise((resolve, reject) => {
            let isCompleted = false

            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle)
                }
                worker.off("message", handleMessage)
                worker.off("error", errorHandler)
                worker.off("exit", exitHandler)
            }

            const complete = (result?: unknown, error?: Error) => {
                if (isCompleted) {
                    return
                }
                isCompleted = true
                cleanup()

                if (error) {
                    reject(error)
                } else {
                    resolve(result)
                }
            }

            const timeoutHandle = setTimeout(() => {
                complete(undefined, new Error(`Worker timeout after ${timeout}ms`))
            }, timeout)

            const handleMessage = async (msg: WorkerToMainMessage) => {
                try {
                    if (msg.type === "LOG") {
                        this.handleWorkerLog(msg)
                    } else if (msg.type === "RESULT") {
                        if (!msg.success) {
                            complete(undefined, new Error(msg.error ?? "Worker task failed"))
                        } else {
                            const result = msg.result as Record<string, unknown> | undefined
                            if (result?.extractedTextBuffer instanceof ArrayBuffer) {
                                result.extractedText = new TextDecoder().decode(new Uint8Array(result.extractedTextBuffer))
                                delete result.extractedTextBuffer
                            }
                            complete(msg.result)
                        }
                    }
                } catch (error) {
                    this.logger.error(`[${this.name}] Error handling worker message:`, error)
                }
            }

            const errorHandler = (error: Error) => {
                complete(undefined, error)
            }

            const exitHandler = (code: number | null) => {
                if (isCompleted) {
                    return
                }
                if (code === CANCELLED_EXIT_CODE) {
                    complete(undefined, new Error("Processing was cancelled"))
                    return
                }
                const codeLabel = code === null ? "null" : String(code)
                if (code !== 0 && code !== null) {
                    this.logger.error(`[${this.name}] Worker exited abnormally:`, {
                        code,
                        taskId: task.id,
                        taskType: task.type
                    })
                }
                complete(undefined, new Error(`Worker exited before delivering result (exit code ${codeLabel})`))
            }

            worker.on("message", handleMessage)
            worker.on("error", errorHandler)
            worker.on("exit", exitHandler)

            const message: WorkerTaskMessage<unknown> = {
                type: "TASK",
                taskId: task.id,
                taskType: task.type,
                payload: task.payload
            }
            worker.postMessage(message)
        })
    }

    private handleWorkerLog(logMessage: WorkerLogMessage): void {
        const base = `BackgroundWorker:${this.name}`
        const prefix = logMessage.contextId ? `[${base}:${logMessage.contextId}]` : `[${base}]`
        const message = `${prefix} ${logMessage.message}`

        switch (logMessage.level) {
            case "info":
                this.logger.info(message, logMessage.meta)
                break
            case "warn":
                this.logger.warn(message, logMessage.meta)
                break
            case "error":
                this.logger.error(message, logMessage.meta)
                break
            default:
                this.logger.debug(message, logMessage.meta)
                break
        }
    }

    private handleWorkerError(worker: Worker, error: Error): void {
        this.logger.error(`[${this.name}] Error during worker execution ${error}`)
        this.terminateWorker(worker).catch(termError => {
            this.logger.warn(`[${this.name}] Error terminating failed worker:`, termError)
        })
        this.removeWorker(worker)
    }

    private cleanupWorker(worker: Worker, errorHandler?: (error: Error) => void, exitHandler?: (code: number | null) => void): void {
        if (errorHandler) {
            worker.off("error", errorHandler)
        }
        if (exitHandler) {
            worker.off("exit", exitHandler)
        }
        worker.removeAllListeners("message")

        this.removeWorker(worker)
    }

    private removeWorker(worker: Worker): void {
        for (const [id, w] of this.busyWorkers.entries()) {
            if (w === worker) {
                this.busyWorkers.delete(id)
                break
            }
        }

        const index = this.availableWorkers.indexOf(worker)
        if (index !== -1) {
            this.availableWorkers.splice(index, 1)
        }
    }

    private async terminateWorker(worker: Worker): Promise<void> {
        try {
            await worker.terminate()
        } catch (error) {
            this.logger.warn(`[${this.name}] Error terminating worker:`, error)
        }
    }

    cancelTask(taskId: string): boolean {
        const queueIndex = this.taskQueue.findIndex(task => task.id === taskId)
        if (queueIndex !== -1) {
            const task = this.taskQueue[queueIndex]
            this.taskQueue.splice(queueIndex, 1)
            this.logger.debug(`[${this.name}] Cancelling queued task: ${taskId}`)
            task.reject(new Error("Processing was cancelled"))
            return true
        }

        const worker = this.busyWorkers.get(taskId)
        if (worker) {
            this.logger.debug(`[${this.name}] Terminating worker running task: ${taskId}`)
            worker.postMessage({ type: "CANCEL" })
            setTimeout(() => {
                if (this.busyWorkers.has(taskId)) {
                    this.logger.warn(`[${this.name}] Worker for task ${taskId} did not exit gracefully, force terminating`)
                    this.terminateWorker(worker)
                    this.removeWorker(worker)
                }
            }, 5000)
            return true
        }

        return false
    }

    async shutdown(): Promise<void> {
        this.taskQueue.forEach(task => {
            task.reject(new Error(`[${this.name}] Pool is shutting down`))
        })
        this.taskQueue = []

        const allWorkers = [...this.busyWorkers.values(), ...this.availableWorkers]
        const shutdownPromises = allWorkers.map(worker => {
            worker.removeAllListeners()
            return this.terminateWorker(worker).catch(error => {
                this.logger.warn(`[${this.name}] Error terminating worker during shutdown:`, error)
            })
        })

        await Promise.all(shutdownPromises)

        this.busyWorkers.clear()
        this.availableWorkers = []
    }

    stats(): PoolStats {
        return {
            busy: this.busyWorkers.size,
            available: this.availableWorkers.length,
            maxConcurrent: this.maxConcurrent
        }
    }

    queueSize(): number {
        return this.taskQueue.length
    }
}
