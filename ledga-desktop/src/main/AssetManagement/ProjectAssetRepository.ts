import { createHash } from "crypto"
import { promises as fs } from "fs"
import * as path from "path"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"
import type { QueryResult } from "../Database/types/query"
import type { PyleHoundAsset, PyleHoundFile, ProjectFolder, FileCreateRequest, FolderCreateRequest, FileUpdateRequest } from "../../common/types/ProjectTypes"
import { AudioTranscriptSchema } from "../../common/types/AudioTranscriptTypes"
import { FileSourceSchema } from "../../common/types/LegalDatabaseSearchTypes"
import type { FileSource } from "../../common/types/LegalDatabaseSearchTypes"
import type { FileProcessingStatus } from "../../common/types/FileProcessingTypes"
import { getRootFolderId } from "@/common/utils/folderUtils"

export class ProjectAssetRepository {
    private db: DatabaseManager
    private logger: Logger
    private fileStorageDirectory: string

    constructor(db: DatabaseManager, logger: Logger, fileStorageDirectory: string) {
        this.db = db
        this.logger = logger
        this.fileStorageDirectory = fileStorageDirectory
    }

    private backupFilePath(filename: string | null | undefined): string | null {
        if (!filename || filename.trim() === "") {
            return null
        }
        return path.join(this.fileStorageDirectory, filename)
    }

    private filename(fullPath: string | null): string | null {
        if (!fullPath) {
            return null
        }
        return path.basename(fullPath)
    }

    private mapDbRowToPyleHoundAsset(row: Record<string, unknown>): PyleHoundAsset {
        const baseAsset = {
            id: row.id as string,
            name: row.name as string,
            parentId: row.parent_id as string | null,
            projectId: row.project_id as string,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string
        }

        if (row.type === "folder") {
            return {
                ...baseAsset,
                type: "folder",
                assetCount: (row.asset_count as number) || 0,
                path: (row.path as string) || ""
            } as ProjectFolder
        } else {
            const file = {
                ...baseAsset,
                type: "file",
                stepId: (row.step_id as string) || undefined,
                sizeBytes: (row.size_bytes as number) || 0,
                hash: (row.hash as string) || null,
                extractedText: (row.extracted_text as string) || "",
                aiSummary: (row.ai_summary as string) || null,
                processingStatus: (row.processing_status as PyleHoundFile["processingStatus"]) || "pending",
                processingStartedAt: (row.processing_started_at as string) || null,
                processingCompletedAt: (row.processing_completed_at as string) || null,
                processingError: (row.processing_error as string) || null,
                processingAttempts: (row.processing_attempts as number) || 0,
                backupFileUrl: this.backupFilePath(row.backup_filename as string),
                refreshedAt: (row.refreshed_at as string) || (row.updated_at as string),
                source: this.parseSource(row.source as string | null)
            } as PyleHoundFile

            if (row.structured_data) {
                const parsed = AudioTranscriptSchema.safeParse(JSON.parse(row.structured_data as string))
                if (parsed.success) {
                    file.structuredData = parsed.data
                }
            }

            return file
        }
    }

    private parseSource(raw: string | null): FileSource {
        if (!raw) return { provider: "local", path: "" }
        try {
            const parsed = FileSourceSchema.safeParse(JSON.parse(raw))
            return parsed.success ? parsed.data : { provider: "local", path: "" }
        } catch {
            return { provider: "local", path: "" }
        }
    }

    async calculateFileHash(filePath: string): Promise<string> {
        try {
            const fileBuffer = await fs.readFile(filePath)
            return createHash("sha256").update(fileBuffer).digest("hex")
        } catch (error) {
            this.logger.error("Error calculating file hash", { filePath, error })
            throw error
        }
    }

