import * as fs from "fs/promises"
import { constants as fsConstants } from "fs"
import * as path from "path"
import { pathToFileURL } from "url"
import { shell } from "electron"
import { v4 as uuid } from "uuid"
import type { Logger } from "../logging/FileLogger"
import type { FileProcessingManager } from "../FileProcessing/FileProcessingManager"
import type { PyleHoundFile, ProjectFolder, PyleHoundAsset } from "../../common/types/ProjectTypes"
import type { BackgroundWorkerManager } from "../BackgroundWorker/BackgroundWorkerManager"
import type { ProjectAssetRepository } from "./ProjectAssetRepository"
import type { AssetRendererNotificationService } from "./AssetRendererNotificationService"
import type { ImportFile, OpenFileRequest, ImportFilesRequest, RetryImportRequest } from "@/common/types/FileImportTypes"
import { ProcessingPriority, type FileWorkerResult, type CleanupOrphanedFilesResult } from "@/common/types/FileProcessingTypes"
import { getRootFolderId } from "@/common/utils/folderUtils"

export class AssetManagementService {
    constructor(
        private assetRepository: ProjectAssetRepository,
        private fileProcessingManager: FileProcessingManager,
        private logger: Logger,
        private rendererNotificationService: AssetRendererNotificationService,
        private backgroundWorkerManager: BackgroundWorkerManager
    ) {
        this.initializeProcessing()
    }

    async importFiles(request: ImportFilesRequest, abortSignal?: AbortSignal): Promise<PyleHoundAsset[]> {
        const results: Array<PyleHoundAsset> = []
        const isMessageImport = Boolean(request.stepId)
        this.logger.info(`Importing ${request.files.length} files`, { projectId: request.projectId, stepId: request.stepId })

        for (const file of request.files) {
            try {
                if (file.fileName?.startsWith(".")) continue

                if (file.source.provider === "local") {
                    const stats = await fs.stat(file.source.path)
                    if (stats.isDirectory()) {
                        if (isMessageImport || !request.projectId) {
                            this.logger.warn(`Skipping directory: ${file.fileName}`)
                            continue
                        }
                        const folder = await this.importDirectory(request.projectId, file.source.path, file.folderId)
                        results.push(folder)
                        this.rendererNotificationService.assetCreated(folder)
                        continue
                    }
                }

                const result = await this.createFileImportObject(file, request.projectId, request.stepId)
                results.push(result)
                this.rendererNotificationService.assetCreated(result)
            } catch (error) {
                this.logger.error(`Failed to import: ${file.fileName}`, error)
                if (isMessageImport) throw error
            }
        }

        const fileResults = results.filter((r): r is PyleHoundFile => r.type === "file")
        const priority = isMessageImport ? ProcessingPriority.HIGH : ProcessingPriority.NORMAL

        this.fileProcessingManager
            .processFiles(
                fileResults.map(f => f.id),
                priority,
                abortSignal
            )
            .catch(error => {
                this.logger.error("Error processing files:", error)
            })

        return results
    }

    async importAndProcessFiles(request: ImportFilesRequest, abortSignal?: AbortSignal): Promise<PyleHoundFile[]> {
        const results = await this.importFiles(request, abortSignal)
        const fileResults = results.filter((r): r is PyleHoundFile => r.type === "file")
        const fileIds = fileResults.map(f => f.id)

        if (fileIds.length === 0) return []

        return this.fileProcessingManager.processFiles(fileIds, ProcessingPriority.HIGH, abortSignal)
    }

    async getAssetById(assetId: string): Promise<PyleHoundAsset> {
        try {
            return await this.assetRepository.getAssetById(assetId)
        } catch (error) {
            this.logger.error(`Error retrieving asset: ${assetId}`, error)
            throw error
        }
    }

    async getFileById(fileId: string): Promise<PyleHoundFile> {
        try {
            const asset = await this.getAssetById(fileId)
            if (asset.type === "file") {
                return asset
            } else {
                throw new Error("invalid file id")
            }
        } catch (error) {
            this.logger.error(`Error retrieving file: ${fileId}`, error)
            throw error
        }
    }

    async getFilesByIds(fileIds: string[]): Promise<PyleHoundFile[]> {
        const assets = await this.assetRepository.getAssetsByIds(fileIds)
        return assets.filter((a): a is PyleHoundFile => a.type === "file")
    }

