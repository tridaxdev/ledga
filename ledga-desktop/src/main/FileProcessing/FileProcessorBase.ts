import { readFile, stat, mkdir, copyFile } from "fs/promises"
import { basename, extname, join } from "path"
import { createHash } from "crypto"
import * as v8 from "v8"
import pLimit, { type LimitFunction } from "p-limit"
import * as mime from "mime-types"
import type { WorkerLogger } from "../logging/WorkerLogger"
import type { ProcessorMetadata, FileStats, BaseFileMetadata, ProcessingInfo, ProcessingResult } from "../../common/types/ProcessorTypes"
import { ProcessorErrorType } from "../../common/types/ProcessorTypes"
import type { FileWorkerResult } from "../../common/types/FileProcessingTypes"
import type { BackgroundWorkerAIService } from "../BackgroundWorker/BackgroundWorkerAIService"
import type { FileProcessingConfig } from "./FileProcessingConfig"
import { FileWorkerResultBuilder } from "./FileWorkerResultBuilder"
import { ProcessorError } from "./ProcessorError"

export abstract class FileProcessorBase {
    protected logger: WorkerLogger
    protected config: FileProcessingConfig
    protected aiService: BackgroundWorkerAIService
    protected startTime: number = 0

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        this.logger = logger
        this.config = config
        this.aiService = aiService
    }

    protected createConcurrencyLimit(memoryPerItemMB: number): LimitFunction {
        // Bound concurrency by the V8 heap ceiling, not system RAM: each worker OOMs at heap_size_limit
        // long before the OS runs out of memory, so the heap is the budget that actually constrains us.
        const heapLimitMB = v8.getHeapStatistics().heap_size_limit / 1024 / 1024
        const concurrency = Math.max(1, Math.floor(heapLimitMB / memoryPerItemMB))
        this.logger.debug(`Concurrency limit: ${concurrency}`)
        return pLimit(concurrency)
    }

    async processFileComplete(id: string, originalPath: string, appStorageDir: string, fileName: string): Promise<FileWorkerResult> {
        this.logger.setContextId(id)
        const builder = new FileWorkerResultBuilder(id)
        try {
            this.logger.debug(`Starting ${this.constructor.name} processing for: ${originalPath}`)
            const storedFilePath = await this.copyAndPrepareFile(originalPath, appStorageDir, fileName)
            builder.setBackupFilePath(storedFilePath)

            const baseMetadata = await this.createBaseMetadata(storedFilePath)
            const processingInfo: ProcessingInfo = {
                processingTime: Date.now() - this.startTime
            }
            const metadata: ProcessorMetadata = {
                ...baseMetadata,
                ...processingInfo
            }
            builder.setMetadata(metadata)

            const { content, warning } = await this.processFileContent(storedFilePath, id)

            const trimmedText = content.trim()
            builder.setExtractedText(content.trim())
            builder.setWarning(warning)

            try {
                const aiSummary = await this.generateAISummary(trimmedText, fileName)
                builder.setAiSummary(aiSummary)
            } catch (error) {
                this.logger.warn(`Failed to generate AI summary for file: ${fileName}`, error)
            }

            builder.setSuccess(true)
            return builder.build()
        } catch (error) {
            const classifiedError = this.classifyError(error as Error)
            builder.setError(classifiedError)
            builder.setSuccess(false)
            return builder.build()
        } finally {
            this.logger.clearContextId()
        }
    }

    // Abstract method that child processors must implement to handle the actual file content processing
    protected abstract processFileContent(filePath: string, fileId: string): Promise<ProcessingResult>

    protected async generateAISummary(extractedText: string, fileName: string): Promise<string | undefined> {
        const maxCharacters = 10000
        const textToSummarize = extractedText.length > maxCharacters ? `${extractedText.substring(0, maxCharacters)}...` : extractedText

        try {
            const response = await this.aiService.requestAI({
                requestId: `summary-${Date.now()}`,
                modelTier: "simple",
                operation: "summarize",
                data: {
                    fileName,
                    textToSummarize,
                    timeout: this.config.common.aiRequestTimeout
                }
            })

            const stringResult = response.result as string

            if (stringResult) {
                return stringResult.trim()
            }

            this.logger.warn(`AI service returned no text for summary generation`)
            return undefined
        } catch (error) {
            this.logger.error(`Error generating AI summary:`, error)
            return undefined
        }
    }

    protected async copyAndPrepareFile(originalPath: string, appStorageDir: string, fileName: string): Promise<string> {
        const fileHash = createHash("md5")
            .update(originalPath + Date.now())
            .digest("hex")
        const extension = extname(fileName)
        const storedFileName = `${fileHash}${extension}`
        const storedFilePath = join(appStorageDir, storedFileName)

        await mkdir(appStorageDir, { recursive: true })
        await copyFile(originalPath, storedFilePath)

        this.logger.debug(`File copied to storage: ${originalPath} -> ${storedFilePath}`)

        return storedFilePath
    }

    protected async calculateFileHash(filePath: string): Promise<string> {
        const buffer = await readFile(filePath)
        return createHash("sha1").update(buffer).digest("hex")
    }

    protected async getFileStats(filePath: string): Promise<FileStats> {
        const stats = await stat(filePath)
        return {
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime
        }
    }

    protected async createBaseMetadata(filePath: string): Promise<BaseFileMetadata> {
        const [hash, stats] = await Promise.all([this.calculateFileHash(filePath), this.getFileStats(filePath)])

        const filename = basename(filePath)
        const extension = extname(filePath).toLowerCase().slice(1)
        const mimeType = mime.lookup(filePath) || "application/octet-stream"

        return {
            filename,
            extension,
            size: stats.size,
            hash,
            created: stats.created,
            modified: stats.modified,
            mimeType
        }
    }

    protected classifyError(error: Error, hint?: ProcessorErrorType): ProcessorError {
        if (error instanceof ProcessorError) {
            return error
        }

        if (hint) {
            return new ProcessorError(this.getUserFriendlyMessage(hint), hint, error)
        }

        const message = error.message.toLowerCase()
        const stack = error.stack?.toLowerCase() || ""
        const errorWithCode = error as NodeJS.ErrnoException

        // Check for bad archive errors (MSG files)
        if (message.includes("bad archive") || message.includes("archive type")) {
            return new ProcessorError(this.getCorruptionMessage(error), ProcessorErrorType.CORRUPT_FILE, error)
        }

        // Check for PDF-specific corruption errors
        if (
            message.includes("file not in pdf format") ||
            message.includes("not a pdf") ||
            message.includes("pdf format") ||
            message.includes("pdfium") ||
            (message.includes("corrupted") && message.includes("pdf"))
        ) {
            return new ProcessorError(this.getCorruptionMessage(error) || "PDF file is broken or corrupted", ProcessorErrorType.CORRUPT_FILE, error)
        }

        // Check for AI service image validation errors
        if (
            message.includes("provided image is not valid") ||
            message.includes("image is not valid") ||
            message.includes("invalid image") ||
            message.includes("image not supported") ||
            message.includes("unsupported image format")
        ) {
            return new ProcessorError(this.getCorruptionMessage(error) || "Image file is broken or corrupted", ProcessorErrorType.CORRUPT_FILE, error)
        }

        // Check for empty content scenarios (not necessarily errors)
        if (message.includes("no meaningful text content extracted") || message.includes("no text content found") || message.includes("0 characters")) {
            return new ProcessorError("No text content could be extracted from this file", ProcessorErrorType.UNKNOWN_ERROR, error)
        }

        // Check for corrupt file indicators
        if (message.includes("corrupt") || message.includes("invalid") || message.includes("malformed") || message.includes("damaged")) {
            return new ProcessorError(this.getCorruptionMessage(error), ProcessorErrorType.CORRUPT_FILE, error)
        }

        // Timeout errors
        if (message.includes("timeout") || message.includes("timed out")) {
            return new ProcessorError("Processing took too long and was stopped", ProcessorErrorType.TIMEOUT_ERROR, error)
        }

        // Memory errors
        if (message.includes("memory") || message.includes("heap") || message.includes("allocation") || stack.includes("rangerrror")) {
            return new ProcessorError("File is too large to process", ProcessorErrorType.MEMORY_ERROR, error)
        }

        // Permission errors
        if (message.includes("permission") || message.includes("access") || message.includes("eacces") || message.includes("eperm")) {
            return new ProcessorError("Permission denied to access file", ProcessorErrorType.PERMISSION_ERROR, error)
        }

        // File not found
        const fileNotFoundCodes = new Set(["ENOENT", "ENOTFOUND"])
        const fileNotFoundPhrases = [
            "enoent",
            "no such file",
            "no such directory",
            "the system cannot find the file",
            "the system cannot find the path",
            "file not found",
            "cannot find the file",
            "could not find the file"
        ]

        const errorCode = typeof errorWithCode?.code === "string" ? errorWithCode.code.toUpperCase() : undefined

        if ((errorCode && fileNotFoundCodes.has(errorCode)) || fileNotFoundPhrases.some(phrase => message.includes(phrase))) {
            return new ProcessorError("File not found or has been moved", ProcessorErrorType.FILE_NOT_FOUND, error)
        }

        // Password protected
        if (message.includes("password") || message.includes("encrypted") || message.includes("protected")) {
            return new ProcessorError("File is password protected or encrypted", ProcessorErrorType.PASSWORD_PROTECTED, error)
        }

        // Dependency errors
        if (message.includes("module not found") || message.includes("cannot find module") || message.includes("dependency")) {
            return new ProcessorError("Required processing component is missing", ProcessorErrorType.DEPENDENCY_ERROR, error)
        }

        // Format errors
        if (message.includes("unsupported") || message.includes("unknown format") || message.includes("not recognized")) {
            return new ProcessorError(this.getUserFriendlyMessage(ProcessorErrorType.UNSUPPORTED_FORMAT), ProcessorErrorType.UNSUPPORTED_FORMAT, error)
        }

        return new ProcessorError("An unexpected error occurred while processing the file", ProcessorErrorType.UNKNOWN_ERROR, error)
    }

    protected getUserFriendlyMessage(errorType: ProcessorErrorType): string {
        switch (errorType) {
            case ProcessorErrorType.CORRUPT_FILE:
                return "File is broken or corrupted"
            case ProcessorErrorType.TIMEOUT_ERROR:
                return "Processing took too long and was stopped"
            case ProcessorErrorType.MEMORY_ERROR:
                return "File is too large to process"
            case ProcessorErrorType.DURATION_LIMIT:
                return "Audio file exceeds the maximum supported duration"
            case ProcessorErrorType.PERMISSION_ERROR:
                return "Permission denied to access file"
            case ProcessorErrorType.FILE_NOT_FOUND:
                return "File not found or has been moved"
            case ProcessorErrorType.PASSWORD_PROTECTED:
                return "File is password protected or encrypted"
            case ProcessorErrorType.DEPENDENCY_ERROR:
                return "Required processing component is missing"
            case ProcessorErrorType.UNSUPPORTED_FORMAT:
                return "This file type is not supported"
            case ProcessorErrorType.WORKER_CRASH:
                return "Processing was interrupted due to a system error"
            default:
                return "An unexpected error occurred while processing the file"
        }
    }

    protected getCorruptionMessage(detailSource?: Error | string): string {
        const detail = typeof detailSource === "string" ? detailSource : detailSource?.message || ""
        const normalized = detail.toLowerCase()

        if (!normalized) {
            return "File is broken or corrupted"
        }

        const matchesAny = (phrases: string[]) => phrases.some(phrase => normalized.includes(phrase))

        if (matchesAny(["end of central directory", "file is truncated", "truncated archive"])) {
            return "File is incomplete or truncated"
        }

        if (matchesAny(["not a zip file", "zip file is empty", "invalid zip file", "central directory record signature not found"])) {
            return "The file format is invalid"
        }

        if (normalized.includes("file format is invalid")) {
            return "The file format is invalid"
        }

        if (matchesAny(["invalid file signature", "bad signature", "signature not found", "invalid header", "header error"])) {
            return "File signature is invalid"
        }

        const xmlIndicators = ["word/document.xml", "[content_types].xml", "relationships.rels"]
        const missingIndicators = ["not found", "missing", "unable to read", "could not read"]
        if (xmlIndicators.some(name => normalized.includes(name)) && matchesAny(missingIndicators)) {
            return "File contents are corrupted"
        }

        return "File is broken or corrupted"
    }
}
