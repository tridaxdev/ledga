import { readFile } from "fs/promises"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"

export class HtmlProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".html", ".htm"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    protected async processFileContent(
        filePath: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _fileId: string
    ): Promise<ProcessingResult> {
        const buffer = await readFile(filePath)
        const htmlContent = buffer.toString("utf8")

        const textContent = htmlContent
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()

        return { content: textContent }
    }
}
