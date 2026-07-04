import { readFile, stat, open } from "fs/promises"
import { detect } from "chardet"
import iconvLite from "iconv-lite"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"

// Any non binary file will still fallback to this processor so there is no need to explicitly state the different extensions supported.
export class TextProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".txt"] as const
    private static readonly CHARDET_SAMPLE_SIZE = 32 * 1024 // 32KB is sufficient for encoding detection

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    protected async processFileContent(
        filePath: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _fileId: string
    ): Promise<ProcessingResult> {
        const encoding = await this.detectEncoding(filePath)
        const buffer = await readFile(filePath)
        const text = await this.decodeBuffer(buffer, encoding)
        const result: ProcessingResult = { content: text.trim() }
        return result
    }

    private async detectEncoding(filePath: string): Promise<string> {
        const fileStats = await stat(filePath)
        const sampleSize = Math.min(fileStats.size, TextProcessor.CHARDET_SAMPLE_SIZE)

        if (sampleSize < fileStats.size) {
            const fileHandle = await open(filePath, "r")
            try {
                const sampleBuffer = Buffer.alloc(sampleSize)
                await fileHandle.read(sampleBuffer, 0, sampleSize, 0)
                const detectedEncoding = detect(sampleBuffer)
                return detectedEncoding ?? "utf-8"
            } finally {
                await fileHandle.close()
            }
        } else {
            const buffer = await readFile(filePath)
            const detectedEncoding = detect(buffer)
            return detectedEncoding ?? "utf-8"
        }
    }

    private async decodeBuffer(buffer: Buffer, encoding: string): Promise<string> {
        try {
            return iconvLite.decode(buffer, encoding)
        } catch (error) {
            this.logger.warn(`Failed to decode with ${encoding}, falling back to UTF-8: ${error}`)
            return buffer.toString("utf-8")
        }
    }
}
