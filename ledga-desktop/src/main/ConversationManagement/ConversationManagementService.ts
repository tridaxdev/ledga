import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import type { AIService } from "../AIService/AIService"
import type { PromptBuilder } from "../AIService/PromptBuilder"
import { TitleGenerationSchema } from "../AIService/PromptBuilder"
import type { Logger } from "../logging/FileLogger"
import type { ProjectRepository } from "../ProjectManagement/ProjectRepository"
import type { NotificationService } from "../Notifications/NotificationService"
import { t } from "../i18n/i18nextBackend"
import type { ProjectAssetRepository } from "../AssetManagement/ProjectAssetRepository"
import type { AssetManagementService } from "../AssetManagement/AssetManagementService"
import type { LLMSkillService } from "../LLMSkillService/LLMSkillService"
import type { CitationResolver } from "./CitationResolver"
import type { ConversationRepository } from "./ConversationRepository"
import type { ConversationRendererNotificationService } from "./ConversationRendererNotificationService"
import { ProcessingStatus, type PyleHoundFile } from "@/common/types/ProjectTypes"
import type { LegalDocumentDownloadResult } from "@/common/types/LegalDatabaseSearchTypes"
import { LegalSearchToolResultSchema } from "@/common/types/LegalDatabaseSearchTypes"
import type {
    GetConversationRequest,
    GetConversationsByProjectRequest,
    CreateConversationRequest,
    UpdateConversationRequest,
    DeleteConversationRequest,
    CreateMessageRequest,
    EditUserMessageRequest,
    StopConversationStreamRequest,
    UpdateUserInputToolResultRequest,
    ProcessedUserToolInput,
    Conversation,
    ConversationWithMessages,
    Message,
    ConversationStreamEvent,
    ConversationStreamStatus,
    ToolApprovalRequestEvent,
    ToolApprovalDecision
} from "@/common/types/types"

export class ConversationManagementService {
    private abortControllers = new Map<string, AbortController>()

    constructor(
        private conversationRepository: ConversationRepository,
        private logger: Logger,
        private aiService: AIService,
        private promptBuilder: PromptBuilder,
        private projectRepository: ProjectRepository,
        private assetRepository: ProjectAssetRepository,
        private assetManagementService: AssetManagementService,
        private citationResolver: CitationResolver,
        private notificationService: NotificationService,
        private rendererNotificationService: ConversationRendererNotificationService,
        private llmSkillService: LLMSkillService
    ) {
        this.cleanupStaleToolExecutions()
    }

    private async cleanupStaleToolExecutions(): Promise<void> {
        try {
            await this.conversationRepository.markAllIncompleteToolCallsAsError()
        } catch (error) {
            this.logger.error("Error cleaning up stale tool executions:", error)
        }
    }

    async getAllConversations(): Promise<Conversation[]> {
        this.logger.info("Fetching all conversations")

        try {
            const conversations = await this.conversationRepository.getAllConversations()
            this.logger.info(`Successfully fetched ${conversations.length} conversations`)
            return conversations
        } catch (error) {
            this.logger.error("Failed to fetch conversations:", error)
            throw new Error("Failed to fetch conversations")
        }
    }

    async getConversationsByProjectId(request: GetConversationsByProjectRequest): Promise<Conversation[]> {
        this.logger.info(`Fetching conversations for project: ${request.projectId || "standalone"}`)

        try {
            const conversations = await this.conversationRepository.getConversationsByProjectId(request)
            this.logger.info(`Successfully fetched ${conversations.length} conversations for project ${request.projectId || "standalone"}`)
            return conversations
        } catch (error) {
            this.logger.error(`Failed to fetch conversations for project ${request.projectId}:`, error)
            throw new Error(`Failed to fetch conversations for project ${request.projectId}`)
        }
    }

