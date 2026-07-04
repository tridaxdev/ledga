import type { Alert } from "@/renderer/AlertFeature/types/Alert"
import type { AppInstallation, UpdateCheckResult, UpdateProgressCallback } from "./AppTypes"
import type { Result } from "./Result"
import type { Connection } from "./Connection"
import type { Transaction, TransactionQueryParams, TransactionSummary } from "./Transaction"
import type { Category } from "./Category"
import type { Conversation, ConversationCreatedEvent, ConversationDeletedEvent, ConversationReferencesUpdatedEvent, ConversationStreamEvent, ConversationUpdatedEvent, ConversationWithMessages, CreateConversationRequest, CreateMessageRequest, DeleteConversationRequest, EditUserMessageRequest, GetConversationRequest, GetConversationsByProjectRequest, Message, RetryFromMessageRequest, StopConversationStreamRequest, ToolApprovalDecision, UpdateConversationRequest } from "./BaseTypes"
import type { GetFileRequest, GetFilesByFolderRequest, GetFilesByProjectRequest, GetFilesByConversationRequest, ImportFilesRequest, RetryImportRequest, OpenFileRequest, RetryFileProcessingRequest, DeleteAssetsRequest } from "./FileImportTypes"
import type { PyleHoundAsset, PyleHoundFile, AssetUpsertedEvent, AssetDeletedEvent } from "./ProjectTypes"

export interface DatabaseStats {
    size: string
    records: number
    lastBackup: string
    status: "healthy" | "error"
}

export interface LedgaAPI {
    readonly conversations: {
        readonly getAll: () => Promise<Result<Conversation[], Error>>

        readonly getByProject: (request: GetConversationsByProjectRequest) => Promise<Result<Conversation[], Error>>

        readonly getById: (request: GetConversationRequest) => Promise<Result<ConversationWithMessages, Error>>

        readonly create: (request: CreateConversationRequest) => Promise<Result<Conversation, Error>>

        readonly update: (request: UpdateConversationRequest) => Promise<Result<Conversation, Error>>

        readonly delete: (request: DeleteConversationRequest) => Promise<Result<void, Error>>

        readonly sendMessage: (request: CreateMessageRequest) => Promise<Result<{ userMessage: Message; assistantMessageId: string }, Error>>

        readonly addMessage: (request: CreateMessageRequest) => Promise<Result<Message, Error>>

        readonly retryFromMessage: (request: RetryFromMessageRequest) => Promise<Result<void, Error>>

        readonly editUserMessage: (request: EditUserMessageRequest) => Promise<Result<{ userMessage: Message; assistantMessageId: string }, Error>>

        readonly markAsRead: (conversationId: string) => Promise<Result<void, Error>>

        readonly stopStreaming: (request: StopConversationStreamRequest) => Promise<Result<void, Error>>

        readonly onChatStreamChunk: (callback: (event: ConversationStreamEvent) => void) => void

        readonly onConversationUpdated: (callback: (event: ConversationUpdatedEvent) => void) => void
        readonly onConversationDeleted: (callback: (event: ConversationDeletedEvent) => void) => void
        readonly onConversationCreated: (callback: (event: ConversationCreatedEvent) => void) => void
        readonly onReferencesUpdated: (callback: (event: ConversationReferencesUpdatedEvent) => void) => () => void
        readonly respondToToolApproval: (request: ToolApprovalDecision) => Promise<Result<void, Error>>
    }
    readonly assets: {
        readonly getById: (request: GetFileRequest) => Promise<Result<PyleHoundAsset, Error>>
        readonly getByFolder: (request: GetFilesByFolderRequest) => Promise<Result<PyleHoundAsset[], Error>>
        readonly getByProject: (request: GetFilesByProjectRequest) => Promise<Result<PyleHoundAsset[], Error>>
        readonly getFilesByConversation: (request: GetFilesByConversationRequest) => Promise<Result<PyleHoundFile[], Error>>
        readonly importFiles: (request: ImportFilesRequest) => Promise<Result<PyleHoundAsset[], Error>>
        readonly importFilesRetryFailed: (request: RetryImportRequest) => Promise<Result<void, Error>>
        readonly getSupportedFileTypes: () => Promise<Result<string[], Error>>
        readonly getFilePath: (file: File) => string
        readonly openBackupFile: (request: OpenFileRequest) => Promise<Result<void, Error>>
        readonly retryProcessing: (request: RetryFileProcessingRequest) => Promise<Result<void, Error>>
        readonly deleteAssets: (request: DeleteAssetsRequest) => Promise<Result<number, Error>>
        readonly onAssetCreated: (callback: (event: AssetUpsertedEvent) => void) => () => void
        readonly onAssetUpdated: (callback: (event: AssetUpsertedEvent) => void) => () => void
        readonly onAssetDeleted: (callback: (event: AssetDeletedEvent) => void) => () => void
    }
    readonly app: {
        readonly checkForUpdates: (silent: boolean) => Promise<UpdateCheckResult>
        readonly onUpdateProgress: (callback: UpdateProgressCallback) => () => void
        readonly getInstallation: () => Promise<AppInstallation>
        readonly getLanguage: () => Promise<string>
        readonly setLanguage: (language: string) => Promise<boolean>
        readonly onLanguageChanged: (callback: (language: string) => void) => () => void
        readonly onShowAlert: (callback: (event: Alert) => void) => () => void
    }
    readonly connections: {
        readonly getAll: () => Promise<Result<Connection[], Error>>
        readonly startOAuth: () => Promise<Result<{ flowId: string; email: string }, Error>>
        readonly cancelOAuth: (flowId?: string) => Promise<Result<void, Error>>
        readonly finalize: (flowId: string, autoSync: boolean) => Promise<Result<Connection, Error>>
        readonly disconnect: (id: string) => Promise<Result<void, Error>>
        readonly onOAuthCompleted: (callback: (connection: Connection) => void) => () => void
    }
    readonly emails: {
        readonly getProcessingCounts: () => Promise<{ processing: number; failed: number }>
        readonly onProcessingUpdate: (callback: (counts: { processing: number; failed: number }) => void) => () => void
        readonly onPulled: (callback: (event: { connectionId: string; newCount: number }) => void) => () => void
    }
    readonly transactions: {
        readonly query: (params: TransactionQueryParams) => Promise<Result<{ transactions: Transaction[]; summary: TransactionSummary }, Error>>
        readonly updateCategory: (id: string, categoryId: string | null) => Promise<Result<void, Error>>
    }
    readonly categories: {
        readonly getAll: () => Promise<Result<Category[], Error>>
    }
}