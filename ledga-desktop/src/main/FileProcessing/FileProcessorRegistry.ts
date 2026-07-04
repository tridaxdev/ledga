import { isBinaryFile } from "isbinaryfile"
import type { BackgroundWorkerAIService } from "../BackgroundWorker/BackgroundWorkerAIService"
import type { WorkerLogger } from "../logging/WorkerLogger"
import { PdfProcessor } from "./processors/PdfProcessor"
import { DocumentProcessor } from "./processors/DocumentProcessor"
import { EmailProcessor } from "./processors/EmailProcessor"
import { MsgProcessor } from "./processors/MsgProcessor"
import { TextProcessor } from "./processors/TextProcessor"
import { HtmlProcessor } from "./processors/HtmlProcessor"
import { ImageProcessor } from "./processors/ImageProcessor"
import { AudioProcessor } from "./processors/AudioProcessor"
import type { FileProcessorBase } from "./FileProcessorBase"
import type { FileProcessingConfig } from "./FileProcessingConfig"

type ProcessorClass = {
    supportedExtensions: readonly string[]
    name: string
}

enum ProcessorName {
    PdfProcessor = "PdfProcessor",
    DocumentProcessor = "DocumentProcessor",
    EmailProcessor = "EmailProcessor",
    MsgProcessor = "MsgProcessor",
    TextProcessor = "TextProcessor",
    HtmlProcessor = "HtmlProcessor",
    ImageProcessor = "ImageProcessor",
    AudioProcessor = "AudioProcessor"
}

const PROCESSORS: ProcessorClass[] = [
    { supportedExtensions: PdfProcessor.supportedExtensions, name: ProcessorName.PdfProcessor },
    { supportedExtensions: DocumentProcessor.supportedExtensions, name: ProcessorName.DocumentProcessor },
    { supportedExtensions: EmailProcessor.supportedExtensions, name: ProcessorName.EmailProcessor },
    { supportedExtensions: MsgProcessor.supportedExtensions, name: ProcessorName.MsgProcessor },
    { supportedExtensions: TextProcessor.supportedExtensions, name: ProcessorName.TextProcessor },
    { supportedExtensions: HtmlProcessor.supportedExtensions, name: ProcessorName.HtmlProcessor },
    { supportedExtensions: ImageProcessor.supportedExtensions, name: ProcessorName.ImageProcessor },
    { supportedExtensions: AudioProcessor.supportedExtensions, name: ProcessorName.AudioProcessor }
]

export class FileProcessorRegistry {
    private static extensionToProcessor = new Map<string, string>()

    static {
        for (const processor of PROCESSORS) {
            for (const extension of processor.supportedExtensions) {
                this.extensionToProcessor.set(extension.toLowerCase(), processor.name)
            }
        }
    }

    static async validateProcessor(filePath: string): Promise<ProcessorName | undefined> {
        const isBinary = await isBinaryFile(filePath)
        const fileName = filePath.split(/[\\/]/).pop() || filePath
        const lastDotIndex = fileName.lastIndexOf(".")
        const extensionFromPath = lastDotIndex >= 0 ? fileName.substring(lastDotIndex).toLowerCase() : ""
        const processorName = this.getProcessorName(extensionFromPath)
        if (!processorName) {
            if (isBinary) return undefined
            else return ProcessorName.TextProcessor
        }
        return processorName
    }

    static getProcessorName(extension: string): ProcessorName | undefined {
        return this.extensionToProcessor.get(extension.toLowerCase()) as ProcessorName
    }

    static getSupportedExtensions(): string[] {
        return Array.from(this.extensionToProcessor.keys())
    }

    static async createProcessor(filePath: string, logger: WorkerLogger, config: FileProcessingConfig, workerAIService: BackgroundWorkerAIService): Promise<FileProcessorBase> {
        const processorName = await FileProcessorRegistry.validateProcessor(filePath)
        if (!processorName) {
            throw new Error(`Unsupported file: ${filePath}`)
        }

        switch (processorName) {
            case ProcessorName.PdfProcessor:
                return new PdfProcessor(logger, config, workerAIService)
            case ProcessorName.DocumentProcessor:
                return new DocumentProcessor(logger, config, workerAIService)
            case ProcessorName.EmailProcessor:
                return new EmailProcessor(logger, config, workerAIService)
            case ProcessorName.MsgProcessor:
                return new MsgProcessor(logger, config, workerAIService)
            case ProcessorName.HtmlProcessor:
                return new HtmlProcessor(logger, config, workerAIService)
            case ProcessorName.ImageProcessor:
                return new ImageProcessor(logger, config, workerAIService)
            case ProcessorName.TextProcessor:
                return new TextProcessor(logger, config, workerAIService)
            case ProcessorName.AudioProcessor:
                return new AudioProcessor(logger, config, workerAIService)
            default:
                throw new Error(`Unknown processor: ${processorName}`)
        }
    }
}