    async getConversationById(request: GetConversationRequest): Promise<ConversationWithMessages> {
        this.logger.info(`Fetching conversation with id: ${request.conversationId}`)

        try {
            const conversation = await this.conversationRepository.getConversationWithMessagesById(request.conversationId)

            if (conversation) {
                this.logger.info(`Successfully fetched conversation: ${conversation.title}`)

                const resolvedMessages = await this.citationResolver.enrichAndRender(request.conversationId, conversation.messages)

                const awaitingStep = await this.conversationRepository.findAwaitingApprovalStep(request.conversationId)
                const pendingApproval = awaitingStep
                    ? {
                          conversationId: request.conversationId,
                          messageId: awaitingStep.messageId,
                          approvalId: awaitingStep.id,
                          toolCallId: awaitingStep.toolCallId,
                          toolName: awaitingStep.toolName,
                          toolArgs: (awaitingStep.arguments as Record<string, unknown>) || {}
                      }
                    : null

                return { ...conversation, messages: resolvedMessages, pendingApproval }
            } else {
                throw new Error(`Failed to fetch conversation ${request.conversationId}`)
            }
        } catch (error) {
            this.logger.error(`Failed to fetch conversation ${request.conversationId}:`, error)
            throw new Error(`Failed to fetch conversation ${request.conversationId}`)
        }
    }

    async createConversation(request: CreateConversationRequest): Promise<Conversation> {
        this.logger.info("Creating new conversation")

        try {
            const conversation = await this.conversationRepository.insert(request)
            this.logger.info(`Successfully created conversation: ${conversation.id}`)
            this.rendererNotificationService.conversationCreated(conversation)
            return conversation
        } catch (error) {
            this.logger.error("Failed to create conversation:", error)
            throw new Error("Failed to create conversation")
        }
    }

    async updateConversation(request: UpdateConversationRequest): Promise<Conversation | null> {
        this.logger.info(`Updating conversation with id: ${request.conversationId}`)

        try {
            const success = await this.conversationRepository.update(request)
            if (success) {
                const updatedConversation = await this.conversationRepository.getConversationById(request.conversationId)
                if (!updatedConversation) {
                    throw new Error(`Failed to fetch updated conversation ${request.conversationId}`)
                }
                this.logger.info(`Successfully updated conversation: ${request.conversationId}`)
                const isStreaming = this.abortControllers.has(request.conversationId)
                this.rendererNotificationService.conversationUpdated({
                    ...updatedConversation,
                    isStreaming
                })
                return updatedConversation
            } else {
                this.logger.info(`Conversation not found for update: ${request.conversationId}`)
                return null
            }
        } catch (error) {
            this.logger.error(`Failed to update conversation ${request.conversationId}:`, error)
            throw new Error(`Failed to update conversation ${request.conversationId}`)
        }
    }

    async deleteConversation(request: DeleteConversationRequest): Promise<boolean> {
        this.logger.info(`Deleting conversation with id: ${request.conversationId}`)

        try {
            const success = await this.conversationRepository.delete(request)
            if (success) {
                this.logger.info(`Successfully deleted conversation: ${request.conversationId}`)
                this.rendererNotificationService.conversationDeleted(request.conversationId, request.projectId)
            } else {
                this.logger.info(`Conversation not found for deletion: ${request.conversationId}`)
            }
            return success
        } catch (error) {
            this.logger.error(`Failed to delete conversation ${request.conversationId}:`, error)
            throw new Error(`Failed to delete conversation ${request.conversationId}`)
        }
    }

    async stopStreaming(request: StopConversationStreamRequest): Promise<void> {
        const pendingStep = await this.conversationRepository.findAwaitingApprovalStep(request.conversationId)
        if (pendingStep) {
            await this.conversationRepository.updateToolExecutionStatus(pendingStep.id, "error", "Cancelled by user")
        }

        const controller = this.abortControllers.get(request.conversationId)
        if (!controller) {
            this.rendererNotificationService.conversationUpdated({
                id: request.conversationId,
                isStreaming: false
            })
            return
        }

        controller.abort()
        this.abortControllers.delete(request.conversationId)

        this.rendererNotificationService.conversationUpdated({
            id: request.conversationId,
            isStreaming: false
        })
    }

    private createAbortController(conversationId: string): AbortController {
        const abortController = new AbortController()
        this.abortControllers.set(conversationId, abortController)
        this.rendererNotificationService.conversationUpdated({
            id: conversationId,
            isStreaming: true,
            pendingApproval: null
        })
        return abortController
    }

