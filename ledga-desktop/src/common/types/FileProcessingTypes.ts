export { ProcessingPriority } from "./WorkerTypes"
import type { NormalizedTransaction } from "./Transaction"

export interface EmailProcessingTaskPayload {
    emailId: string
    connectionId: string
    appStorageDir: string
}

export type EmailProcessingWorkerResult =
    | { success: true; transaction: NormalizedTransaction }
    | { success: false; error?: string }

export interface EmailMetadataTaskPayload {
    connectionId: string
    providerMessageId: string
}

export type EmailMetadataWorkerResult =
    | { skipped: true }
    | { emailId: string; fromAddr: string; timestamp: number; contentForHash: string }
