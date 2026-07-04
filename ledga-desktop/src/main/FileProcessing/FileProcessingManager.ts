import * as path from "path"
import * as fs from "fs/promises"
import type { ProjectAssetRepository } from "../AssetManagement/ProjectAssetRepository"
import type { AssetRendererNotificationService } from "../AssetManagement/AssetRendererNotificationService"
import type { NotificationService } from "../Notifications/NotificationService"
import type { ConversationRepository } from "../ConversationManagement/ConversationRepository"
import type { ConversationRendererNotificationService } from "../ConversationManagement/ConversationRendererNotificationService"
import type { FileWorkerResult, FileProcessingTaskPayload, FileProcessingResultMessage } from "../../common/types/FileProcessingTypes"
import { ProcessingPriority } from "../../common/types/FileProcessingTypes"
import type { Logger } from "../logging/FileLogger"
import { ProcessingStatus, type PyleHoundFile } from "../../common/types/ProjectTypes"
import type { BackgroundWorkerManager } from "../BackgroundWorker/BackgroundWorkerManager"
import type { BackgroundTask } from "../BackgroundWorker/WorkerPool"
import { t } from "../i18n/i18nextBackend"
import type { FileProcessingConfig } from "./FileProcessingConfig"
import { FileProcessorRegistry } from "./FileProcessorRegistry"
import type { Alert } from "@/renderer/AlertFeature/types/Alert"

export class FileProcessingManager {
    private fileProcessingPromises = new Map<string, Promise<FileWorkerResult>>()

    private taskId(fileId: string): string {
        return `file-processing-${fileId}`
    }

    constructor(
        private assetRepository: ProjectAssetRepository,
        private backgroundWorkerManager: BackgroundWorkerManager,
        private logger: Logger,
        private appStorageDir: string,
        private processorConfig: FileProcessingConfig,
        private notificationService: AssetRendererNotificationService,
        private userNotificationService: NotificationService,
        private conversationRepository: ConversationRepository,
        private conversationRendererNotificationService: ConversationRendererNotificationService
    ) {}

    async processNewFiles(importId?: string): Promise<void> {
        try {
            const pendingFiles = await this.assetRepository.getFilesByProcessingStatus("pending")

            if (pendingFiles.length === 0) {
                this.logger.debug("No pending files found")
                return
            }

            const results = await this.processFilesBatch(
                pendingFiles.map(f => f.id),
                ProcessingPriority.NORMAL
            )

            if (importId) {
                const successCount = results.filter(r => r.success).length
                const failCount = results.filter(r => !r.success).length
                this.notifyUserAboutImport(importId, successCount, failCount, pendingFiles.length)
            }

            this.logger.info(`${pendingFiles.length} files processed`)
        } catch (error) {
            this.logger.error("Error scheduling files for processing:", error)
        }
    }

    async processFiles(fileIds: string[], priority: ProcessingPriority = ProcessingPriority.NORMAL, abortSignal?: AbortSignal): Promise<PyleHoundFile[]> {
        const results = await this.processFilesBatch(fileIds, priority, abortSignal)

        const failedFiles = results.filter(r => !r.success)
        if (failedFiles.length > 0) {
            throw new Error(`File processing failed: ${failedFiles.map(f => f.error || "Unknown error").join(", ")}`)
        }

        return Promise.all(fileIds.map(id => this.assetRepository.getFileById(id)))
    }

    private async processFilesBatch(fileIds: string[], priority: ProcessingPriority, abortSignal?: AbortSignal): Promise<FileWorkerResult[]> {
        return Promise.all(fileIds.map(id => this.processFile(id, priority, abortSignal)))
    }

    async processFile(fileId: string, priority: ProcessingPriority = ProcessingPriority.NORMAL, abortSignal?: AbortSignal): Promise<FileWorkerResult> {
        const existingPromise = this.fileProcessingPromises.get(fileId)
        if (existingPromise) {
            this.logger.debug(`File ${fileId} already has a processing promise, returning existing`)
            return existingPromise
        }

        const promise = this.executeFileProcessing(fileId, priority, abortSignal)
        this.fileProcessingPromises.set(fileId, promise)

        return promise.finally(() => {
            this.fileProcessingPromises.delete(fileId)
        })
    }

    cancelFileProcessing(fileIds: string[]): void {
        if (fileIds.length === 0) {
            return
        }

        const taskIds = fileIds.map(fileId => this.taskId(fileId))
        this.backgroundWorkerManager.cancelTasks(taskIds)
    }

    async waitForFiles(fileIds: string[], abortSignal?: AbortSignal, cancellableFileIds: string[] = []): Promise<FileWorkerResult[]> {
        if (fileIds.length === 0) {
            return []
        }

        this.logger.debug(`Waiting for ${fileIds.length} files to finish processing`)

        const promises = fileIds.map(fileId => this.fileProcessingPromises.get(fileId)).filter((p): p is Promise<FileWorkerResult> => p !== undefined)

        try {
            const results =
                promises.length > 0
                    ? await Promise.race([Promise.all(promises), new Promise<never>((_, reject) => abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true }))])
                    : []

