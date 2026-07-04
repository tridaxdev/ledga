import { basename } from "path"
import type { FileWorkerResult } from "../../common/types/FileProcessingTypes"
import type { ProcessorResult, ProcessorMetadata } from "../../common/types/ProcessorTypes"
import { ProcessorErrorType } from "../../common/types/ProcessorTypes"
import type { StructuredData } from "../../common/types/ProjectTypes"
import { ProcessorError } from "./ProcessorError"

export class FileWorkerResultBuilder {
    private result: FileWorkerResult

    constructor(fileId: string) {
        this.result = {
            type: "RESULT",
            success: false,
            fileId
        }
    }

    setSuccess(success: boolean): this {
        this.result.success = success
        return this
    }

    setError(error: ProcessorError): this {
        this.result.error = error instanceof Error ? error.message : String(error)
        this.result.success = false
        return this
    }

    setWarning(warning: string | undefined): this {
        this.result.warning = warning
        return this
    }

    setBackupFilePath(path: string | undefined): this {
        if (path) {
            this.result.backupFilePath = path
        }
        return this
    }

    setExtractedText(text: string | undefined): this {
        if (text !== undefined) {
            this.result.extractedText = text
        }
        return this
    }

    setAiSummary(summary: string | undefined): this {
        if (summary !== undefined) {
            this.result.aiSummary = summary
        }
        return this
    }

    setHash(hash: string | undefined): this {
        if (hash) {
            this.result.hash = hash
        }
        return this
    }

    setSizeBytes(size: number | undefined): this {
        if (size !== undefined) {
            this.result.sizeBytes = size
        }
        return this
    }

    setMetadata(metadata: Partial<ProcessorMetadata> | undefined): this {
        if (metadata) {
            this.result.metadata = {
                filename: metadata.filename || basename(this.result.backupFilePath || ""),
                extension: metadata.extension || "",
                size: metadata.size || 0,
                hash: metadata.hash || "",
                created: metadata.created?.toISOString() || new Date().toISOString(),
                modified: metadata.modified?.toISOString() || new Date().toISOString(),
                mimeType: metadata.mimeType || "application/octet-stream",
                processingTime: metadata.processingTime || 0
            }

            // Also set top-level fields if available
            if (metadata.hash) {
                this.setHash(metadata.hash)
            }
            if (metadata.size !== undefined) {
                this.setSizeBytes(metadata.size)
            }
        }
        return this
    }

    setFromProcessorResult(result: ProcessorResult): this {
        this.setSuccess(true)
        this.setExtractedText(result.text)
        this.setMetadata(result.metadata)

        if (result.error) {
            this.setError(new ProcessorError(result.error, result.errorType || ProcessorErrorType.UNKNOWN_ERROR))
        }

        return this
    }

    setStructuredData(data: StructuredData): this {
        this.result.structuredData = data
        return this
    }

    build(): FileWorkerResult {
        return this.result
    }
}
