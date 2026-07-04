import { readFile } from "fs/promises"
import MsgReaderOrExports from "@kenjiuno/msgreader"
import { FileProcessorBase } from "../FileProcessorBase"
import type { FileProcessingConfig } from "../FileProcessingConfig"
import type { WorkerLogger } from "../../logging/WorkerLogger"
import type { BackgroundWorkerAIService } from "../../BackgroundWorker/BackgroundWorkerAIService"
import type { ProcessingResult } from "../../../common/types/ProcessorTypes"

/***
Hello, Simon here. I know, it is not satisfying, but the  MsgReader line below has to be written exactly
this way, as otherwise it does not work. Without the or, it does not compile. With require() it works in npm run dev,
but not in the tests. And with the default import "import MsgReader from '@kenjiuno/msgreader'" it does not work at all
After searching around I found this issue from 6 years ago (https://github.com/HiraokaHyperTools/msgreader/issues/5#issuecomment-637181711), where the library owner showed this syntax, I copied it and it works now.
If you understand why, please tell me so I can learn from it :) If you don't, don't bother changing it, as quite sure I tried all the options.
***/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MsgReader = (MsgReaderOrExports as any).default || MsgReaderOrExports

export class MsgProcessor extends FileProcessorBase {
    static readonly supportedExtensions = [".msg"] as const

    constructor(logger: WorkerLogger, config: FileProcessingConfig, aiService: BackgroundWorkerAIService) {
        super(logger, config, aiService)
    }

    private convertHtmlToPlainText(htmlString: string): string {
        let cleaned = htmlString.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")

        cleaned = cleaned.replace(/<[^>]*>/g, " ")

        cleaned = cleaned.replace(/&nbsp;/g, " ")
        cleaned = cleaned.replace(/&amp;/g, "&")
        cleaned = cleaned.replace(/&lt;/g, "<")
        cleaned = cleaned.replace(/&gt;/g, ">")
        cleaned = cleaned.replace(/&quot;/g, '"')
        cleaned = cleaned.replace(/&#39;/g, "'")

        cleaned = cleaned.replace(/\s+/g, " ").trim()

        return cleaned
    }

    protected async processFileContent(
        filePath: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _fileId: string
    ): Promise<ProcessingResult> {
        try {
            const msgFileBuffer = await readFile(filePath)
            const msgReader = new MsgReader(msgFileBuffer)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileData: any = msgReader.getFileData()
            if (!fileData) {
                throw new Error("MSG file parsing returned no data")
            }
            if (fileData.error) {
                const errorDetails = typeof fileData.error === "object" ? JSON.stringify(fileData.error) : String(fileData.error)
                throw new Error(`MSG file processing failed: ${errorDetails}`)
            }

            // Extract body content - prioritize plain text, fall back to HTML
            // We expect that text and html content of an email have the same information, but text is more dense
            // HTML costs us more tokens, hence we prefer text when available
            let bodyContent = fileData.body

            if (!bodyContent && fileData.html) {
                const htmlBytes = fileData.html
                const htmlString = new TextDecoder("utf-8").decode(htmlBytes)
                bodyContent = this.convertHtmlToPlainText(htmlString)
            }

            const msgText = [fileData.subject, bodyContent].filter(Boolean).join("\n\n")
            const result: ProcessingResult = { content: msgText.trim() }

            if (fileData.attachments?.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const attachmentNames = fileData.attachments.map((att: any) => att.fileName || att.fileNameShort || "unnamed").join(", ")
                result.warning = `${fileData.attachments.length} attachment(s) not extracted: ${attachmentNames}.\n\nOnly message text content was processed.`
            }

            return result
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error(`[MsgProcessor] Failed to process MSG file ${filePath}: ${errorMessage}`)
            if (error instanceof Error && error.stack) {
                this.logger.error(`[MsgProcessor] Stack trace: ${error.stack}`)
            }
            throw error
        }
    }
}
