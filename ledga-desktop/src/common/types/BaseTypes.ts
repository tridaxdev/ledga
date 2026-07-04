import type { PyleHoundFile, PyleHoundAsset } from "./ProjectTypes"
import type { RemoteConfig } from "./AppConfigTypes"
import type { ImportFile } from "./FileImportTypes"
import type { GetProjectFilesToolResult, GetSingleFileDetailsToolResult } from "./ToolTypes"
import type { InstallMode, ReleaseTrack } from "./InstallConfigTypes"

export interface Conversation {
    id: string
    projectId?: string
    projectName?: string
    title: string
    createdAt: string
    updatedAt: string
    messageCount: number
    lastMessageAt: string
    summary?: string
    tags?: string[]
    thinkingModeEnabled: boolean
    persistFilesToKnowledge: boolean
    legalDatabaseEnabled: boolean
    autoSkillLoadingEnabled: boolean
    webSearchEnabled: boolean
    isStreaming: boolean
    hasUnreadMessages: boolean
    pendingApproval: ToolApprovalRequestEvent | null
    lastMessageRole?: "assistant" | "user" | "system"
    lastMessagePreview?: string
    processingFileCount: number
}

export interface ConversationWithMessages extends Conversation {
    messages: Message[]
}

interface BaseMessageStep {
    id: string
    messageId: string
    createdAt: string
    updatedAt: string
    errorMessage?: string
    attachedFiles: PyleHoundFile[]
}

export interface ThinkingStep extends BaseMessageStep {
    stepType: "thinking"
    thinkingContent: string
    finishedAt: string | null
}

export interface ContentStep extends BaseMessageStep {
    stepType: "content"
    content: string
}

export type ToolExecutionStatus = "pending" | "running" | "completed" | "error" | "awaiting_approval" | "denied"

interface BaseToolExecutionStep extends BaseMessageStep {
    stepType: "tool_execution"
    toolCallId: string
    arguments?: Record<string, unknown>
    status: ToolExecutionStatus
    approvalId?: string
}

export interface GetProjectFilesExecutionStep extends BaseToolExecutionStep {
    toolName: "get_project_files"
    result?: GetProjectFilesToolResult
}

export interface LoadFileExecutionStep extends BaseToolExecutionStep {
    toolName: "load_file"
    result?: GetSingleFileDetailsToolResult
}

export type AssistantToolExecutionStep = GetProjectFilesExecutionStep | LoadFileExecutionStep
export type ToolExecutionStep = AssistantToolExecutionStep

export type AssistantMessageStep = ThinkingStep | ContentStep | AssistantToolExecutionStep
export type UserMessageStep = ContentStep
export type MessageStep = ThinkingStep | ContentStep | ToolExecutionStep

export interface Message {
    id: string
    conversationId: string
    role: "assistant" | "user" | "system"
    updatedAt?: string
    steps: MessageStep[]
    inputTokens?: number
    outputTokens?: number
}

export interface QuoteScan {
    id: number
    scanName: string
    scanPrompt: string
    status: "pending" | "processing" | "completed" | "failed" | "skipped"
    createdAt: string
    updatedAt: string
}

export interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
    emailConfirmedAt?: string
    createdAt: string
}

export interface ProjectStatistics {
    totalFiles: number
    totalFolders: number
    totalConversations: number
    totalCreditsUsed: number
    processingFileCount: number
    lastActivity?: string
}

export enum DownloadStatus {
    Idle = "idle",
    Downloading = "downloading",
    Downloaded = "downloaded",
    Installing = "installing"
}

export interface UpdateDownloadInfo {
    status: DownloadStatus
    progress?: {
        percent: number
        transferred: number
        total: number
    }
}

export interface AppInstallation {
    currentVersion: string
    buildNumber: string
    environment: string
    releaseTrack: ReleaseTrack
    installMode: InstallMode
    autoUpdateEnabled: boolean
}

export interface UpdateCheckResult {
    latestVersion: string
    updateAvailable: boolean
    download: UpdateDownloadInfo
}

export type UpdateProgressCallback = (download: UpdateDownloadInfo) => void

export interface ActivityItem {
    readonly id: string
    readonly type: "conversation" | "knowledge" | "project"
    readonly title: string
    readonly description: string
    readonly timestamp: string
    readonly entityId: string
    readonly entityType: "conversation" | "file" | "message" | "project"
}
export interface CreateConversationRequest {
    projectId?: string | null
    legalDatabaseEnabled?: boolean
    autoSkillLoadingEnabled?: boolean
    webSearchEnabled?: boolean
}

export interface GetConversationRequest {
    conversationId: string
}

export interface GetConversationsByProjectRequest {
    projectId: string | null
}

export interface UpdateConversationRequest {
    conversationId: string
    title?: string
    aiSummary?: string | null
    persistFilesToKnowledge?: boolean
    legalDatabaseEnabled?: boolean
    projectId?: string
    autoSkillLoadingEnabled?: boolean
    webSearchEnabled?: boolean
}

export interface ConversationUpdates {
    title?: string
    persistFilesToKnowledge?: boolean
}

export interface DeleteConversationRequest {
    conversationId: string
    projectId?: string
}

export interface CreateMessageRequest {
    conversationId: string
    content?: string
    attachedFiles: ImportFile[]
    persistFilesToProject: boolean
}

export interface StopConversationStreamRequest {
    conversationId: string
}

export interface ProcessedUserToolInput {
    assets: PyleHoundAsset[]
}

export interface GetMessagesRequest {
    conversationId: string
}

export type ConversationStreamStatus = "streaming" | "complete" | "error" | "awaiting_approval"

export interface ConversationStreamEvent {
    conversationId: string
    messageId: string
    status: ConversationStreamStatus
    currentMessage: Message
    error?: string
}

// Billing types
export interface BillingData {
    credits: number
    planName: string
    hasOrganization: boolean
    organizationName: string | null
    organizationId: string | null
    organizationDomain: string | null
    pool: "org" | "user"
    hasCreditsAvailable: boolean
    remoteConfig: RemoteConfig
}

export interface CostCalculation {
    dollarCost: number
    creditCost: number
    details: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

export interface BillingUsageResult {
    success: boolean
    remainingCredits: number
    pool: "org" | "user"
}

export interface RetryFromMessageRequest {
    conversationId: string
    assistantMessageId: string
}

export interface EditUserMessageRequest {
    conversationId: string
    userMessageId: string
    newContent: string
    fileIds: string[]
}

export type ConversationUpdate = Partial<Conversation> & Pick<Conversation, "id">

export interface ConversationCreatedEvent {
    conversation: Conversation
}

export interface ConversationUpdatedEvent {
    conversation: ConversationUpdate
}

export interface ConversationDeletedEvent {
    conversationId: string
    projectId?: string
}

export interface ConversationReferencesUpdatedEvent {
    conversationId: string
}

export interface ToolApprovalRequestEvent {
    conversationId: string
    messageId: string
    approvalId: string
    toolCallId: string
    toolName: string
    toolArgs: Record<string, unknown>
}

export interface ToolApprovalDecision {
    conversationId: string
    messageId: string
    approvalId: string
    approved: boolean
}
