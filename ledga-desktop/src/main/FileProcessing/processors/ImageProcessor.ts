import { readFile } from "fs/promises"
import * as mime from "mime-types"
import { z } from "zod"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { AIRequest } from "../../../common/types/FileProcessingTypes"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"

export class ImageProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    protected async processFileContent(filePath: string, fileId: string): Promise<ProcessingResult> {
        if (!this.config.image.enableOCR) {
            this.logger.info("Image OCR disabled in configuration, generating image description instead")
            return { content: await this.generateImageDescription(filePath, fileId) }
        }

        this.logger.info(`Starting OCR extraction for image: ${filePath}`)

        try {
            const imageBuffer = await readFile(filePath)
            const mimeType = this.getMimeType(filePath)

            const requestId = `image_ocr_${fileId}_${Date.now()}`
            const request: AIRequest = {
                requestId,
                modelTier: "simple",
                operation: "extractText",
                data: {
                    imageBuffer: new Uint8Array(imageBuffer),
                    mimeType,
                    timeout: this.config.common.aiRequestTimeout
                }
            }

            const result = await this.aiService.requestAI(request)

            const parseResult = z.string().parse(result.result)
            const stringResult = parseResult

            this.logger.info(`OCR extraction completed: ${stringResult.length || 0} characters extracted`)

            if (!stringResult || stringResult.trim().length === 0) {
                this.logger.info("No text found via OCR, attempting image description")
                return { content: await this.generateImageDescription(filePath, fileId) }
            }

            return { content: stringResult || "No text could be extracted from this image" }
        } catch (error) {
            this.logger.warn("OCR failed, attempting image description as fallback:", error)
            try {
                return { content: await this.generateImageDescription(filePath, fileId) }
            } catch (descriptionError) {
                this.logger.error("Both OCR and image description failed:", descriptionError)
                throw error
            }
        }
    }

    private async generateImageDescription(filePath: string, fileId: string): Promise<string> {
        this.logger.info(`Generating image description for: ${filePath}`)

        const imageBuffer = await readFile(filePath)
        const mimeType = this.getMimeType(filePath)

        const requestId = `image_desc_${fileId}_${Date.now()}`
        const request: AIRequest = {
            requestId,
            modelTier: "simple",
            operation: "describeImage",
            data: {
                imageBuffer: new Uint8Array(imageBuffer),
                mimeType,
                timeout: this.config.common.aiRequestTimeout
            }
        }

        const result = await this.aiService.requestAI(request)

        const parseResult = z.string().parse(result.result)
        const stringResult = parseResult
        this.logger.info(`Image description completed: ${stringResult.length || 0} characters generated`)

        return stringResult || "No description could be generated for this image"
    }

    private getMimeType(filePath: string): string {
        return mime.lookup(filePath) || "*"
    }
}
