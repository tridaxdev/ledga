import { randomUUID } from "crypto"
import { parseOffice, type OfficeParserAST, type OfficeParserConfig, type DocImage } from "officeparser"
import { z } from "zod"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"
import type { AIRequest } from "../../../common/types/FileProcessingTypes"
import { ProcessorError } from "../ProcessorError"
import { ProcessorErrorType } from "../../../common/types/ProcessorTypes"

export class DocumentProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".doc", ".docx", ".xls", ".xlsx", ".pptx", ".odt", ".odp", ".ods"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    protected async processFileContent(filePath: string, _fileId: string): Promise<ProcessingResult> {
        const { blocks, fullText } = await this.extractText(filePath)
        const result: ProcessingResult = { content: `${fullText?.trim() ?? ""}\n\n` }

        if (blocks) {
            await Promise.allSettled(
                blocks.map(async block => {
                    if (block.type === "image" && "buffer" in block && "mimeType" in block && block.buffer instanceof Buffer) {
                        const img = block as { type: "image"; buffer: Buffer; mimeType: string; filename?: string }
                        if (img.buffer?.length) {
                            const { imageContent, imageExtractionErrors } = await this.processImages([{ buffer: img.buffer, mimeType: img.mimeType, filename: img.filename }])
                            if (imageExtractionErrors.length > 0) {
                                result.warning = `${imageExtractionErrors.length} image(s) could not be extracted due to errors.\n\nText content extracted successfully.`
                            }
                            if (imageContent && imageContent.length > 0) {
                                result.content += `\n\n${imageContent}`
                            }
                        }
                    }
                    if (block.type === "table") {
                        const tableData = block.rows?.map(row => row?.cols?.map(cell => cell.value?.trim() || "").join(" | ")).join("\n") || ""

                        result.content += `\n\n--- Extracted Table ---\n Please Use this information to create a mental image of the actual table that existed in the document. Do not make any mention of JSON in your response.  ${tableData}`
                    }

                    if (block.type === "chart") {
                        const chartContent = `${block.chartType} chart. Use this information to create a mental image of the actual chart. Data: ${JSON.stringify(block.chartData)}. Position: ${JSON.stringify(block.position)}.`
                        result.content += `\n\n<chart>${chartContent}</chart>`
                    }
                })
            )
        }
        return result
    }

    private async extractText(filePath: string): Promise<OfficeParserAST> {
        const config: OfficeParserConfig & { extractCharts?: boolean } = {
            newlineDelimiter: "\n",
            ignoreNotes: false,
            putNotesAtLast: false,
            extractAttachments: true,
            extractCharts: true
        }

        try {
            const data = await parseOffice(filePath, config)
            return data
        } catch (error) {
            throw this.mapOfficeParserError(error)
        }
    }

    private mapOfficeParserError(error: unknown): Error {
        if (error instanceof ProcessorError) {
            return error
        }

        if (error instanceof Error) {
            const message = error.message.toLowerCase()

            const corruptIndicators = [
                "end of central directory",
                "central directory record",
                "invalid zip",
                "not a zip file",
                "zip file is empty",
                "entry not found",
                "invalid file signature",
                "unknown format"
            ]

            const xmlIndicators = ["word/document.xml", "[content_types].xml", "relationships.rels"]
            const missingIndicators = ["not found", "missing", "unable to read", "could not read"]

            if (
                corruptIndicators.some(indicator => message.includes(indicator)) ||
                (xmlIndicators.some(indicator => message.includes(indicator)) && missingIndicators.some(indicator => message.includes(indicator)))
            ) {
                return new ProcessorError(this.getCorruptionMessage(error), ProcessorErrorType.CORRUPT_FILE, error)
            }

            const unsupportedIndicators = ["unsupported file", "unsupported format", "unsupported extension"]
            if (unsupportedIndicators.some(indicator => message.includes(indicator))) {
                return new ProcessorError(this.getUserFriendlyMessage(ProcessorErrorType.UNSUPPORTED_FORMAT), ProcessorErrorType.UNSUPPORTED_FORMAT, error)
            }
        }

        return error instanceof Error ? error : new Error(String(error))
    }

    private async processImages(images: DocImage[]): Promise<{ imageContent: string; imageExtractionErrors: string[] }> {
        if (!Array.isArray(images) || images.length === 0) {
            return { imageContent: "", imageExtractionErrors: [] }
        }

        const imageExtractionErrors: string[] = []

        const imageContents: string[] = []

        for (let i = 0; i < images.length; i++) {
            const image = images[i]
            try {
                const content = await this.analyzeImage(image, i)
                if (content) {
                    imageContents.push(`<image>${content.trim()}</image>`)
                }
            } catch (error) {
                const errorMsg = `Error processing image ${image.filename ?? `image_${i}`}: ${error instanceof Error ? error.message : "Unknown error"}`
                this.logger.error(errorMsg)
                imageExtractionErrors.push(errorMsg)
            }
        }

        return {
            imageContent: imageContents.join("\n"),
            imageExtractionErrors: imageExtractionErrors
        }
    }

    private async analyzeImage(image: DocImage, index: number): Promise<string> {
        if (!image?.buffer?.length) {
            throw new Error(`Image at index ${index} has no buffer`)
        }
        const requestId = `doc_image_ocr_${randomUUID()}_${index}`
        const request: AIRequest = {
            requestId,
            modelTier: "simple",
            operation: "extractText",
            data: {
                imageBuffer: new Uint8Array(image.buffer),
                mimeType: image.mimeType ?? "image/png",
                timeout: this.config.common.aiRequestTimeout
            }
        }

        const result = await this.aiService.requestAI(request)

        const parseResult = z.string().parse(result.result)
        const stringResult = parseResult
        return stringResult ? `\n${stringResult}\n` : ""
    }
}
