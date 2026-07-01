export interface FileProcessingConfig {
    // Common configuration for all processors
    common: {
        timeout: number // Processing timeout in milliseconds
        aiRequestTimeout: number // Timeout for AI service requests in milliseconds
    }

    // Document processor configuration (Office files)
    document: {
        preserveFormatting: boolean // Currently always false based on legacy
        extractMetadata: boolean
    }

    // Email processor configuration
    email: {
        extractAttachments: boolean
        parseHeaders: boolean
    }

    // Image processor configuration
    image: {
        enableOCR: boolean
    }
}

export const defaultFileProcessorConfig: FileProcessingConfig = {
    common: {
        timeout: 60 * 60 * 1000, // 60 minutes
        aiRequestTimeout: 30000 // 30 seconds for AI requests
    },
    document: {
        preserveFormatting: false,
        extractMetadata: true
    },
    email: {
        extractAttachments: true,
        parseHeaders: true
    },
    image: {
        enableOCR: true
    }
}
