import type { LocalFileSource } from "./SourceFileTypes"

export enum ProcessingStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped"
}

export interface ProjectStatistics {
    totalFiles: number
    totalFolders: number
    totalConversations: number
    totalStorage: number
    processingFileCount: number
}

interface PyleHoundBaseAsset {
    id: string
    name: string
    parentId?: string | null
    projectId?: string
    createdAt: string
    updatedAt: string
}

export interface ProjectFolder extends PyleHoundBaseAsset {
    type: "folder"
    assetCount: number
    projectId: string
    path: string
}

export interface PyleHoundFile extends PyleHoundBaseAsset {
    type: "file"
    stepId?: string
    sizeBytes: number
    hash?: string
    extractedText: string
    aiSummary?: string
    processingStatus: ProcessingStatus
    processingStartedAt?: string
    processingCompletedAt?: string
    processingError?: string
    processingAttempts: number
    source: LocalFileSource
    backupFileUrl: string
    refreshedAt: string
    createdAt: string
    updatedAt: string
}

export type PyleHoundAsset = ProjectFolder | PyleHoundFile

export interface Project {
    id: string
    name: string
    description: string
    createdAt: string
    updatedAt: string
    statistics: ProjectStatistics
}

export interface FileCreateRequest {
    id: string
    name: string
    source: LocalFileSource
    projectId?: string
    stepId?: string
    size: number
    parentId?: string | null
    hash?: string
}

export interface FolderCreateRequest {
    id: string
    name: string
    projectId: string
    parentId?: string | null
}

export interface FileUpdateRequest {
    fileId: string
    hash?: string | null
    extractedText?: string
    aiSummary?: string | null
    sizeBytes?: number
    backupFileUrl?: string | null
    source?: LocalFileSource
    processingStatus?: ProcessingStatus
    processingError?: string | null
    processingAttempts?: number
    structuredData?: string | null
}

export interface ProjectUpsertedEvent {
    project: Project
}

export interface ProjectDeletedEvent {
    projectId: string
}

export interface AssetUpsertedEvent {
    asset: PyleHoundAsset
}

export interface AssetDeletedEvent {
    assetId: string
    projectId: string
}