    async sendChatMessage(request: CreateMessageRequest, onChatStreamChunk: (event: ConversationStreamEvent) => void) {
        const abortController = this.createAbortController(request.conversationId)

        try {
            const userMessageId = uuidv4()
            const hasFiles = request.attachedFiles.length > 0

            const attachedSkill = request.selectedLLMSkillId ? await this.llmSkillService.get(request.selectedLLMSkillId) : null
            if (request.selectedLLMSkillId && !attachedSkill) {
                this.logger.warn(`selectedLLMSkillId "${request.selectedLLMSkillId}" not found`)
            }

            const messageContent = request.content || (hasFiles ? "" : undefined) // We use empty string for file only as content to ensure a content step is created
            const userMessage = await this.conversationRepository.insertMessage(userMessageId, request.conversationId, "user", messageContent, attachedSkill)

            const assistantMessageId = uuidv4()
            await this.conversationRepository.insertMessage(assistantMessageId, request.conversationId, "assistant")

            const conversationMetadata = await this.conversationRepository.getConversationById(request.conversationId)

            let finalUserMessage = userMessage
            let attachedFileIds: string[] = []

            if (hasFiles) {
                const contentStep = userMessage.steps.find(s => s.stepType === "content")
                if (contentStep) {
                    const projectId = request.persistFilesToProject ? conversationMetadata?.projectId : undefined
                    const assets = await this.assetManagementService.importFiles(
                        {
                            stepId: contentStep.id,
                            projectId,
                            files: request.attachedFiles
                        },
                        abortController.signal
                    )

                    const attachedFiles = assets.filter((a): a is PyleHoundFile => a.type === "file")
                    attachedFileIds = attachedFiles.map(f => f.id)
                    finalUserMessage = {
                        ...userMessage,
                        steps: userMessage.steps.map(step => (step.id === contentStep.id ? { ...step, attachedFiles } : step))
                    }
                }
            }

            this.streamChatResponse(request.conversationId, assistantMessageId, onChatStreamChunk, attachedFileIds, request.skipProjectProcessing ?? false, abortController.signal)

            const renderedUserMessage = await this.citationResolver.renderTagsInMessage(request.conversationId, finalUserMessage)
            this.rendererNotificationService.referencesUpdated(request.conversationId)
            return { userMessage: renderedUserMessage, assistantMessageId }
        } catch (error) {
            this.abortControllers.delete(request.conversationId)
            this.rendererNotificationService.conversationUpdated({
                id: request.conversationId,
                isStreaming: false
            })
            throw error
        }
    }

