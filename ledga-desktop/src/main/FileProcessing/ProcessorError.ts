import type { ProcessorErrorType } from "../../common/types/ProcessorTypes"

export class ProcessorError extends Error {
    public readonly errorType: ProcessorErrorType

    constructor(message: string, errorType: ProcessorErrorType, detailSource?: Error | string) {
        super(ProcessorError.formatMessage(message, detailSource))
        this.name = "ProcessorError"
        this.errorType = errorType
    }

    private static formatMessage(baseMessage: string, detailSource?: Error | string): string {
        if (!detailSource) {
            return baseMessage
        }

        const detail = typeof detailSource === "string" ? detailSource : detailSource.message
        if (!detail) {
            return baseMessage
        }

        const normalizedBase = baseMessage.trim().toLowerCase()
        const normalizedDetail = detail.trim().toLowerCase()

        if (!normalizedDetail || normalizedBase === normalizedDetail) {
            return baseMessage
        }

        return `${baseMessage}. Details: ${detail}`
    }
}
