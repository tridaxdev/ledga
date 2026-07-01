import { parentPort, workerData } from "worker_threads"
import { CANCELLED_EXIT_CODE, type DbQueryTaskPayload, type MainToWorkerMessage } from "../../common/types/WorkerTypes"
import { WorkerLogger } from "../logging/WorkerLogger"
import { WorkerDatabaseManager } from "../Database/WorkerDatabaseManager"
import { FileProcessorRegistry } from "../FileProcessing/FileProcessorRegistry"
import type { FileProcessingResultMessage, FileProcessingTaskPayload } from "@/common/types/FileProcessingTypes"
import { OrphanedFilesCleanupProcessor } from "../AssetManagement/OrphanedFilesCleanupProcessor"
import { BackgroundWorkerAIService } from "./BackgroundWorkerAIService"

const logger = new WorkerLogger()
const { dbPath, appStorageDir } = workerData as { dbPath: string; appStorageDir: string }
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

const workerAIService = new BackgroundWorkerAIService(logger)
let activeAbortController: AbortController | null = null

async function handleTaskMessage(message: MainToWorkerMessage): Promise<void> {
    if (message.type !== "TASK") {
        return
    }

    activeAbortController = new AbortController()

    try {
        switch (message.taskType) {
            case "file_processing": {
                const { fileId, originalPath, fileName, appStorageDir, config } = message.payload as FileProcessingTaskPayload
                const processor = await FileProcessorRegistry.createProcessor(originalPath, logger, config, workerAIService)
                const result = await processor.processFileComplete(fileId, originalPath, appStorageDir, fileName)
                const response: FileProcessingResultMessage = {
                    type: "RESULT",
                    taskId: message.taskId,
                    success: result.success,
                    result: result,
                    error: result.error
                }
                if (result.extractedText) {
                    const encoded = new TextEncoder().encode(result.extractedText)
                    const transferableResponse = {
                        ...response,
                        result: { ...result, extractedText: undefined, extractedTextBuffer: encoded.buffer }
                    }
                    parentPort?.postMessage(transferableResponse, [encoded.buffer])
                } else {
                    parentPort?.postMessage(response)
                }
                break
            }

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

            case "cleanup_orphaned_files": {
                const processor = new OrphanedFilesCleanupProcessor(logger, workerDb, appStorageDir)
                const result = await processor.process()
                parentPort?.postMessage({
                    type: "RESULT",
                    taskId: message.taskId,
                    success: true,
                    result
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