    async streamChatResponse(
        conversationId: string,
        responseMessageId: string,
        onChatStreamChunk: (event: ConversationStreamEvent) => void,
        attachedFileIds: string[],
        skipProjectProcessing: boolean,
        abortSignal: AbortSignal
    ) {
        const conversation = await this.conversationRepository.getConversationById(conversationId)
        if (!conversation) {
            return
        }

        let currentContentStepId: string | null = null
        let currentThinkingStepId: string | null = null

        try {
            const hasAttachedFiles = attachedFileIds.length > 0
            const includeProjectFiles = Boolean(conversation.projectId) && !skipProjectProcessing

            if (hasAttachedFiles || includeProjectFiles) {
                this.logger.info(`Waiting for files to finish processing (attached: ${attachedFileIds.length}, project: ${includeProjectFiles})`)
                await this.assetManagementService.waitForFilesInConversation(conversation.id, abortSignal, includeProjectFiles, attachedFileIds)
            }

            if (hasAttachedFiles) {
                const attachedFiles = await this.assetManagementService.getFilesByIds(attachedFileIds)
                const failedFiles = attachedFiles.filter(f => f.processingStatus === ProcessingStatus.FAILED)

                if (failedFiles.length > 0) {
                    const failedFileDetails = failedFiles.map(file => {
                        const reason = file.processingError ? `: ${file.processingError}` : ""
                        return `${file.name}${reason}`
                    })
                    throw new Error(`Cannot continue: ${failedFiles.length} file(s) failed to process.\n${failedFileDetails.join("\n")}\nPlease retry processing or remove the failed files.`)
                }
            }

            const toolContext = {
                conversationId,
                projectId: conversation?.projectId,
                legalDatabaseEnabled: conversation?.legalDatabaseEnabled ?? true,
                webSearchEnabled: conversation?.webSearchEnabled ?? true,
                persistFilesToKnowledge: conversation?.persistFilesToKnowledge ?? true
            }

            const conversationHistory = await this.createAIModelContext(conversationId, conversation.projectId)
            const stream = await this.aiService.streamText(conversationHistory, toolContext, false, abortSignal, () => this.beforeStep(conversationId, conversation.projectId, abortSignal))
            for await (const part of stream.fullStream) {
                switch (part.type) {
                    case "reasoning-start": {
                        currentThinkingStepId = uuidv4()
                        await this.conversationRepository.createThinkingStep(responseMessageId, currentThinkingStepId)
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "reasoning-delta": {
                        if (!currentThinkingStepId) break
                        const currentStep = await this.conversationRepository.getThinkingStep(currentThinkingStepId)
                        const currentContent = currentStep?.thinkingContent || ""
                        await this.conversationRepository.updateThinkingStepContent(currentThinkingStepId, currentContent + part.text)
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "reasoning-end": {
                        if (currentThinkingStepId) {
                            await this.conversationRepository.finalizeThinkingStep(currentThinkingStepId)
                        }
                        currentThinkingStepId = null
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "text-start": {
                        currentContentStepId = uuidv4()
                        await this.conversationRepository.createContentStep(responseMessageId, currentContentStepId, "")
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "text-delta": {
                        if (!currentContentStepId) break
                        await this.conversationRepository.appendContentStepContent(currentContentStepId, part.text)
                        await this.citationResolver.enrichAndPersistMessageById(conversationId, responseMessageId, part.text)
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "text-end": {
                        if (currentContentStepId) {
                            await this.citationResolver.enrichAndPersistMessageById(conversationId, responseMessageId)
                            await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        }
                        currentContentStepId = null
                        break
                    }

                    case "tool-call": {
                        const existingToolStep = await this.conversationRepository.findToolExecutionStepByToolCallId(part.toolCallId)
                        if (!existingToolStep) {
                            await this.conversationRepository.createToolExecutionStep(responseMessageId, uuidv4(), part.toolCallId, part.toolName, part.input)
                        }
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "tool-approval-request": {
                        const toolCall = part.toolCall
                        const existingStep = await this.conversationRepository.findToolExecutionStepByToolCallId(toolCall.toolCallId)
                        if (!existingStep) {
                            throw new Error(`No tool execution step found for toolCallId: ${toolCall.toolCallId}`)
                        }

                        await this.conversationRepository.updateToolExecutionApproval(existingStep.id, "awaiting_approval", part.approvalId)

                        const approvalEvent: ToolApprovalRequestEvent = {
                            conversationId,
                            messageId: responseMessageId,
                            approvalId: existingStep.id,
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            toolArgs: toolCall.input as Record<string, unknown>
                        }

                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "awaiting_approval")
                        this.rendererNotificationService.conversationUpdated({
                            id: conversationId,
                            pendingApproval: approvalEvent,
                            isStreaming: false
                        })
                        this.notificationService.send({
                            id: `tool-approval-${approvalEvent.approvalId}`,
                            type: "info",
                            title: t("notifications.tool_approval.title"),
                            action: {
                                label: t("notifications.tool_approval.label"),
                                href: `/conversations/${conversationId}`
                            }
                        })
                        break
                    }

                    case "tool-result": {
                        await this.conversationRepository.updateToolExecutionResultByToolCallId(part.toolCallId, part.output)
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")

                        const abortReason = this.getToolResultAbortReason(part.toolName, part.output)
                        if (abortReason) {
                            this.abortControllers.get(conversationId)?.abort(abortReason)
                        }
                        break
                    }

                    case "tool-error": {
                        await this.conversationRepository.updateToolExecutionResultByToolCallId(part.toolCallId, undefined, String(part.error))
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming", String(part.error))
                        break
                    }

                    case "error": {
                        this.logger.error("Stream error:", part.error)
                        const errorStepId = uuidv4()
                        await this.conversationRepository.createContentStep(responseMessageId, errorStepId, "", `${part.error}`)
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "error", String(part.error))
                        break
                    }

                    case "finish": {
                        await this.conversationRepository.updateMessageTokenUsage(
                            responseMessageId,
                            part.totalUsage.inputTokens || 0,
                            part.totalUsage.outputTokens || 0,
                            part.totalUsage.reasoningTokens || 0,
                            part.totalUsage.totalTokens || 0
                        )
                        break
                    }

                    case "abort": {
                        if (this.isLegalSearchAbort(abortSignal)) {
                            break
                        }
                        try {
                            await this.conversationRepository.markIncompleteToolCallsAsError(responseMessageId)
                            const abortStepId = uuidv4()
                            const abortMessage = "Aborted by user"
                            await this.conversationRepository.createContentStep(responseMessageId, abortStepId, "", abortMessage)
                        } catch (error) {
                            this.logger.error("Failed to cleanup incomplete tool calls after abort", error)
                        }
                        break
                    }

                    case "start": {
                        await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "streaming")
                        break
                    }

                    case "start-step":
                    case "finish-step":
                    case "tool-input-start":
                    case "tool-input-delta":
                    case "tool-input-end":
                    default:
                        this.logger.debug(`Unhandled stream part type: ${part.type}`)
                }
            }

            await stream.consumeStream()

            if (this.isLegalSearchAbort(abortSignal)) {
                await this.citationResolver.enrichAndPersistMessageById(conversationId, responseMessageId)
                await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "complete")
                this.rendererNotificationService.conversationUpdated({
                    id: conversationId,
                    isStreaming: false
                })
            } else {
                const pendingApprovalStep = await this.conversationRepository.findAwaitingApprovalStep(conversationId)
                if (!pendingApprovalStep) {
                    await this.notifyUser(responseMessageId, conversation.id)
                    await this.checkConversationTitleAndGenerateIfEmpty(conversation)
                    await this.citationResolver.enrichAndPersistMessageById(conversationId, responseMessageId)
                    await this.streamCurrentMessageStateToRenderer(conversationId, responseMessageId, onChatStreamChunk, "complete")

                    const updatedConversation = await this.conversationRepository.getConversationById(conversationId)
                    this.rendererNotificationService.conversationUpdated({
                        id: conversationId,
                        isStreaming: false,
                        hasUnreadMessages: true,
                        processingFileCount: updatedConversation?.processingFileCount ?? 0,
                        lastMessageRole: updatedConversation?.lastMessageRole,
                        lastMessagePreview: updatedConversation?.lastMessagePreview
                    })
                }
            }
        } catch (error) {
            this.logger.error("Error in streamChatResponse:", error)
            const errorStepId = uuidv4()
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while generating the response."
            await this.conversationRepository.createContentStep(responseMessageId, errorStepId, "", errorMessage)
            const currentMessage = await this.conversationRepository.getMessageById(responseMessageId)
            onChatStreamChunk({
                conversationId,
                messageId: responseMessageId,
                currentMessage: currentMessage ?? undefined,
                status: "error",
                error: errorMessage
            })

            this.rendererNotificationService.conversationUpdated({
                id: conversationId,
                isStreaming: false,
                hasUnreadMessages: true
            })
        } finally {
            this.abortControllers.delete(conversationId)
        }
    }

    private async streamCurrentMessageStateToRenderer(
        conversationId: string,
        messageId: string,
        onChatStreamChunk: (event: ConversationStreamEvent) => void,
        status: ConversationStreamStatus,
        error?: string
    ) {
        const message = await this.conversationRepository.getMessageById(messageId)
        const rendered = await this.citationResolver.renderTagsInMessage(conversationId, message)
        onChatStreamChunk({ conversationId, messageId, currentMessage: rendered, status, error })
        this.rendererNotificationService.referencesUpdated(conversationId)
    }

    // stopWhen doesn't work for approval-based tools
    // so we manually abort after certain tool results to hand control back to the user
    private getToolResultAbortReason(toolName: string, output: unknown): string | null {
        if (toolName === "search_legal_database" && LegalSearchToolResultSchema.safeParse(output).success) {
            return "legal_database_search_complete"
        }
        return null
    }

    private isLegalSearchAbort(signal: AbortSignal): boolean {
        return signal.reason === "legal_database_search_complete"
    }

    private async beforeStep(conversationId: string, projectId: string | null | undefined, abortSignal: AbortSignal): Promise<Message[] | void> {
        if (abortSignal.aborted) return
        await this.assetManagementService.waitForFilesInConversation(conversationId, abortSignal, false, [])
        if (abortSignal.aborted) return
        return await this.createAIModelContext(conversationId, projectId)
    }

    async createAIModelContext(conversationId: string, projectId: string | null | undefined): Promise<Message[]> {
        const systemPrompt = await this.createSystemPrompt(projectId)
        const previousMessages = await this.conversationRepository.getAllMessages(conversationId)
        const systemMessageId = uuidv4()
        const systemMessage: Message = {
            id: systemMessageId,
            conversationId: conversationId,
            role: "system",
            updatedAt: new Date().toISOString(),
            steps: [
                {
                    id: uuidv4(),
                    messageId: systemMessageId,
                    stepType: "content",
                    content: systemPrompt,
                    attachedFiles: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ]
        }

        const messages: Message[] = [systemMessage, ...previousMessages]
        return messages
    }

    async createSystemPrompt(projectId: string | null | undefined) {
        if (!projectId) {
            return this.promptBuilder.getChatSystemPrompt()
        }
        const project = await this.projectRepository.getProjectWithStatistics(projectId)
        const files = await this.assetRepository.getFilesByProjectId(projectId)

        if (!project) {
            return this.promptBuilder.getChatSystemPrompt()
        }

        return this.promptBuilder.getProjectAwareChatSystemPrompt(project, files)
    }

    async notifyUser(messageId: string, conversationId: string) {
        const message = await this.conversationRepository.getMessageById(messageId)
        const messagePreview = message?.steps
            .filter(step => step.stepType === "content")
            .map(step => step.content)
            .join(" ")
            .substring(0, 100)

        this.notificationService.send({
            id: conversationId,
            type: "info",
            title: t("notifications.new_message_in_conversation.title"),
            description: `${messagePreview}...`,
            action: {
                label: t("notifications.new_message_in_conversation.label"),
                href: `/conversations/${conversationId}`
            }
        })
    }

    async checkConversationTitleAndGenerateIfEmpty(conversation: Conversation): Promise<string | undefined> {
        if (conversation.title && conversation.title.trim() !== "") {
            return conversation.title
        }

        try {
            const messages = await this.conversationRepository.getAllMessages(conversation.id)
            const context = messages
                .map(message => {
                    return message.steps
                        .filter(step => step.stepType === "content")
                        .map(step => step.content)
                        .join(" ")
                })
                .filter(content => content.trim() !== "")
                .join("\n")

            const result = await this.aiService.processAIRequest({
                requestId: `title-gen-${uuidv4()}`,
                modelTier: "simple",
                operation: "conversationTitle",
                data: {
                    messageHistory: context,
                    schema: z.toJSONSchema(TitleGenerationSchema),
                    timeout: 30_000
                }
            })

            if (!result || !result.result) {
                this.logger.warn("No AI response available for conversation title")
                return
            }

            const parseResult = TitleGenerationSchema.parse(result.result)
            const title = parseResult.title
            await this.conversationRepository.update({
                conversationId: conversation.id,
                title: title
            })
            this.logger.info(`Updated conversation ${conversation.id} with generated title: "${title}"`)
            this.rendererNotificationService.conversationUpdated({
                id: conversation.id,
                title
            })
            return title
        } catch (error) {
            this.logger.warn(`Failed to generate title for conversation ${conversation.id}:`, error)
        }
    }

    async updateUserInputToolResult(request: UpdateUserInputToolResultRequest, onChatStreamChunk: (event: ConversationStreamEvent) => void): Promise<void> {
        this.logger.info(`Updating tool execution step result for step: ${request.stepId}`)

        let conversationId: string | undefined
        let newUserMessageId: string | undefined

        try {
            const message = await this.conversationRepository.getMessageById(request.messageId)
            conversationId = message?.conversationId

            if (!conversationId) {
                throw new Error(`No conversation found for message: ${request.messageId}`)
            }

            const abortController = this.createAbortController(conversationId)

            const conversation = await this.conversationRepository.getConversationById(conversationId)
            const projectId = conversation?.projectId

            newUserMessageId = uuidv4()
            await this.conversationRepository.insertMessage(newUserMessageId, conversationId, "user")

            const toolStepId = uuidv4()
            await this.conversationRepository.createToolExecutionStep(newUserMessageId, toolStepId, request.toolCallId, request.toolName)

            const { toolResult, assets } = await this.processUserToolInput(toolStepId, request, projectId, abortController.signal)
            const attachedFiles = assets.filter((a): a is PyleHoundFile => a.type === "file")
            const attachedFileIds = attachedFiles.map(f => f.id)

            await this.conversationRepository.updateToolExecutionResult(toolStepId, toolResult)
            await this.conversationRepository.attachFilesToStep(toolStepId, attachedFileIds)

            // as the file processing is not awaited, it can happen that the file processing fails befire we notify the renderer
            // this ensures that we push the correct file state to the renderer
            const refreshedFiles = await this.assetManagementService.getFilesByIds(attachedFileIds)
            const userMessage = await this.conversationRepository.getMessageById(newUserMessageId)
            const finalUserMessage = {
                ...userMessage,
                steps: userMessage.steps.map(step => (step.id === toolStepId ? { ...step, attachedFiles: refreshedFiles } : step))
            }

            onChatStreamChunk({
                conversationId,
                messageId: newUserMessageId,
                currentMessage: finalUserMessage,
                status: "complete"
            })

            const assistantMessageId = uuidv4()
            await this.conversationRepository.insertMessage(assistantMessageId, conversationId, "assistant")

            this.streamChatResponse(conversationId, assistantMessageId, onChatStreamChunk, attachedFileIds, false, abortController.signal)

            this.rendererNotificationService.referencesUpdated(conversationId)
        } catch (error) {
            this.logger.error(`Failed to update tool execution step: ${request.stepId}`, error)

            if (conversationId && newUserMessageId) {
                const errorStepId = uuidv4()
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while processing the tool result."
                await this.conversationRepository.createContentStep(newUserMessageId, errorStepId, "", errorMessage)
                const currentMessage = await this.conversationRepository.getMessageById(newUserMessageId)
                onChatStreamChunk({
                    conversationId,
                    messageId: newUserMessageId,
                    currentMessage: currentMessage ?? undefined,
                    status: "error",
                    error: errorMessage
                })

                this.abortControllers.delete(conversationId)
                this.rendererNotificationService.conversationUpdated({
                    id: conversationId,
                    isStreaming: false
                })
            }

            throw new Error("Failed to update tool execution step")
        }
    }

    private async processUserToolInput(stepId: string, request: UpdateUserInputToolResultRequest, projectId?: string, abortSignal?: AbortSignal): Promise<ProcessedUserToolInput> {
        switch (request.toolName) {
            case "search_legal_database": {
                const assets = await this.assetManagementService.importFiles({ stepId, projectId, files: request.result.files }, abortSignal)
                const selectedDocuments = assets.filter((a): a is PyleHoundFile => a.type === "file")
                const toolResult: LegalDocumentDownloadResult = {
                    legalDatabaseId: request.result.legalDatabaseId,
                    queries: request.result.queries,
                    selectedDocuments
                }
                return { toolResult, assets }
            }
            case "quote_scan":
                return { toolResult: request.result, assets: [] }
            default:
                throw new Error(`Unhandled tool name!`)
        }
    }

    async retryFromMessage(conversationId: string, assistantMessageId: string, onChatStreamChunk: (event: ConversationStreamEvent) => void): Promise<boolean> {
        this.logger.info(`Retrying assistant message: ${assistantMessageId}`)
        const abortController = this.createAbortController(conversationId)

        try {
            await this.conversationRepository.deleteMessagesFrom(conversationId, assistantMessageId, true)

            await this.conversationRepository.insertMessage(assistantMessageId, conversationId, "assistant")

            this.streamChatResponse(conversationId, assistantMessageId, onChatStreamChunk, [], false, abortController.signal)

            return true
        } catch (error) {
            this.abortControllers.delete(conversationId)
            this.rendererNotificationService.conversationUpdated({
                id: conversationId,
                isStreaming: false
            })
            throw error
        }
    }

    async editUserMessage(request: EditUserMessageRequest, onChatStreamChunk: (event: ConversationStreamEvent) => void): Promise<{ userMessage: Message; assistantMessageId: string }> {
        this.logger.info(`Editing user message: ${request.userMessageId}`)
        const abortController = this.createAbortController(request.conversationId)

        try {
            await this.conversationRepository.deleteMessagesFrom(request.conversationId, request.userMessageId, false)

            const existingSteps = await this.conversationRepository.getMessageSteps(request.userMessageId)
            const contentStep = existingSteps.find(s => s.stepType === "content")

            if (contentStep) {
                await this.conversationRepository.updateContentStepContent(contentStep.id, request.newContent)
            } else {
                await this.conversationRepository.createContentStep(request.userMessageId, uuidv4(), request.newContent)
            }

            // Detach files the user removed from their respective steps
            const requestFileIdSet = new Set(request.fileIds)
            for (const step of existingSteps) {
                const filesToDetach = step.attachedFiles.filter(f => !requestFileIdSet.has(f.id)).map(f => f.id)
                await this.conversationRepository.detachFilesFromStep(step.id, filesToDetach)
            }

            const assistantMessageId = uuidv4()

            await this.conversationRepository.insertMessage(assistantMessageId, request.conversationId, "assistant")

            this.streamChatResponse(request.conversationId, assistantMessageId, onChatStreamChunk, request.fileIds, false, abortController.signal)

            const userMessage = await this.conversationRepository.getMessageById(request.userMessageId)
            const renderedUserMessage = await this.citationResolver.renderTagsInMessage(request.conversationId, userMessage)
            this.rendererNotificationService.referencesUpdated(request.conversationId)
            return { userMessage: renderedUserMessage, assistantMessageId }
        } catch (error) {
            this.abortControllers.delete(request.conversationId)
            this.rendererNotificationService.conversationUpdated({
                id: request.conversationId,
                isStreaming: false
            })
            throw error
        }
    }

    async markConversationAsRead(conversationId: string): Promise<void> {
        this.logger.info(`Marking conversation as read: ${conversationId}`)

        try {
            const conversation = await this.conversationRepository.getConversationById(conversationId)

            if (conversation && conversation.hasUnreadMessages) {
                await this.conversationRepository.markConversationAsRead(conversationId)
                this.rendererNotificationService.conversationUpdated({
                    id: conversationId,
                    hasUnreadMessages: false
                })
            }
        } catch (error) {
            this.logger.error(`Failed to mark conversation as read: ${conversationId}`, error)
            throw new Error(`Failed to mark conversation as read: ${conversationId}`)
        }
    }

    async updateUserToolApproval(request: ToolApprovalDecision, onChatStreamChunk: (event: ConversationStreamEvent) => void): Promise<void> {
        const stepId = request.approvalId
        const approvalStep = await this.conversationRepository.getAwaitingApprovalStepById(stepId)
        if (!approvalStep) {
            throw new Error(`No pending approval found for approvalId: ${request.approvalId}`)
        }

        const { conversationId } = request
        const messageId = approvalStep.messageId

        try {
            if (request.approved) {
                await this.conversationRepository.updateToolExecutionStatus(stepId, "running")
                await this.streamCurrentMessageStateToRenderer(conversationId, messageId, onChatStreamChunk, "streaming")

                this.rendererNotificationService.conversationUpdated({
                    id: conversationId,
                    pendingApproval: null
                })

                const abortController = this.createAbortController(conversationId)

                this.streamChatResponse(conversationId, messageId, onChatStreamChunk, [], false, abortController.signal)
            } else {
                await this.conversationRepository.updateToolExecutionStatus(stepId, "denied", "Tool execution denied by user")
                await this.streamCurrentMessageStateToRenderer(conversationId, messageId, onChatStreamChunk, "complete")

                this.rendererNotificationService.conversationUpdated({
                    id: conversationId,
                    isStreaming: false,
                    pendingApproval: null
                })
            }
        } catch (error) {
            this.logger.error(`Failed to respond to tool approval: ${request.approvalId}`, error)

            this.rendererNotificationService.conversationUpdated({
                id: conversationId,
                isStreaming: false,
                pendingApproval: null
            })

            throw error
        }
    }
}