            this.logger.debug(`Finished waiting for ${fileIds.length} files`)
            return results
        } catch (error) {
            if (abortSignal?.aborted && cancellableFileIds.length > 0) {
                this.logger.debug(`Aborted waiting for files, cancelling ${cancellableFileIds.length} message-attached tasks`)
                this.cancelFileProcessing(cancellableFileIds)
            }
            throw error
        }
    }

    private async executeFileProcessing(fileId: string, priority: ProcessingPriority, _abortSignal?: AbortSignal): Promise<FileWorkerResult> {
        const downloadedFilePath: string | null = null

        try {
            const file = await this.assetRepository.getFileById(fileId)

            if (!file) {
                this.logger.warn(`File not found for processing: ${fileId}`)
                throw new Error("No file found for processing")
            }

            if (file.processingStatus === "processing" || file.processingStatus === "completed") {
                throw new Error("File already in processing")
            }

            const localPath = file.source.path

            const extension = path.extname(file.name || "").toLowerCase()
            if (!extension || !(await FileProcessorRegistry.validateProcessor(localPath || ""))) {
                return await this.handleUnsupportedFileType(file)
            }

            await this.assetRepository.updateFileProcessingStatus(fileId, "processing")

            const updatedFile = await this.assetRepository.getFileById(fileId)
            if (updatedFile) {
                this.notifyRendereOfFileUpdate(updatedFile)
            }

            const taskPayload: FileProcessingTaskPayload = {
                fileId,
                originalPath: localPath || "",
                fileName: file.name,
                appStorageDir: this.appStorageDir,
                priority,
                config: this.processorConfig
            }

            const task: BackgroundTask<FileProcessingTaskPayload, FileProcessingResultMessage> = {
                id: this.taskId(fileId),
                type: "file_processing",
                priority: priority,
                payload: taskPayload,
                timeout: this.processorConfig.common.timeout,
                resolve: () => {}, // Will be set by executeTask
                reject: () => {}, // Will be set by executeTask
                enqueuedAt: Date.now()
            }

            const workerResult = await this.backgroundWorkerManager.executeTask<FileProcessingTaskPayload, FileProcessingResultMessage>(task)
            const result = workerResult.result || (workerResult as unknown as FileWorkerResult)
            const fileStillExists = await this.assetRepository.getFileById(fileId)
            if (!fileStillExists) {
                this.logger.debug(`File ${fileId} deleted during processing, discarding result`)
                return {
                    success: false,
                    fileId,
                    error: "File deleted during processing"
                }
            }

            // The workerResult is the FileProcessingResultMessage, extract the actual result
            if (result.success) {
                await this.handleWorkerSuccess(result)
            } else {
                await this.handleWorkerFailure(result)
            }

            if (downloadedFilePath) {
                await fs.unlink(downloadedFilePath).catch(err => this.logger.error("Failed to cleanup temp file", { fileId, downloadedFilePath, error: err }))
            }

            return result
        } catch (error) {
            this.logger.error(`Error processing file ${fileId}:`, error)
            await this.assetRepository.updateFileProcessingStatus(fileId, "failed", error instanceof Error ? error.message : String(error))

            if (downloadedFilePath) {
                await fs.unlink(downloadedFilePath).catch(err => this.logger.error("Failed to cleanup temp file", { fileId, downloadedFilePath, error: err }))
            }

            // Notify renderer about failure
            const failedFile = await this.assetRepository.getFileById(fileId)
            if (failedFile) {
                await this.notifyRendereOfFileUpdate(failedFile)
            }
            return {
                success: false,
                fileId,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }

    private async handleUnsupportedFileType(file: PyleHoundFile): Promise<FileWorkerResult> {
        const extension = path.extname(file.name || "").toLowerCase() || "unknown"
        const message = `This file type is not supported${extension !== "unknown" ? ` (${extension})` : ""}`
        const updated = await this.assetRepository.updateFile(file.id, {
            processing_status: ProcessingStatus.FAILED,
            processing_error: message,
            processing_completed_at: new Date().toISOString(),
            processing_attempts: (file.processingAttempts || 0) + 1
        })
        await this.notifyRendereOfFileUpdate(updated)

        return {
            success: false,
            fileId: file.id,
            error: message
        }
    }

    private async handleWorkerSuccess(result: FileWorkerResult): Promise<void> {
        // Validate extracted text - fail if no meaningful content
        const extractedText = result.extractedText || ""
        const trimmedText = extractedText.trim()

        if (trimmedText.length < 10) {
            this.logger.warn(`File processing marked as failed - insufficient text extracted: ${result.fileId}`, {
                textLength: trimmedText.length,
                text: trimmedText
            })

            const failedFile = await this.assetRepository.updateFile(result.fileId, {
                processing_status: ProcessingStatus.FAILED,
                processing_error: `No meaningful text content extracted (${trimmedText.length} characters)`,
                processing_completed_at: new Date().toISOString(),
                processing_attempts: 1
            })

            // Notify renderer about failure
            await this.notifyRendereOfFileUpdate(failedFile)

            return
        }

        const fileHash = result.hash || ""

        // Process as normal (unique file)
        await this.assetRepository.updateFileContent({
            fileId: result.fileId,
            hash: fileHash,
            extractedText: result.extractedText || "",
            aiSummary: result.aiSummary || null,
            sizeBytes: result.sizeBytes || 0,
            backupFileUrl: result.backupFilePath,
            processingStatus: ProcessingStatus.COMPLETED
        })

        this.logger.info(`File processing completed: ${result.fileId}`)

        // If there's a warning, update the processing_error field and notify
        let completedFile: PyleHoundFile
        if (result.warning) {
            completedFile = await this.assetRepository.updateFile(result.fileId, {
                processing_error: result.warning
            })
        } else {
            completedFile = await this.assetRepository.getFileById(result.fileId)
        }

        // Notify renderer about completion
        await this.notifyRendereOfFileUpdate(completedFile)
    }

    private async handleWorkerFailure(result: FileWorkerResult): Promise<void> {
        const file = await this.assetRepository.getFileById(result.fileId)
        const attempts = (file?.processingAttempts || 0) + 1

        // Classify the error to provide better user messages
        let errorMessage = result.error || "Unknown error"
        if (errorMessage.includes("exit code") || errorMessage.includes("system error")) {
            errorMessage = "Processing was interrupted due to a system error"
        }

        // Update file status with failure details
        const failedFile = await this.assetRepository.updateFile(result.fileId, {
            processing_status: ProcessingStatus.FAILED,
            processing_error: errorMessage,
            processing_completed_at: new Date().toISOString(),
            processing_attempts: attempts
        })

        // Notify renderer about failure
        await this.notifyRendereOfFileUpdate(failedFile)

        // If we have metadata even for failed processing, preserve it
        if (result.backupFilePath || result.hash || result.sizeBytes) {
            try {
                await this.assetRepository.updateFileContent({
                    fileId: result.fileId,
                    hash: result.hash || null,
                    extractedText: "", // No text extracted for failed files
                    sizeBytes: result.sizeBytes || 0,
                    backupFileUrl: result.backupFilePath || null,
                    processingStatus: ProcessingStatus.FAILED
                })
                this.logger.info(`Preserved metadata for failed file: ${result.fileId}`)
            } catch (updateError) {
                this.logger.warn(`Failed to preserve metadata for failed file: ${result.fileId}`, updateError)
            }
        }

        this.logger.error(`File processing failed: ${result.fileId}`, { error: result.error })
    }

    private async notifyRendereOfFileUpdate(file: PyleHoundFile): Promise<void> {
        this.notificationService.assetUpdated(file)
        try {
            if (file.stepId) {
                const conversation = await this.conversationRepository.getConversationByStepId(file.stepId)
                if (conversation) {
                    this.conversationRendererNotificationService.conversationUpdated({
                        id: conversation.id,
                        processingFileCount: conversation.processingFileCount
                    })
                }
                return
            }

            const projectId = file.projectId
            if (!projectId) {
                return
            }

            const conversations = await this.conversationRepository.getConversationProcessingFileCountsForProject(projectId)
            for (const conversation of conversations) {
                this.conversationRendererNotificationService.conversationUpdated({
                    id: conversation.id,
                    processingFileCount: conversation.processingFileCount
                })
            }
        } catch (error) {
            this.logger.error("Failed to notify conversation of file update", error)
        }
    }

    private async notifyUserAboutImport(id: string, successfulFiles: number, failedFiles: number, totalFiles: number): Promise<void> {
        try {
            let alert: Alert

            if (failedFiles === 0) {
                // All files processed successfully
                alert = {
                    id: `batch_success_${id}`,
                    type: "success",
                    title: t("notifications.file_processing.batch_completed.title"),
                    description: t("notifications.file_processing.batch_completed.success", { count: successfulFiles }),
                    duration: 5000
                }
            } else if (successfulFiles === 0) {
                // All files failed
                alert = {
                    id: `batch_failed_${id}`,
                    type: "error",
                    title: t("notifications.file_processing.batch_failed.title"),
                    description: t("notifications.file_processing.batch_failed.description", {
                        failedCount: failedFiles,
                        totalCount: totalFiles
                    }),
                    duration: 8000
                }
            } else {
                // Partial success
                alert = {
                    id: `batch_partial_${id}`,
                    type: "warning",
                    title: t("notifications.file_processing.batch_partial.title"),
                    description: t("notifications.file_processing.batch_partial.description", {
                        successCount: successfulFiles,
                        failedCount: failedFiles
                    }),
                    duration: 8000
                }
            }

            await this.userNotificationService.send(alert)
        } catch (error) {
            this.logger.error("Failed to send batch completion notification:", error)
        }
    }
}
