import { readFile } from "fs/promises"
import { simpleParser, type ParsedMail } from "mailparser"
import { detect } from "chardet"
import iconvLite from "iconv-lite"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"

export class EmailProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".eml", ".mbox"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    protected async processFileContent(
        filePath: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _fileId: string
    ): Promise<ProcessingResult> {
        const emailContent = await this.readEmailWithEncoding(filePath)
        const parsed = await this.parseEmail(emailContent)
        const emailText = [parsed.subject, parsed.text].filter(Boolean).join("\n\n")

        const result: ProcessingResult = { content: emailText.trim() }

        if (parsed.attachments && parsed.attachments.length > 0) {
            const attachmentCount = parsed.attachments.length
            const attachmentNames = parsed.attachments.map(att => att.filename || "unnamed").join(", ")
            result.warning = `${attachmentCount} attachment(s) not extracted: ${attachmentNames}.\n\nOnly email text content was processed.`
        }

        return result
    }

    private async readEmailWithEncoding(filePath: string): Promise<string> {
        const buffer = await readFile(filePath)

        const detectedEncoding = detect(buffer)
        const encoding = detectedEncoding || "utf-8"

        try {
            return iconvLite.decode(buffer, encoding)
        } catch (error) {
            this.logger.warn(`Failed to decode with ${encoding}, falling back to UTF-8: ${error}`)
            return buffer.toString("utf-8")
        }
    }

    private async parseEmail(content: string): Promise<ParsedMail> {
        return simpleParser(content)
    }
}