    async getAssetsByProject(projectId: string): Promise<PyleHoundAsset[]> {
        try {
            return await this.assetRepository.getAssetsByProject(projectId)
        } catch (error) {
            this.logger.error(`Error retrieving assets for project: ${projectId}`, error)
            throw error
        }
    }

    async getAccessibleFilesForConversation(conversationId: string): Promise<PyleHoundFile[]> {
        return this.assetRepository.getFilesByConversationIdWithStatus(conversationId)
    }

    async getAssetsByFolder(folderId: string): Promise<PyleHoundAsset[]> {
        try {
            return await this.assetRepository.getAssetsByFolder(folderId)
        } catch (error) {
            this.logger.error(`Error retrieving assets for folder: ${folderId}`, error)
            throw error
        }
    }

    async getProjectFilesMetadata(projectId: string): Promise<Omit<PyleHoundFile, "extractedText">[]> {
        try {
            return (await this.assetRepository.getFilesByProjectId(projectId)).map(file => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { extractedText, ...metadata } = file
                return metadata
            })
        } catch (error) {
            this.logger.error(`Error retrieving file metadata for project: ${projectId}`, error)
            throw error
        }
    }

    async findFilesByName(params: { fileName: string; projectId?: string; conversationId?: string }): Promise<PyleHoundFile[]> {
        const { fileName, projectId, conversationId } = params
        try {
            return await this.assetRepository.getFilesByName({ fileName, projectId, conversationId })
        } catch (error) {
            this.logger.error(`Error retrieving files named ${fileName}`, { projectId, conversationId, error })
            throw error
        }
    }

    async createFolder(projectId: string, name: string, parentId?: string): Promise<ProjectFolder> {
        try {
            const folder = await this.assetRepository.createFolder({
                id: uuid(),
                name,
                projectId,
                parentId: parentId ?? getRootFolderId(projectId)
            })
            this.rendererNotificationService.assetCreated(folder)
            return folder
        } catch (error) {
            this.logger.error(`Error creating folder: ${name}`, error)
            throw error
        }
    }

    async deleteAssets(assetIds: string[]): Promise<number> {
        try {
            const existingAssets = await this.assetRepository.getAssetsByIds(assetIds)
            this.fileProcessingManager.cancelFileProcessing(assetIds)

            const deletedCount = await this.assetRepository.deleteAssets(assetIds)

            for (const asset of existingAssets) {
                if (asset.projectId) {
                    this.rendererNotificationService.assetDeleted(asset.id, asset.projectId)
                }
            }

            const parentIds = new Set(existingAssets.filter(a => a.parentId).map(a => a.parentId))
            for (const parentId of parentIds) {
                const asset = existingAssets.find(a => a.parentId === parentId)
                if (parentId && asset?.projectId) {
                    await this.removeEmptyFolders(parentId, asset.projectId)
                }
            }

            return deletedCount
        } catch (error) {
            this.logger.error(`Error deleting assets: ${assetIds}`, error)
            throw error
        }
    }

    private async removeEmptyFolders(startFolderId: string, projectId: string): Promise<void> {
        try {
            let currentFolderId: string | null = startFolderId
            while (currentFolderId) {
                const folderAsset = await this.assetRepository.getAssetById(currentFolderId)
                if (!folderAsset || folderAsset.type !== "folder") {
                    return
                }

                if (!folderAsset.parentId) {
                    return
                }

                const isEmpty = await this.assetRepository.isFolderEmpty(currentFolderId)
                if (!isEmpty) {
                    return
                }
                const deletedCount = await this.assetRepository.deleteAssets([currentFolderId])
                if (deletedCount > 0) {
                    this.rendererNotificationService.assetDeleted(currentFolderId, projectId)
                }
                currentFolderId = folderAsset.parentId
            }
        } catch (err) {
            this.logger.error("Failed to auto-remove empty folders", err)
        }
    }

    async updateFile(fileId: string, extractedText: string, hash: string, sizeBytes: number, backupFileUrl?: string): Promise<boolean> {
        try {
            const success = await this.assetRepository.updateFileContent({
                fileId,
                hash,
                extractedText,
                sizeBytes,
                backupFileUrl
            })

            if (success) {
                const updatedFile = await this.getFileById(fileId)
                if (updatedFile) {
                    this.rendererNotificationService.assetUpdated(updatedFile)
                }
            }

            return success
        } catch (error) {
            this.logger.error(`Error updating file processing result: ${fileId}`, error)
            throw error
        }
    }

    async openFile(request: OpenFileRequest): Promise<void> {
        try {
            const fileUrl = request.fileUrl
            this.logger.debug(`Opening backup file: ${fileUrl}`)

            // Verify the file exists and is readable
            await fs.access(fileUrl, fsConstants.R_OK)

            // Use shell.openExternal with file:// URL instead of shell.openPath
            // because openPath blocks on Linux until the external application closes
            await shell.openExternal(pathToFileURL(fileUrl).toString())
            this.logger.info(`Successfully opened backup file: ${fileUrl}`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error(`Error opening backup file: ${request.fileUrl}`, error)
            throw new Error(`Cannot access file: ${errorMessage}`)
        }
    }

    private async importDirectory(projectId: string, dirPath: string, parentId: string | undefined): Promise<ProjectFolder> {
        this.logger.info(`Importing directory: ${dirPath}`)
        const dirName = path.basename(dirPath)

        const newFolder = await this.createFolder(projectId, dirName, parentId)

        const entries = await fs.readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
            if (entry.name.startsWith(".")) {
                this.logger.debug(`Skipping hidden file/folder: ${entry.name}`)
                continue
            }

            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                await this.importDirectory(projectId, fullPath, newFolder.id)
            } else if (entry.isFile()) {
                const fileRequest: ImportFile = {
                    fileName: entry.name,
                    source: { provider: "local", path: fullPath },
                    folderId: newFolder.id
                }
                const createdFile = await this.createFileImportObject(fileRequest, projectId)
                this.rendererNotificationService.assetCreated(createdFile)
            }
        }

        try {
            const empty = await this.assetRepository.isFolderEmpty(newFolder.id)
            if (empty) {
                await this.assetRepository.deleteAssets([newFolder.id])
                this.rendererNotificationService.assetDeleted(newFolder.id, projectId)
                this.logger.info(`Removed empty directory after import: ${dirName}`)
            }
        } catch (err) {
            this.logger.warn(`Could not verify emptiness for directory: ${dirName}`, err)
        }

        this.logger.info(`Successfully imported directory: ${dirName}`)
        return newFolder
    }

    async ensureFolderPath(projectId: string, folderPath: string, baseFolderId?: string): Promise<string> {
        if (!folderPath || folderPath.trim() === "") {
            return baseFolderId || getRootFolderId(projectId)
        }

        const segments = folderPath.split("/").filter(segment => segment.trim() !== "")
        let currentParentId = baseFolderId || getRootFolderId(projectId)

        for (const segment of segments) {
            try {
                const existingAssets = await this.assetRepository.getAssetsByFolder(currentParentId)
                const existingFolder = existingAssets.find(asset => asset.type === "folder" && asset.name === segment)

                if (existingFolder) {
                    currentParentId = existingFolder.id
                } else {
                    const newFolder = await this.createFolder(projectId, segment, currentParentId)
                    currentParentId = newFolder.id
                }
            } catch {
                const newFolder = await this.createFolder(projectId, segment, currentParentId)
                currentParentId = newFolder.id
            }
        }

        return currentParentId
    }

    private async resolveParentFolderId(normalizedFileName: string, projectId?: string, requestFolderId?: string, stepId?: string): Promise<string | undefined> {
        if (stepId) {
            return requestFolderId || (projectId ? getRootFolderId(projectId) : undefined)
        }

        if (!projectId) {
            return undefined
        }

        const lastSlashIndex = normalizedFileName.lastIndexOf("/")
        if (lastSlashIndex >= 0) {
            const folderPath = normalizedFileName.substring(0, lastSlashIndex)
            return this.ensureFolderPath(projectId, folderPath, requestFolderId)
        }

        return requestFolderId || getRootFolderId(projectId)
    }

    private async createFileImportObject(request: ImportFile, projectId?: string, stepId?: string): Promise<PyleHoundFile> {
        const isLocal = request.source.provider === "local"
        this.logger.debug(`Importing file: ${request.fileName}`, {
            source: request.source,
            projectId,
            folderId: request.folderId,
            stepId
        })

        try {
            const normalizedPath = (request.fileName ?? "").replace(/\\/g, "/")
            const actualFileName = path.basename(normalizedPath).replace(/[/\\]/g, "-")

            if (!stepId && !projectId) {
                throw new Error("projectId is required for adding files to knowledge base")
            }

            const id = uuid()

            let fileSize = 0
            if (request.source.provider === "local") {
                const stats = await fs.stat(request.source.path)
                fileSize = stats.size
            }

            const parentId = await this.resolveParentFolderId(normalizedPath, projectId, request.folderId, stepId)

            const newFile = await this.assetRepository.createFile({
                id,
                name: actualFileName,
                source: request.source,
                projectId,
                stepId,
                parentId,
                size: fileSize
            })

            this.logger.info(`Imported file: ${actualFileName}`, {
                fileId: id,
                projectId,
                stepId,
                parentId,
                status: "pending",
                isRemote: !isLocal
            })

            return newFile
        } catch (error) {
            this.logger.error(`Failed to import file: ${request.fileName}`, {
                source: request.source,
                projectId,
                stepId,
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }

    async retryAllFailedFilesImport(request: RetryImportRequest): Promise<void> {
        try {
            const failedFiles = await this.assetRepository.getFilesByProjectAndStatus(request.projectId, "failed")
            const succeededFiles = await this.assetRepository.getFilesByProjectAndStatus(request.projectId, "completed")

            // We want to retry all failed and partially failed imports
            // Partially failed imports have status completed but the processingError field is non-null
            for (const file of [...failedFiles, ...succeededFiles]) {
                if (file.processingError) {
                    const updated = await this.assetRepository.updateFile(file.id, {
                        processing_status: "pending",
                        processing_error: null,
                        processing_started_at: Date.now().toString(),
                        processing_completed_at: null
                    })
                    this.rendererNotificationService.assetUpdated(updated)
                }
            }
            this.fileProcessingManager.processNewFiles(request.projectId)
        } catch (error) {
            this.logger.error(`Failed to retry file import for project: ${request.projectId}`, error)
            throw error
        }
    }

    async retryFileProcessing(fileId: string): Promise<void> {
        try {
            this.logger.info(`Retrying file processing: ${fileId}`)
            const updated = await this.assetRepository.updateFile(fileId, {
                processing_status: "pending",
                processing_error: null,
                processing_started_at: Date.now().toString(),
                processing_completed_at: null
            })
            this.rendererNotificationService.assetUpdated(updated)
            this.logger.info(`File queued for retry: ${fileId}`)
            await this.fileProcessingManager.processFile(fileId)
            this.logger.info(`File processing retry initiated successfully: ${fileId}`)
        } catch (error) {
            this.logger.error(`Failed to retry file processing: ${fileId}`, error)
            throw error
        }
    }

    async waitForFilesInConversation(conversationId: string, abortSignal: AbortSignal, includeProjectFiles = true, cancellableFileIds: string[] = []): Promise<FileWorkerResult[]> {
        const files = await this.assetRepository.getFilesByConversationIdWithStatus(conversationId, ["pending", "processing"], includeProjectFiles)
        const fileIds = files.map(file => file.id)
        return this.fileProcessingManager.waitForFiles(fileIds, abortSignal, cancellableFileIds)
    }

    private async initializeProcessing(): Promise<void> {
        try {
            await this.markIncompleteImportsAsSkipped()
            await this.cleanupOrphanedFiles()
        } catch (error) {
            this.logger.error("Error during processing initialization:", error)
        }
    }

    private async markIncompleteImportsAsSkipped(): Promise<void> {
        try {
            const count = await this.assetRepository.markIncompleteImportsAsSkipped("Import interrupted by app shutdown")
            if (count > 0) {
                this.logger.info(`Marked ${count} incomplete imports as skipped`)
            }
        } catch (error) {
            this.logger.error("Error marking incomplete imports as skipped:", error)
        }
    }

    async cleanupOrphanedFiles(): Promise<void> {
        try {
            this.logger.info("Starting orphaned files cleanup")

            const deletedDbRecords = await this.assetRepository.deleteOrphanedFileRecords()
            if (deletedDbRecords > 0) {
                this.logger.info(`Deleted ${deletedDbRecords} orphaned database records`)
            }

            const result = await this.backgroundWorkerManager.executeTask<undefined, CleanupOrphanedFilesResult>({
                id: `cleanup-orphaned-files-${uuid()}`,
                type: "cleanup_orphaned_files",
                priority: ProcessingPriority.LOW,
                payload: undefined,
                timeout: 5 * 60 * 1000,
                resolve: () => {},
                reject: () => {},
                enqueuedAt: Date.now()
            })

            this.logger.info(`Orphaned files cleanup completed. Scanned ${result.scannedCount}, removed ${result.removedCount}, failed ${result.failedCount}`)
        } catch (error) {
            this.logger.error("Error during orphaned files cleanup:", error)
        }
    }
}
