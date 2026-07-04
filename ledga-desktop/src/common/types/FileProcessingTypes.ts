import { z } from "zod"
import type { FileProcessingConfig } from "../../main/FileProcessing/FileProcessingConfig"

export type JSONSchema = Record<string, unknown>

export type ModelTier = "simple" | "medium" | "advanced"

export type FileProcessingStatus = "pending" | "processing" | "completed" | "failed" | "skipped"

export enum ProcessingPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    URGENT = 3
}

export const WorkerTaskTypeSchema = z.enum(["file_processing", "quote_scan", "db_query", "citation_validate", "cleanup_orphaned_files", "email_processing", "email_metadata"])
export type WorkerTaskType = z.infer<typeof WorkerTaskTypeSchema>

export interface ProcessingMetadata {
    readonly filename: string
    readonly extension: string
    readonly size: number
    readonly hash: string
    readonly created?: string
    readonly modified?: string
    readonly mimeType?: string
    readonly processingTime: number
}

interface AIRequestBase {
    requestId: string
    modelTier: ModelTier
}

export interface SummarizeTextAIRequest extends AIRequestBase {
    operation: "summarize"
    data: {
        fileName: string
        textToSummarize: string
        timeout: number
    }
}

export interface DescribeImageAIRequest extends AIRequestBase {
    operation: "describeImage"
    data: {
        imageBuffer: Uint8Array
        mimeType: string
        timeout: number
    }
}

export interface ExtractTextAIRequest extends AIRequestBase {
    operation: "extractText"
    data: {
        imageBuffer: Uint8Array
        mimeType: string
        timeout: number
    }
}

export interface ConversationTitleAIRequest extends AIRequestBase {
    operation: "conversationTitle"
    data: {
        schema: JSONSchema
        messageHistory: string
        timeout: number
    }
}

export interface QuoteScanAIRequest extends AIRequestBase {
    operation: "quoteScan"
    data: {
        schema: JSONSchema
        query: string
        extractedText: string
        timeout: number
    }
}

export interface AudioAIRequest extends AIRequestBase {
    operation: "transcribeAudio"
    data: {
        compressedAudioFilePath: string
        timeout: number
    }
}

export interface PdfAIRequest extends AIRequestBase {
    operation: "extractTextFromPdf"
    data: {
        contentBuffer: Uint8Array
        mediaType: "application/pdf" | "image/png"
        nativeTextContext: string
        schema: JSONSchema
        timeout: number
        pageNumber: number
    }
}

export interface LLMSkillMetadataAIRequest extends AIRequestBase {
    operation: "llmSkillMetadata"
    data: {
        body: string
        existingLabels: string[]
    }
}

export type AIRequest =
    | SummarizeTextAIRequest
    | DescribeImageAIRequest
    | ExtractTextAIRequest
    | ConversationTitleAIRequest
    | QuoteScanAIRequest
    | PdfAIRequest
    | AudioAIRequest
    | LLMSkillMetadataAIRequest

export interface AIResponse<T = unknown> {
    requestId: string
    success: boolean
    result?: T
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
    error?: string
}

export interface WorkerTaskMessage<TPayload = unknown> {
    type: "TASK"
    taskId: string
    taskType: WorkerTaskType
    payload: TPayload
}

export interface WorkerResultMessage<TResult = unknown> {
    type: "RESULT"
    taskId: string
    success: boolean
    result?: TResult
    error?: string
}

export interface WorkerLogMessage {
    type: "LOG"
    level: "debug" | "info" | "warn" | "error"
    message: string
    meta?: unknown
    timestamp: string
    contextId?: string
}

export interface WorkerAIRequestMessage {
    type: "AI_REQUEST"
    payload: AIRequest
}

export interface WorkerAIResponseMessage<T = unknown> {
    type: "AI_RESPONSE"
    payload: AIResponse<T>
}

export type FileProcessingTaskMessage = WorkerTaskMessage<FileProcessingTaskPayload>
export type FileProcessingResultMessage = WorkerResultMessage<FileWorkerResult>

export interface WorkerCancelMessage {
    type: "CANCEL"
}

export const CANCELLED_EXIT_CODE = 143

export type MainToWorkerMessage = WorkerTaskMessage<unknown> | WorkerAIResponseMessage | WorkerCancelMessage
export type WorkerToMainMessage = WorkerResultMessage<unknown> | WorkerLogMessage | WorkerAIRequestMessage

export interface FileWorkerResult {
    type?: "RESULT"
    success: boolean
    fileId: string
    extractedText?: string
    aiSummary?: string
    hash?: string
    sizeBytes?: number
    backupFilePath?: string
    error?: string
    warning?: string
    metadata?: ProcessingMetadata
}

export interface FileProcessingTaskPayload {
    fileId: string
    originalPath: string
    fileName: string
    appStorageDir: string
    priority: ProcessingPriority
    config: FileProcessingConfig
}

export interface DbQueryTaskPayload {
    sql: string
    params: unknown[]
}

export interface CleanupOrphanedFilesResult {
    scannedCount: number
    removedCount: number
    failedCount: number
}

import type { NormalizedTransaction } from "./Transaction"

export interface EmailProcessingTaskPayload {
    emailId: string
    connectionId: string
    appStorageDir: string
}

export type EmailProcessingWorkerResult = { success: true; transaction: NormalizedTransaction } | { success: false; error?: string }

export interface EmailMetadataTaskPayload {
    connectionId: string
    providerMessageId: string
}

export type EmailMetadataWorkerResult = { skipped: true } | { emailId: string; fromAddr: string; timestamp: number; contentForHash: string }
