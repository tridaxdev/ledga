import { parentPort, workerData } from "worker_threads"
import { CANCELLED_EXIT_CODE, type DbQueryTaskPayload, type MainToWorkerMessage } from "../../common/types/WorkerTypes"
import { WorkerLogger } from "../logging/WorkerLogger"
import { WorkerDatabaseManager } from "../Database/WorkerDatabaseManager"

const logger = new WorkerLogger()
const { dbPath } = workerData as { dbPath: string; appStorageDir: string }
const workerDb = new WorkerDatabaseManager(dbPath)

if (!parentPort) {
    logger.error("BackgroundWorker must run in worker thread")
    throw new Error("BackgroundWorker must run in worker thread")
}

function handleUncaughtException(error: Error): void {
    logger.error("Uncaught exception in worker:", error)
    if (parentPort) {
        parentPort.postMessage({
            type: "RESULT",
            success: false,
            fileId: "unknown",
            error: `Worker crashed: ${error.message}`
        })
    }
    process.exit(0)
}

function handleUnhandledRejection(reason: unknown): void {
    logger.error("Unhandled rejection in worker:", reason)
    if (parentPort) {
        parentPort.postMessage({
            type: "RESULT",
            success: false,
            fileId: "unknown",
            error: `Worker unhandled rejection: ${reason}`
        })
    }
    process.exit(0)
}

let activeAbortController: AbortController | null = null

async function handleTaskMessage(message: MainToWorkerMessage): Promise<void> {
    if (message.type !== "TASK") {
        return
    }

    activeAbortController = new AbortController()

    try {
        switch (message.taskType) {
            case "db_query": {
                const { sql, params } = message.payload as DbQueryTaskPayload
                const results = workerDb.executeQuery(sql, params)
                parentPort?.postMessage({
                    type: "RESULT",
                    taskId: message.taskId,
                    success: true,
                    result: results
                })
                break
            }

            default: {
                logger.warn("Unsupported task type:", message.taskType)
                const errorResponse = {
                    type: "RESULT" as const,
                    taskId: message.taskId,
                    success: false,
                    error: `Unsupported task type: ${message.taskType}`
                }
                parentPort?.postMessage(errorResponse)
                break
            }
        }
    } finally {
        activeAbortController = null
    }
}

async function handleWorkerMessage(message: MainToWorkerMessage): Promise<void> {
    try {
        if (message.type === "CANCEL") {
            activeAbortController?.abort()
            process.exit(CANCELLED_EXIT_CODE)
        } else if (message.type === "TASK") {
            await handleTaskMessage(message)
        } else {
            logger.warn("Unknown message received:", message)
        }
    } catch (error) {
        logger.error("Error processing message:", error)
        if (message.type === "TASK") {
            const taskMessage = message
            const errorResponse = {
                type: "RESULT" as const,
                taskId: taskMessage.taskId,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
            parentPort?.postMessage(errorResponse)
        }
    }
}

process.on("uncaughtException", handleUncaughtException)
process.on("unhandledRejection", handleUnhandledRejection)

parentPort.on("message", handleWorkerMessage)