    async getAssetsByProject(projectId: string): Promise<PyleHoundAsset[]> {
        try {
            this.logger.debug("Getting assets by project", { projectId })

            // Query using direct folder-file relationship
            const query = `
                SELECT 'folder' as type, id, name, parent_id, project_id, created_at, updated_at,
                       (SELECT COUNT(*) FROM file WHERE folder_id = folder.id) as asset_count,
                       NULL as size_bytes, NULL as hash, NULL as extracted_text, NULL as ai_summary,
                       NULL as processing_status, NULL as processing_started_at,
                       NULL as processing_completed_at, NULL as processing_error,
                       NULL as processing_attempts, NULL as source,
                       NULL as backup_filename, NULL as refreshed_at, name as path,
                        NULL as structured_data
                FROM folder
                WHERE project_id = ? AND name != 'root'

                UNION ALL

                SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id, f.created_at, f.updated_at,
                       NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary,
                       f.processing_status, f.processing_started_at, f.processing_completed_at,
                       f.processing_error, f.processing_attempts, f.source,
                       f.backup_filename, f.refreshed_at, NULL as path,
                       f.structured_data
                FROM file f
                JOIN folder ON f.folder_id = folder.id
                WHERE folder.project_id = ?
                
                ORDER BY type, name
            `

            const results = await this.db.executeQuery(query, [projectId, projectId])

            if (!Array.isArray(results)) {
                this.logger.warn("Query did not return an array", { projectId, results })
                return []
            }

            const mappedAssets = results.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null).map(row => this.mapDbRowToPyleHoundAsset(row))

            this.logger.debug("Retrieved project assets", { projectId, count: mappedAssets.length })
            return mappedAssets
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting assets by project", { projectId, error: errorMessage })
            throw error
        }
    }

    async getFilesByNamesInConversation(conversationId: string, fileNames: string[]): Promise<Map<string, PyleHoundFile>> {
        if (fileNames.length === 0) return new Map()

        try {
            this.logger.debug("Getting files by names in conversation", { conversationId, count: fileNames.length })

            const placeholders = fileNames.map(() => "?").join(", ")
            const query = `
                SELECT * FROM (
                    SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id,
                           f.created_at, f.updated_at,
                           NULL as asset_count,
                           f.size_bytes, f.hash, f.extracted_text, f.ai_summary,
                           f.processing_status, f.processing_started_at, f.processing_completed_at,
                           f.processing_error, f.processing_attempts, f.source,
                           f.backup_filename, f.refreshed_at, NULL as path,
                           f.structured_data
                    FROM file f
                    LEFT JOIN folder ON f.folder_id = folder.id
                    JOIN message_step ms ON f.step_id = ms.id
                    JOIN message m ON ms.message_id = m.id
                    WHERE m.conversation_id = ? AND f.name COLLATE NOCASE IN (${placeholders})

                    UNION

                    SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id,
                           f.created_at, f.updated_at,
                           NULL as asset_count,
                           f.size_bytes, f.hash, f.extracted_text, f.ai_summary,
                           f.processing_status, f.processing_started_at, f.processing_completed_at,
                           f.processing_error, f.processing_attempts, f.source,
                           f.backup_filename, f.refreshed_at, NULL as path,
                           f.structured_data
                    FROM file f
                    JOIN folder ON f.folder_id = folder.id
                    WHERE folder.project_id = (
                        SELECT c.project_id FROM conversation c WHERE c.id = ? AND c.project_id IS NOT NULL
                    ) AND f.name COLLATE NOCASE IN (${placeholders})
                )
                ORDER BY name
            `

            const results = await this.db.executeQuery(query, [conversationId, ...fileNames, conversationId, ...fileNames])

            if (!Array.isArray(results)) {
                this.logger.warn("Query did not return an array", { conversationId, results })
                return new Map()
            }

            const files = results.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null).map(row => this.mapDbRowToPyleHoundAsset(row)) as PyleHoundFile[]
            const map = new Map<string, PyleHoundFile>()
            for (const file of files) {
                const key = file.name.toLowerCase()
                if (!map.has(key)) map.set(key, file)
            }
            return map
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting files by conversation", { conversationId, error: errorMessage })
            throw error
        }
    }

    async getAssetsByIds(assetIds: string[]): Promise<PyleHoundAsset[]> {
        if (assetIds.length === 0) {
            return []
        }

        try {
            this.logger.debug("Getting assets by IDs", { count: assetIds.length })

            const placeholders = assetIds.map(() => "?").join(", ")

            const query = `
                SELECT 'folder' as type, id, name, parent_id, project_id, created_at, updated_at,
                       (SELECT COUNT(*) FROM file WHERE folder_id = folder.id) as asset_count,
                       NULL as size_bytes, NULL as hash, NULL as extracted_text, NULL as ai_summary,
                       NULL as processing_status, NULL as processing_started_at,
                       NULL as processing_completed_at, NULL as processing_error,
                       NULL as processing_attempts, NULL as source,
                       NULL as backup_filename, NULL as refreshed_at, name as path,
                       NULL as step_id,  NULL as structured_data
                FROM folder
                WHERE id IN (${placeholders})

                UNION ALL

                SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id, f.created_at, f.updated_at,
                       NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary,
                       f.processing_status, f.processing_started_at, f.processing_completed_at,
                       f.processing_error, f.processing_attempts, f.source,
                       f.backup_filename, f.refreshed_at, NULL as path,
                       f.step_id, f.structured_data
                FROM file f
                LEFT JOIN folder ON f.folder_id = folder.id
                WHERE f.id IN (${placeholders})
            `

            const results = await this.db.executeQuery(query, [...assetIds, ...assetIds])

            if (!Array.isArray(results)) {
                this.logger.warn("Query did not return an array", { assetIds, results })
                return []
            }

            const mappedAssets = results.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null).map(row => this.mapDbRowToPyleHoundAsset(row))

            this.logger.debug("Retrieved assets by IDs", { requested: assetIds.length, found: mappedAssets.length })
            return mappedAssets
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting assets by IDs", { assetIds, error: errorMessage })
            throw error
        }
    }

    async getAssetsByFolder(folderId: string): Promise<PyleHoundAsset[]> {
        try {
            this.logger.debug("Getting assets by folder", { folderId })

            const ROOT_PREFIX = "root-"
            const isRootFolder = folderId.startsWith(ROOT_PREFIX)
            const projectIdFromRoot = isRootFolder ? folderId.substring(ROOT_PREFIX.length) : null
            const useRootAwareQuery = Boolean(projectIdFromRoot)

            const folderConditions = useRootAwareQuery ? "(parent_id = ? OR (parent_id IS NULL AND project_id = ? AND id != ?))" : "parent_id = ?"
            const params: Array<string> = []

            if (useRootAwareQuery && projectIdFromRoot) {
                params.push(folderId, projectIdFromRoot, folderId)
            } else {
                params.push(folderId)
            }

            const query = `
                SELECT 'folder' as type, id, name, parent_id, project_id, created_at, updated_at,
                       (SELECT COUNT(*) FROM file WHERE folder_id = folder.id) as asset_count,
                       NULL as size_bytes, NULL as hash, NULL as extracted_text, NULL as ai_summary,
                       NULL as processing_status, NULL as processing_started_at,
                       NULL as processing_completed_at, NULL as processing_error,
                       NULL as processing_attempts, NULL as source,
                       NULL as backup_filename, NULL as refreshed_at, name as path,
                        NULL as structured_data
                FROM folder
                WHERE ${folderConditions}

                UNION ALL

                SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id, f.created_at, f.updated_at,
                       NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary,
                       f.processing_status, f.processing_started_at, f.processing_completed_at,
                       f.processing_error, f.processing_attempts, f.source,
                       f.backup_filename, f.refreshed_at, NULL as path,
                       f.structured_data
                FROM file f
                JOIN folder ON f.folder_id = folder.id
                WHERE f.folder_id = ?

                ORDER BY type, name
            `

            params.push(folderId)

            const results = await this.db.executeQuery(query, params)

            if (!Array.isArray(results)) {
                this.logger.warn("Folder query did not return an array", { folderId, results })
                return []
            }

            const mappedAssets = results.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null).map(row => this.mapDbRowToPyleHoundAsset(row))

            this.logger.debug("Retrieved folder assets", { folderId, count: mappedAssets.length })
            return mappedAssets
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting assets by folder", { folderId, error: errorMessage })
            throw error
        }
    }

    async getAssetById(assetId: string): Promise<PyleHoundAsset> {
        try {
            this.logger.debug("Getting asset by ID", { assetId })

            const fileQuery = `
                SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id,
                       f.created_at, f.updated_at, NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary, f.processing_status,
                       f.processing_started_at, f.processing_completed_at, f.processing_error,
                       f.processing_attempts, f.source, f.backup_filename,
                       f.refreshed_at, NULL as path, f.step_id,
                       f.structured_data
                FROM file f
                LEFT JOIN folder ON f.folder_id = folder.id
                WHERE f.id = ?
            `
            const fileResult = await this.db.executeQuery(fileQuery, [assetId])
            if (fileResult && Array.isArray(fileResult) && fileResult.length > 0) {
                return this.mapDbRowToPyleHoundAsset(fileResult[0] as Record<string, unknown>)
            }

            const folderQuery = `
                SELECT 'folder' as type, id, name, parent_id, project_id, created_at, updated_at,
                       (SELECT COUNT(*) FROM file WHERE folder_id = folder.id) as asset_count,
                       NULL as size_bytes, NULL as hash, NULL as extracted_text,
                       NULL as processing_status, NULL as processing_started_at,
                       NULL as processing_completed_at, NULL as processing_error,
                       NULL as processing_attempts, NULL as source,
                       NULL as backup_filename, NULL as refreshed_at, name as path
                FROM folder WHERE id = ?
            `
            const folderResult = await this.db.executeQuery(folderQuery, [assetId])
            if (folderResult && Array.isArray(folderResult) && folderResult.length > 0) {
                return this.mapDbRowToPyleHoundAsset(folderResult[0] as Record<string, unknown>)
            }

            this.logger.debug("Asset not found", { assetId })
            throw new Error("Asset not found")
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting asset by ID", { assetId, error: errorMessage })
            throw error
        }
    }

    async getFileByBackupPath(backupPath: string): Promise<PyleHoundFile | null> {
        try {
            // Extract filename from full path for database query
            const filename = this.filename(backupPath)
            if (!filename) {
                this.logger.warn("Could not extract filename from backup path", { backupPath })
                return null
            }

            const results = await this.db.executeQuery("SELECT * FROM file WHERE backup_filename = ?", [filename])
            if (results && Array.isArray(results) && results.length > 0) {
                const fileData = results[0] as Record<string, unknown>
                // Add missing fields for direct mapping
                const completeRow = {
                    ...fileData,
                    type: "file",
                    parent_id: fileData.folder_id,
                    project_id: "", // Basic mapping, may not have full project context
                    asset_count: null,
                    path: null
                }
                return this.mapDbRowToPyleHoundAsset(completeRow) as PyleHoundFile
            }

            return null
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting file by backup path", {
                backupPath,
                error: errorMessage
            })
            throw error
        }
    }

    async createFile(request: FileCreateRequest): Promise<PyleHoundFile> {
        try {
            this.logger.debug("Creating file", { request })

            if (request.stepId) {
                await this.db.executeQuery(
                    `INSERT INTO file (
                        id, step_id, folder_id, name, hash, size_bytes, processing_status,
                        processing_attempts, source, created_at, updated_at, refreshed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [request.id, request.stepId, request.parentId || null, request.name, request.hash || null, request.size, "pending" as const, 0, JSON.stringify(request.source)]
                )
            } else {
                let targetFolderId = request.parentId
                if (!targetFolderId && request.projectId) {
                    targetFolderId = getRootFolderId(request.projectId)
                }
                await this.db.executeQuery(
                    `INSERT INTO file (
                        id, folder_id, name, hash, size_bytes, processing_status,
                        processing_attempts, source, created_at, updated_at, refreshed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [request.id, targetFolderId, request.name, request.hash || null, request.size, "pending" as const, 0, JSON.stringify(request.source)]
                )
            }

            const createdFile = await this.getFileById(request.id)
            this.logger.debug("File created successfully", { id: request.id })
            return createdFile
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error creating file", { request, error: errorMessage })
            throw error
        }
    }

    async createFolder(request: FolderCreateRequest): Promise<ProjectFolder> {
        try {
            this.logger.debug("Creating folder", { request })

            await this.db.executeQuery(
                `INSERT INTO folder (
                    id, project_id, parent_id, name,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [request.id, request.projectId, request.parentId || null, request.name]
            )

            const createdFolder = await this.getAssetById(request.id)
            if (!createdFolder || createdFolder.type !== "folder") {
                throw new Error(`Failed to create folder: ${request.id}`)
            }

            this.logger.debug("Folder created successfully", { id: request.id })
            return createdFolder
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error creating folder", { request, error: errorMessage })
            throw error
        }
    }

    async updateFileProcessingStatus(fileId: string, status: FileProcessingStatus, error?: string): Promise<boolean> {
        try {
            this.logger.debug("Updating file processing status", { fileId, status })

            const setClauses = ["processing_status = ?", "updated_at = CURRENT_TIMESTAMP"]
            const params: (string | null)[] = [status]

            if (status === "processing") {
                setClauses.push("processing_started_at = CURRENT_TIMESTAMP")
            } else if (status === "completed") {
                setClauses.push("processing_completed_at = CURRENT_TIMESTAMP")
            } else if (status === "failed" && error) {
                setClauses.push("processing_error = ?")
                params.push(error)
            }

            params.push(fileId)

            const result = (await this.db.executeQuery(`UPDATE file SET ${setClauses.join(", ")} WHERE id = ?`, params)) as QueryResult

            const success = (result.changes ?? 0) > 0
            this.logger.debug("File processing status updated", { fileId, status, success })
            return success
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating file processing status", {
                fileId,
                status,
                error: errorMessage
            })
            throw error
        }
    }

    async deleteAssets(assetIds: string[]): Promise<number> {
        if (assetIds.length === 0) {
            return 0
        }

        try {
            this.logger.debug("Deleting assets", { count: assetIds.length })

            const placeholders = assetIds.map(() => "?").join(", ")

            // Files with stepId: detach from project (set folder_id = NULL)
            // Cleanup job will delete orphaned files later
            await this.db.executeQuery(`UPDATE file SET folder_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND step_id IS NOT NULL`, assetIds)

            // Files without stepId: delete directly
            const fileResult = (await this.db.executeQuery(`DELETE FROM file WHERE id IN (${placeholders}) AND step_id IS NULL`, assetIds)) as QueryResult

            // Folders: delete (FK uses ON DELETE SET NULL for child files)
            const folderResult = (await this.db.executeQuery(`DELETE FROM folder WHERE id IN (${placeholders})`, assetIds)) as QueryResult

            const totalDeleted = (fileResult.changes ?? 0) + (folderResult.changes ?? 0)
            this.logger.debug("Deleted assets", { totalDeleted })

            return totalDeleted
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error deleting assets", { assetIds, error: errorMessage })
            throw error
        }
    }

    async isFolderEmpty(folderId: string): Promise<boolean> {
        try {
            const result = (await this.db.executeQuery(
                `SELECT 
                    (SELECT COUNT(*) FROM folder WHERE parent_id = ?) AS subfolders,
                    (SELECT COUNT(*) FROM file WHERE folder_id = ?) AS files`,
                [folderId, folderId]
            )) as Array<{ subfolders: number; files: number }>

            if (!Array.isArray(result) || result.length === 0) {
                return true
            }

            const counts = result[0]
            return (counts.subfolders ?? 0) === 0 && (counts.files ?? 0) === 0
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error checking if folder is empty", { folderId, error: errorMessage })
            throw error
        }
    }

    async updateFileContent(updateRequest: FileUpdateRequest): Promise<boolean> {
        try {
            this.logger.debug("Updating file content", {
                fileId: updateRequest.fileId,
                hashLength: updateRequest.hash?.length,
                textLength: updateRequest.extractedText?.length || 0,
                hasBackupUrl: !!updateRequest.backupFileUrl,
                processingStatus: updateRequest.processingStatus
            })

            const setClauses = ["processing_completed_at = CURRENT_TIMESTAMP", "updated_at = CURRENT_TIMESTAMP", "refreshed_at = CURRENT_TIMESTAMP"]
            const params: (string | null)[] = []

            if (updateRequest.hash !== undefined) {
                setClauses.push("hash = ?")
                params.push(updateRequest.hash)
            }

            if (updateRequest.extractedText !== undefined) {
                setClauses.push("extracted_text = ?")
                params.push(updateRequest.extractedText)
            }

            if (updateRequest.aiSummary !== undefined) {
                setClauses.push("ai_summary = ?")
                params.push(updateRequest.aiSummary)
            }

            if (updateRequest.processingStatus !== undefined) {
                setClauses.push("processing_status = ?")
                params.push(updateRequest.processingStatus)
            }

            if (updateRequest.sizeBytes !== undefined) {
                setClauses.push("size_bytes = ?")
                params.push(updateRequest.sizeBytes.toString())
            }

            if (updateRequest.backupFileUrl !== undefined) {
                setClauses.push("backup_filename = ?")
                // Extract filename from full path before storing
                const filename = this.filename(updateRequest.backupFileUrl)
                params.push(filename)
            }

            if (updateRequest.structuredData !== undefined) {
                setClauses.push("structured_data = ?")
                params.push(updateRequest.structuredData)
            }

            params.push(updateRequest.fileId)

            const result = (await this.db.executeQuery(`UPDATE file SET ${setClauses.join(", ")} WHERE id = ?`, params)) as QueryResult

            const success = (result.changes ?? 0) > 0
            this.logger.debug("File content updated", { fileId: updateRequest.fileId, success })
            return success
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating file content", {
                fileId: updateRequest.fileId,
                error: errorMessage
            })
            throw error
        }
    }

    async getFilesByProcessingStatus(status: "pending" | "processing" | "completed" | "failed" | "skipped"): Promise<PyleHoundFile[]> {
        try {
            this.logger.debug("Getting files by processing status", { status })

            const results = await this.db.executeQuery("SELECT * FROM file WHERE processing_status = ?", [status])

            if (!results || !Array.isArray(results)) {
                return []
            }

            const validFiles = results
                .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
                .map(fileData => {
                    const completeRow = {
                        ...fileData,
                        type: "file",
                        parent_id: fileData.folder_id,
                        project_id: "", // Basic mapping, may not have full project context
                        asset_count: null,
                        path: null
                    }
                    return this.mapDbRowToPyleHoundAsset(completeRow) as PyleHoundFile
                })

            this.logger.debug("Retrieved files by processing status", {
                status,
                count: validFiles.length
            })
            return validFiles
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting files by processing status", {
                status,
                error: errorMessage
            })
            throw error
        }
    }

    async getFileById(fileId: string): Promise<PyleHoundFile> {
        try {
            const asset = await this.getAssetById(fileId)
            if (asset && asset.type === "file") {
                return asset
            }
            throw new Error("File not found!")
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting file by ID", { fileId, error: errorMessage })
            throw error
        }
    }

    async updateFile(
        fileId: string,
        updates: Partial<{
            name: string
            source: FileSource
            processing_status: "pending" | "processing" | "completed" | "failed" | "skipped"
            processing_error: string | null
            processing_completed_at: string | null
            processing_started_at: string | null
            processing_attempts: number
        }>
    ): Promise<PyleHoundFile> {
        try {
            this.logger.debug("Updating file", { fileId, updates })

            const setClauses: string[] = []
            const params: (string | number | null)[] = []

            if (updates.name !== undefined) {
                setClauses.push("name = ?")
                params.push(updates.name)
            }

            if (updates.source !== undefined) {
                setClauses.push("source = ?")
                params.push(JSON.stringify(updates.source))
            }

            if (updates.processing_status !== undefined) {
                setClauses.push("processing_status = ?")
                params.push(updates.processing_status)
            }

            if (updates.processing_error !== undefined) {
                setClauses.push("processing_error = ?")
                params.push(updates.processing_error)
            }

            if (updates.processing_completed_at !== undefined) {
                setClauses.push("processing_completed_at = ?")
                params.push(updates.processing_completed_at)
            }

            if (updates.processing_attempts !== undefined) {
                setClauses.push("processing_attempts = ?")
                params.push(updates.processing_attempts)
            }

            if (setClauses.length === 0) {
                return await this.getFileById(fileId)
            }

            setClauses.push("updated_at = CURRENT_TIMESTAMP")
            params.push(fileId)

            const result = (await this.db.executeQuery(`UPDATE file SET ${setClauses.join(", ")} WHERE id = ?`, params)) as QueryResult

            const success = (result.changes ?? 0) > 0
            if (!success) {
                throw new Error(`Failed to update file: ${fileId}`)
            }

            this.logger.debug("File updated", { fileId, success })

            return await this.getFileById(fileId)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating file", { fileId, error: errorMessage })
            throw error
        }
    }

    async markIncompleteImportsAsSkipped(errorMessage: string): Promise<number> {
        try {
            const result = (await this.db.executeQuery(
                `UPDATE file
                    SET processing_status = 'skipped',
                        processing_error = ?,
                        processing_completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                  WHERE processing_status IN ('processing', 'pending')`,
                [errorMessage]
            )) as QueryResult
            return result.changes ?? 0
        } catch (error) {
            const errorString = error instanceof Error ? error.message : String(error)
            this.logger.error("Error marking incomplete imports as skipped", { error: errorString })
            throw error
        }
    }

    async countIncompleteImports(): Promise<number> {
        try {
            const rows = (await this.db.executeQuery(`SELECT COUNT(*) AS c FROM file WHERE processing_status IN ('processing', 'pending')`, [])) as Array<{ c: number }>
            return rows[0]?.c ?? 0
        } catch (error) {
            const errorString = error instanceof Error ? error.message : String(error)
            this.logger.error("Error counting incomplete imports", { error: errorString })
            return 0
        }
    }

    async getFilesByProjectId(projectId: string): Promise<PyleHoundFile[]> {
        this.logger.debug(`Getting files for project: ${projectId}`)

        try {
            const results = (await this.db.executeQuery(
                `SELECT 
                    f.id,
                    f.folder_id as parentId,
                    folder.project_id as projectId,
                    f.name,
                    f.size_bytes,
                    f.hash,
                    f.processing_status,
                    f.processing_started_at,
                    f.processing_completed_at,
                    f.processing_error,
                    f.processing_attempts,
                    f.source,
                    f.backup_filename,
                    f.extracted_text,
                    f.ai_summary,
                    f.refreshed_at,
                    f.created_at,
                    f.updated_at,
                    folder.name as folderName
                FROM file f
                JOIN folder ON f.folder_id = folder.id
                WHERE folder.project_id = ? 
                AND f.extracted_text IS NOT NULL 
                AND TRIM(f.extracted_text) != ''
                AND f.processing_status = 'completed'
                ORDER BY f.name ASC`,
                [projectId]
            )) as {
                id: string
                parentId: string | null
                projectId: string
                name: string
                size_bytes: number | undefined
                hash: string | undefined
                processing_status: string
                processing_started_at: string | undefined
                processing_completed_at: string | undefined
                processing_error: string | undefined
                processing_attempts: number
                source: string | null
                backup_filename: string | undefined
                extracted_text: string
                ai_summary: string | undefined
                refreshed_at: string
                created_at: string
                updated_at: string
                folderName: string | undefined
            }[]

            return results.map(row => ({
                id: row.id,
                type: "file" as const,
                name: row.name,
                parentId: row.parentId,
                projectId: row.projectId,
                sizeBytes: row.size_bytes || 0,
                hash: row.hash,
                extractedText: row.extracted_text,
                aiSummary: row.ai_summary,
                processingStatus: row.processing_status as PyleHoundFile["processingStatus"],
                processingStartedAt: row.processing_started_at,
                processingCompletedAt: row.processing_completed_at,
                processingError: row.processing_error,
                processingAttempts: row.processing_attempts,
                source: this.parseSource(row.source),
                backupFileUrl: this.backupFilePath(row.backup_filename) || "",
                refreshedAt: row.refreshed_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }))
        } catch (error) {
            this.logger.error(`Error getting files for project ${projectId}:`, error)
            throw new Error(`Failed to get files for project ${projectId}`)
        }
    }

    async getFilesByName(params: { fileName: string; projectId?: string; conversationId?: string }): Promise<PyleHoundFile[]> {
        const { fileName, projectId, conversationId } = params
        this.logger.debug("Getting files by name", { fileName, projectId, conversationId })

        if (!projectId && !conversationId) {
            throw new Error("At least one of projectId or conversationId must be provided")
        }

        try {
            const queries: string[] = []
            const queryParams: string[] = []

            if (projectId) {
                queries.push(`
                    SELECT
                        f.id, f.folder_id as parentId, folder.project_id as projectId, f.step_id as stepId,
                        f.name, f.size_bytes, f.hash, f.processing_status, f.processing_started_at,
                        f.processing_completed_at, f.processing_error, f.processing_attempts,
                        f.source, f.backup_filename, f.extracted_text, f.ai_summary,
                        f.refreshed_at, f.created_at, f.updated_at
                    FROM file f
                    JOIN folder ON f.folder_id = folder.id
                    WHERE folder.project_id = ? AND f.name = ? COLLATE NOCASE
                `)
                queryParams.push(projectId, fileName)
            }

            if (conversationId) {
                queries.push(`
                    SELECT
                        f.id, f.folder_id as parentId, NULL as projectId, f.step_id as stepId,
                        f.name, f.size_bytes, f.hash, f.processing_status, f.processing_started_at,
                        f.processing_completed_at, f.processing_error, f.processing_attempts,
                        f.source, f.backup_filename, f.extracted_text, f.ai_summary,
                        f.refreshed_at, f.created_at, f.updated_at
                    FROM file f
                    JOIN message_step ms ON f.step_id = ms.id
                    JOIN message m ON ms.message_id = m.id
                    WHERE m.conversation_id = ? AND f.name = ? COLLATE NOCASE
                `)
                queryParams.push(conversationId, fileName)
            }

            const fullQuery = `SELECT * FROM (${queries.join(" UNION ")}) AS files_by_name ORDER BY files_by_name.updated_at DESC`

            const results = (await this.db.executeQuery(fullQuery, queryParams)) as {
                id: string
                parentId: string | null
                projectId: string | null
                stepId: string | null
                name: string
                size_bytes: number | undefined
                hash: string | undefined
                processing_status: string
                processing_started_at: string | undefined
                processing_completed_at: string | undefined
                processing_error: string | undefined
                processing_attempts: number
                source: string | null
                backup_filename: string | undefined
                extracted_text: string
                ai_summary: string | undefined
                refreshed_at: string
                created_at: string
                updated_at: string
            }[]

            const seen = new Set<string>()
            return results
                .filter(row => {
                    if (seen.has(row.id)) return false
                    seen.add(row.id)
                    return true
                })
                .map(row => ({
                    id: row.id,
                    type: "file" as const,
                    name: row.name,
                    parentId: row.parentId ?? undefined,
                    projectId: row.projectId ?? undefined,
                    stepId: row.stepId ?? undefined,
                    sizeBytes: row.size_bytes || 0,
                    hash: row.hash,
                    extractedText: row.extracted_text,
                    aiSummary: row.ai_summary,
                    processingStatus: row.processing_status as PyleHoundFile["processingStatus"],
                    processingStartedAt: row.processing_started_at,
                    processingCompletedAt: row.processing_completed_at,
                    processingError: row.processing_error,
                    processingAttempts: row.processing_attempts,
                    source: this.parseSource(row.source),
                    backupFileUrl: this.backupFilePath(row.backup_filename) || "",
                    refreshedAt: row.refreshed_at,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }))
        } catch (error) {
            this.logger.error("Error getting files by name", { fileName, projectId, conversationId, error })
            throw new Error(`Failed to get files named ${fileName}`)
        }
    }

    async getFilesByProjectAndStatus(projectId: string, status: "pending" | "processing" | "completed" | "failed" | "skipped"): Promise<PyleHoundFile[]> {
        try {
            this.logger.debug("Getting files by project and status", { projectId, status })

            const query = `
                SELECT 'file' as type, f.id, f.name, f.folder_id as parent_id, folder.project_id,
                       f.created_at, f.updated_at, NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary, f.processing_status,
                       f.processing_started_at, f.processing_completed_at, f.processing_error,
                       f.processing_attempts, f.source, f.backup_filename,
                       f.refreshed_at, NULL as path,
                       f.structured_data
                FROM file f
                JOIN folder ON f.folder_id = folder.id
                WHERE folder.project_id = ? AND f.processing_status = ?
                ORDER BY f.name
            `

            const results = await this.db.executeQuery(query, [projectId, status])

            if (!Array.isArray(results)) {
                this.logger.warn("Query did not return an array", { projectId, status, results })
                return []
            }

            const mappedFiles = results
                .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
                .map(row => this.mapDbRowToPyleHoundAsset(row))
                .filter((asset): asset is PyleHoundFile => asset.type === "file")

            this.logger.debug("Retrieved files by project and status", {
                projectId,
                status,
                count: mappedFiles.length
            })

            return mappedFiles
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting files by project and status", {
                projectId,
                status,
                error: errorMessage
            })
            throw error
        }
    }

    async getFilesByStepId(stepId: string): Promise<PyleHoundFile[]> {
        try {
            this.logger.debug("Getting files by step ID", { stepId })

            const query = `
                SELECT 'file' as type, f.id, f.name, NULL as parent_id, NULL as project_id,
                       f.created_at, f.updated_at, NULL as asset_count,
                       f.size_bytes, f.hash, f.extracted_text, f.ai_summary, f.processing_status,
                       f.processing_started_at, f.processing_completed_at, f.processing_error,
                       f.processing_attempts, f.source, f.backup_filename,
                       f.refreshed_at, NULL as path, f.step_id, f.structured_data
                FROM file f
                WHERE f.step_id = ?
                ORDER BY f.name
            `

            const results = await this.db.executeQuery(query, [stepId])

            if (!Array.isArray(results)) {
                return []
            }

            const mappedFiles = results
                .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
                .map(row => this.mapDbRowToPyleHoundAsset(row))
                .filter((asset): asset is PyleHoundFile => asset.type === "file")

            this.logger.debug("Retrieved files by step ID", { stepId, count: mappedFiles.length })
            return mappedFiles
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting files by step ID", { stepId, error: errorMessage })
            throw error
        }
    }

    async getFilesByConversationIdWithStatus(conversationId: string, statusFilter?: FileProcessingStatus[], includeProjectFiles = true): Promise<PyleHoundFile[]> {
        this.logger.debug("Getting files by conversation ID", { conversationId, statusFilter, includeProjectFiles })

        const statusClause = statusFilter?.length ? `WHERE f.processing_status IN (${statusFilter.map(() => "?").join(", ")})` : ""

        const messageFilesQuery = `
                SELECT 'file' as type, f.id, f.name, NULL as parent_id, NULL as project_id,
                   f.created_at, f.updated_at, NULL as asset_count,
                   f.size_bytes, f.hash, f.extracted_text, f.ai_summary, f.processing_status,
                   f.processing_started_at, f.processing_completed_at, f.processing_error,
                   f.processing_attempts, f.source, f.backup_filename,
                   f.refreshed_at, NULL as path, f.step_id,
                   f.structured_data
                FROM file f
                JOIN message_step ms ON f.step_id = ms.id
                JOIN message m ON ms.message_id = m.id
                WHERE m.conversation_id = ?`

        const projectFilesQuery = `
                UNION
                SELECT 'file' as type, f.id, f.name, NULL as parent_id, NULL as project_id,
                   f.created_at, f.updated_at, NULL as asset_count,
                   f.size_bytes, f.hash, f.extracted_text, f.ai_summary, f.processing_status,
                   f.processing_started_at, f.processing_completed_at, f.processing_error,
                   f.processing_attempts, f.source, f.backup_filename,
                   f.refreshed_at, NULL as path, f.step_id,
                   f.structured_data
                FROM file f
                JOIN folder ON f.folder_id = folder.id
                WHERE folder.project_id = (
                    SELECT c.project_id FROM conversation c WHERE c.id = ? AND c.project_id IS NOT NULL
                )`

        const query = `
            SELECT DISTINCT * FROM (
                ${messageFilesQuery}
                ${includeProjectFiles ? projectFilesQuery : ""}
            ) AS f
            ${statusClause}
            ORDER BY f.name COLLATE NOCASE
        `

        const params = includeProjectFiles
            ? statusFilter?.length
                ? [conversationId, conversationId, ...statusFilter]
                : [conversationId, conversationId]
            : statusFilter?.length
              ? [conversationId, ...statusFilter]
              : [conversationId]

        const results = await this.db.executeQuery(query, params)

        if (!Array.isArray(results)) {
            return []
        }

        return results
            .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
            .map(row => this.mapDbRowToPyleHoundAsset(row))
            .filter((asset): asset is PyleHoundFile => asset.type === "file")
    }

    async deleteOrphanedFileRecords(): Promise<number> {
        try {
            this.logger.debug("Deleting orphaned file records (no folder_id and no step_id)")

            const result = (await this.db.executeQuery("DELETE FROM file WHERE folder_id IS NULL AND step_id IS NULL", [])) as QueryResult

            const deletedCount = result.changes ?? 0
            this.logger.debug("Deleted orphaned file records", { count: deletedCount })
            return deletedCount
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error deleting orphaned file records", { error: errorMessage })
            throw error
        }
    }
}
