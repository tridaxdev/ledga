import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { FileSourceSchema } from "../../common/types/LegalDatabaseSearchTypes"
import type { FileSource } from "../../common/types/LegalDatabaseSearchTypes"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"
import type { QueryResult } from "../Database/types/query"
import type { LLMSkill } from "@/common/types/LLMSkillTypes"
import type {
    GetConversationsByProjectRequest,
    CreateConversationRequest,
    UpdateConversationRequest,
    DeleteConversationRequest,
    Conversation,
    ConversationWithMessages,
    Message,
    MessageStep,
    ThinkingStep,
    ContentStep,
    ToolExecutionStep,
    ToolExecutionStatus,
    UserInputToolResult
} from "@/common/types/types"
import { ToolNameSchema } from "@/common/types/ToolTypes"

const PENDING_APPROVAL_SUBQUERIES = `
    (SELECT ms_ap.id FROM tool_execution te_ap JOIN message_step ms_ap ON ms_ap.id = te_ap.step_id JOIN message msg_ap ON msg_ap.id = ms_ap.message_id WHERE msg_ap.conversation_id = c.id AND te_ap.status = 'awaiting_approval' ORDER BY ms_ap.created_at DESC LIMIT 1) as approval_step_id,
    (SELECT ms_ap.message_id FROM tool_execution te_ap JOIN message_step ms_ap ON ms_ap.id = te_ap.step_id JOIN message msg_ap ON msg_ap.id = ms_ap.message_id WHERE msg_ap.conversation_id = c.id AND te_ap.status = 'awaiting_approval' ORDER BY ms_ap.created_at DESC LIMIT 1) as approval_message_id,
    (SELECT te_ap.tool_call_id FROM tool_execution te_ap JOIN message_step ms_ap ON ms_ap.id = te_ap.step_id JOIN message msg_ap ON msg_ap.id = ms_ap.message_id WHERE msg_ap.conversation_id = c.id AND te_ap.status = 'awaiting_approval' ORDER BY ms_ap.created_at DESC LIMIT 1) as approval_tool_call_id,
    (SELECT te_ap.tool_name FROM tool_execution te_ap JOIN message_step ms_ap ON ms_ap.id = te_ap.step_id JOIN message msg_ap ON msg_ap.id = ms_ap.message_id WHERE msg_ap.conversation_id = c.id AND te_ap.status = 'awaiting_approval' ORDER BY ms_ap.created_at DESC LIMIT 1) as approval_tool_name,
    (SELECT te_ap.arguments FROM tool_execution te_ap JOIN message_step ms_ap ON ms_ap.id = te_ap.step_id JOIN message msg_ap ON msg_ap.id = ms_ap.message_id WHERE msg_ap.conversation_id = c.id AND te_ap.status = 'awaiting_approval' ORDER BY ms_ap.created_at DESC LIMIT 1) as approval_tool_args,
` as const

const PROCESSING_FILE_COUNT_QUERY = `
    COALESCE((
        SELECT COUNT(*) FROM (
            SELECT f.id FROM file f
            JOIN message_step ms ON f.step_id = ms.id
            JOIN message msg ON ms.message_id = msg.id
            WHERE msg.conversation_id = c.id
            AND f.processing_status IN ('pending', 'processing')
            UNION
            SELECT f.id FROM file f
            JOIN folder ON f.folder_id = folder.id
            WHERE folder.project_id = c.project_id
            AND f.processing_status IN ('pending', 'processing')
        )
    ), 0) as processing_file_count
` as const

export class ConversationRepository {
    private db: DatabaseManager
    private logger: Logger
    private fileStorageDirectory: string

    constructor(db: DatabaseManager, logger: Logger, fileStorageDirectory: string) {
        this.db = db
        this.logger = logger
        this.fileStorageDirectory = fileStorageDirectory
    }

    private parseFileSource(raw: string | null): FileSource {
        if (!raw) return { provider: "local", path: "" }
        try {
            const parsed = FileSourceSchema.safeParse(JSON.parse(raw))
            return parsed.success ? parsed.data : { provider: "local", path: "" }
        } catch {
            return { provider: "local", path: "" }
        }
    }

    private backupFilePath(filename: string | null | undefined): string | null {
        if (!filename || filename.trim() === "") {
            return null
        }
        return path.join(this.fileStorageDirectory, filename)
    }

    /**
     * Convert SQLite timestamp to proper ISO 8601 UTC format
     */
    private formatUTCTimestamp(timestamp: string): string {
        // If already in ISO format, return as-is
        if (timestamp.endsWith("Z") || timestamp.includes("+")) {
            return timestamp
        }
        // SQLite CURRENT_TIMESTAMP format: 'YYYY-MM-DD HH:MM:SS' (UTC)
        // Convert to ISO format with Z suffix
        return `${timestamp}Z`
    }

    private static readonly TOOL_EXECUTION_SELECT =
        "ms.id, ms.message_id, ms.step_type, ms.content, ms.created_at, ms.updated_at, ms.error_message, te.tool_call_id, te.tool_name, te.arguments, te.result, te.status, te.approval_id"

    private mapRowToToolExecutionStep(row: Record<string, unknown>): ToolExecutionStep {
        return {
            id: row.id as string,
            messageId: row.message_id as string,
            stepType: "tool_execution",
            toolCallId: row.tool_call_id as string,
            toolName: ToolNameSchema.parse(row.tool_name),
            arguments: row.arguments ? JSON.parse(row.arguments as string) : undefined,
            result: row.result ? JSON.parse(row.result as string) : undefined,
            status: row.status as ToolExecutionStatus,
            approvalId: (row.approval_id as string) || undefined,
            createdAt: this.formatUTCTimestamp(row.created_at as string),
            updatedAt: this.formatUTCTimestamp(row.updated_at as string),
            errorMessage: (row.error_message as string) || undefined,
            attachedFiles: []
        }
    }

    private buildConversationFromJoinedResults(results: unknown[]): Conversation | null {
        if (!results || results.length === 0) {
            return null
        }

        const firstRow = results[0] as Record<string, unknown>

        const messageIds = new Set<string>()
        let latestMessageCreatedAt: string | null = null

        for (const row of results) {
            const r = row as Record<string, unknown>
            if (r.message_id) {
                messageIds.add(r.message_id as string)
                const messageCreatedAt = r.message_created_at as string
                if (!latestMessageCreatedAt || messageCreatedAt > latestMessageCreatedAt) {
                    latestMessageCreatedAt = messageCreatedAt
                }
            }
        }

        const messageCount = messageIds.size
        const lastMessageAt = latestMessageCreatedAt ? this.formatUTCTimestamp(latestMessageCreatedAt) : this.formatUTCTimestamp(firstRow.created_at as string)

        const lastReadAt = firstRow.last_read_at ? new Date(this.formatUTCTimestamp(firstRow.last_read_at as string)) : null
        const lastMsgAt = new Date(lastMessageAt)
        const hasUnreadMessages = lastReadAt === null ? messageCount > 0 : lastMsgAt > lastReadAt

        const conversationId = firstRow.id as string
        const approvalStepId = firstRow.approval_step_id as string | null
        const pendingApproval = approvalStepId
            ? {
                  conversationId,
                  messageId: firstRow.approval_message_id as string,
                  approvalId: approvalStepId,
                  toolCallId: firstRow.approval_tool_call_id as string,
                  toolName: firstRow.approval_tool_name as string,
                  toolArgs: (JSON.parse((firstRow.approval_tool_args as string) || "{}") as Record<string, unknown>) || {}
              }
            : null

        const conversation: Conversation = {
            id: conversationId,
            projectId: firstRow.project_id ? (firstRow.project_id as string) : undefined,
            projectName: (firstRow.project_name as string) || undefined,
            title: firstRow.title as string,
            createdAt: this.formatUTCTimestamp(firstRow.created_at as string),
            updatedAt: this.formatUTCTimestamp(firstRow.updated_at as string),
            messageCount,
            lastMessageAt,
            summary: (firstRow.ai_summary as string) || undefined,
            thinkingModeEnabled: Boolean(firstRow.thinking_mode_enabled),
            persistFilesToKnowledge: Boolean(firstRow.persist_files_to_knowledge ?? true),
            legalDatabaseEnabled: Boolean(firstRow.legal_database_enabled ?? true),
            autoSkillLoadingEnabled: Boolean(firstRow.auto_skill_loading_enabled ?? true),
            webSearchEnabled: Boolean(firstRow.web_search_enabled ?? true),
            tags: undefined,
            isStreaming: false,
            hasUnreadMessages,
            pendingApproval,
            lastMessageRole: (firstRow.last_message_role as "assistant" | "user" | "system") || undefined,
            lastMessagePreview: (firstRow.last_message_preview as string) || undefined,
            processingFileCount: Number(firstRow.processing_file_count) || 0
        }

        if (conversation.projectId) {
            this.logger.debug(`Conversation ${conversation.id} has project ${conversation.projectId} with name: ${conversation.projectName || "NULL"}`)
        }

        return conversation
    }

    private async buildConversationWithMessagesFromJoinedResults(results: unknown[]): Promise<ConversationWithMessages | null> {
        if (!results || results.length === 0) {
            return null
        }

        const firstRow = results[0] as Record<string, unknown>
        const messagesMap = new Map<string, Message>()

        for (const row of results) {
            const r = row as Record<string, unknown>
            if (r.message_id && !messagesMap.has(r.message_id as string)) {
                messagesMap.set(r.message_id as string, {
                    id: r.message_id as string,
                    conversationId: r.id as string,
                    role: r.role as "user" | "assistant" | "system",
                    updatedAt: this.formatUTCTimestamp(r.message_created_at as string),
                    steps: []
                })
            }
        }

        const messages = Array.from(messagesMap.values())

        // Fetch message steps for all messages
        for (const message of messages) {
            const steps = await this.getMessageSteps(message.id)
            if (steps.length > 0) {
                message.steps = steps
                // Use the latest step's updated_at as the message's updatedAt
                const latestStep = steps.reduce((latest, step) => (step.updatedAt > latest.updatedAt ? step : latest))
                message.updatedAt = latestStep.updatedAt
            }
        }

        const messageCount = messages.length
        const lastMessageAt =
            messages.length > 0
                ? messages.reduce((latest, message) => ((message.updatedAt || "") > (latest.updatedAt || "") ? message : latest)).updatedAt || (firstRow.created_at as string)
                : (firstRow.created_at as string)

        const lastReadAt = firstRow.last_read_at ? new Date(this.formatUTCTimestamp(firstRow.last_read_at as string)) : null
        const lastMsgAt = new Date(lastMessageAt)
        const hasUnreadMessages = lastReadAt === null ? messages.length > 0 : lastMsgAt > lastReadAt

        const conversation: ConversationWithMessages = {
            id: firstRow.id as string,
            projectId: firstRow.project_id ? (firstRow.project_id as string) : undefined,
            projectName: (firstRow.project_name as string) || undefined,
            title: firstRow.title as string,
            createdAt: this.formatUTCTimestamp(firstRow.created_at as string),
            updatedAt: this.formatUTCTimestamp(firstRow.updated_at as string),
            messageCount,
            lastMessageAt,
            messages,
            summary: (firstRow.ai_summary as string) || undefined,
            thinkingModeEnabled: Boolean(firstRow.thinking_mode_enabled),
            persistFilesToKnowledge: Boolean(firstRow.persist_files_to_knowledge ?? true),
            legalDatabaseEnabled: Boolean(firstRow.legal_database_enabled ?? true),
            autoSkillLoadingEnabled: Boolean(firstRow.auto_skill_loading_enabled ?? true),
            webSearchEnabled: Boolean(firstRow.web_search_enabled ?? true),
            tags: undefined,
            isStreaming: false,
            hasUnreadMessages,
            pendingApproval: null,
            processingFileCount: Number(firstRow.processing_file_count) || 0
        }

        if (conversation.projectId) {
            this.logger.debug(`Conversation ${conversation.id} has project ${conversation.projectId} with name: ${conversation.projectName || "NULL"}`)
        }

        return conversation
    }

    private groupConversationFromJoinedResults(results: unknown[]): Conversation[] {
        if (!results || results.length === 0) {
            return []
        }

        const conversationMap = new Map<string, Record<string, unknown>[]>()

        for (const row of results) {
            const r = row as Record<string, unknown>
            const conversationId = r.id as string
            if (!conversationMap.has(conversationId)) {
                conversationMap.set(conversationId, [])
            }
            const existingRows = conversationMap.get(conversationId)
            if (existingRows) {
                existingRows.push(r)
            }
        }

        const conversations: Conversation[] = []
        for (const rows of conversationMap.values()) {
            const conversation = this.buildConversationFromJoinedResults(rows)
            if (conversation) {
                conversations.push(conversation)
            }
        }

        return conversations
    }

    async insertMessage(id: string, conversationId: string, role: "user" | "assistant" | "system", content?: string, attachedSkill?: LLMSkill | null): Promise<Message> {
        try {
            const messageId = id

            this.logger.debug("Inserting message", {
                id: messageId,
                conversationId: conversationId,
                role: role
            })

            await this.db.executeQuery(
                `
                INSERT INTO message (
                    id, conversation_id, role,
                    input_tokens, output_tokens, thinking_tokens, total_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
                [messageId, conversationId, role, 0, 0, 0, 0]
            )

            // Create a content step for user messages if content is provided (including empty string for file-only messages)
            if (content !== undefined) {
                const stepId = uuidv4()
                await this.createContentStep(messageId, stepId, content)
                if (attachedSkill) {
                    await this.insertSkill(attachedSkill, stepId)
                }
            }

            // Return the message data directly since we have all the info
            const message: Message = {
                id: messageId,
                conversationId: conversationId,
                role: role,
                updatedAt: this.formatUTCTimestamp(new Date().toISOString()),
                steps: []
            }

            // If we created a content step, fetch and include it
            if (content !== undefined) {
                message.steps = await this.getMessageSteps(messageId)
                // Use the latest step's updated_at as the message's updatedAt
                if (message.steps.length > 0) {
                    const latestStep = message.steps.reduce((latest, step) => (step.updatedAt > latest.updatedAt ? step : latest))
                    message.updatedAt = latestStep.updatedAt
                }
            }

            this.logger.debug("Message inserted successfully", { id: messageId })
            return message
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error inserting message", {
                conversationId: conversationId,
                error: errorMessage
            })
            throw error
        }
    }

    async updateMessageTokenUsage(id: string, inputTokens: number, outputTokens: number, thinkingTokens: number, totalTokens: number): Promise<boolean> {
        try {
            this.logger.debug("Updating message token usage", {
                id,
                inputTokens,
                outputTokens,
                thinkingTokens,
                totalTokens
            })

            const result = (await this.db.executeQuery(
                `
                UPDATE message 
                SET input_tokens = ?, output_tokens = ?, thinking_tokens = ?, total_tokens = ?
                WHERE id = ?
            `,
                [inputTokens, outputTokens, thinkingTokens, totalTokens, id]
            )) as QueryResult

            const success = (result.changes ?? 0) > 0
            this.logger.debug("Message token usage update result", {
                id,
                success,
                changes: result.changes
            })
            return success
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating message token usage", { id, error: errorMessage })
            throw error
        }
    }

    async deleteMessage(id: string): Promise<boolean> {
        try {
            this.logger.debug("Deleting message", { id })

            const result = (await this.db.executeQuery("DELETE FROM message WHERE id = ?", [id])) as QueryResult

            const success = (result.changes ?? 0) > 0
            this.logger.debug("Message deletion result", { id, success, changes: result.changes })
            return success
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error deleting message", { id, error: errorMessage })
            throw error
        }
    }

    async getMessageSteps(messageId: string): Promise<MessageStep[]> {
        try {
            const stepResults = (await this.db.executeQuery(
                `
                SELECT
                    ms.id, ms.message_id, ms.step_type, ms.content,
                    ms.created_at, ms.updated_at, ms.error_message, ms.finished_at,
                    te.tool_call_id, te.tool_name, te.arguments, te.result, te.status, te.approval_id,
                    sk.slug AS skill_slug, sk.title AS skill_title, sk.description AS skill_description, sk.body AS skill_body,
                    json_group_array(json_object(
                        'id', f.id, 'name', f.name, 'sizeBytes', f.size_bytes,
                        'processingStatus', f.processing_status, 'processingError', f.processing_error,
                        'backupFileUrl', f.backup_filename,
                        'extractedText', f.extracted_text, 'aiSummary', f.ai_summary, 'createdAt', f.created_at,
                        'source', f.source
                    )) FILTER (WHERE f.id IS NOT NULL) as attached_files
                FROM message_step ms
                LEFT JOIN tool_execution te ON ms.id = te.step_id
                LEFT JOIN file f ON f.step_id = ms.id
                LEFT JOIN folder fo ON f.folder_id = fo.id
                LEFT JOIN attached_skill sk ON sk.message_step_id = ms.id
                WHERE ms.message_id = ?
                GROUP BY ms.id
                ORDER BY ms.rowid ASC
                `,
                [messageId]
            )) as unknown[]

            if (!stepResults || stepResults.length === 0) {
                return []
            }

            const steps: MessageStep[] = []

            for (const row of stepResults) {
                const r = row as Record<string, unknown>

                const filesJson = r.attached_files as string | null
                const parsedFiles = filesJson ? JSON.parse(filesJson) : []
                const attachedFiles = parsedFiles.map((file: Record<string, unknown>) => ({
                    ...file,
                    backupFileUrl: this.backupFilePath(file.backupFileUrl as string | null),
                    source: this.parseFileSource(file.source as string | null)
                }))

                const skillSlug = r.skill_slug as string | null
                const attachedSkill = skillSlug
                    ? {
                          id: skillSlug,
                          title: r.skill_title as string,
                          description: r.skill_description as string,
                          body: r.skill_body as string
                      }
                    : undefined

                const baseStep = {
                    id: r.id as string,
                    messageId: r.message_id as string,
                    createdAt: this.formatUTCTimestamp(r.created_at as string),
                    updatedAt: this.formatUTCTimestamp(r.updated_at as string),
                    errorMessage: r.error_message as string | undefined,
                    attachedFiles,
                    attachedSkill
                }

                const stepType = r.step_type as string

                switch (stepType) {
                    case "thinking":
                        steps.push({
                            ...baseStep,
                            stepType: "thinking" as const,
                            thinkingContent: r.content as string,
                            finishedAt: r.finished_at ? this.formatUTCTimestamp(r.finished_at as string) : null
                        })
                        break
                    case "content":
                        steps.push({
                            ...baseStep,
                            stepType: "content" as const,
                            content: r.content as string
                        })
                        break
                    case "tool_execution":
                        steps.push({
                            ...this.mapRowToToolExecutionStep(r),
                            attachedFiles
                        })
                        break
                    default:
                        this.logger.warn(`Skipping step with unknown type: ${stepType}`)
                }
            }

            return steps
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error(`Failed to fetch message steps for message ${messageId}:`, errorMessage)
            throw error
        }
    }

    async getAllMessages(conversationId: string): Promise<Message[]> {
        try {
            this.logger.debug(`Selecting messages for conversation: ${conversationId}`)

            const results = (await this.db.executeQuery(
                `
                SELECT
                    id, conversation_id, role, input_tokens, output_tokens, thinking_tokens, total_tokens, created_at
                FROM message
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                `,
                [conversationId]
            )) as unknown[]

            if (!results || results.length === 0) {
                this.logger.debug(`No messages found for conversation: ${conversationId}`)
                return []
            }

            const messages: Message[] = results.map(row => {
                const r = row as Record<string, unknown>

                return {
                    id: r.id as string,
                    conversationId: r.conversation_id as string,
                    role: r.role as "user" | "assistant" | "system",
                    inputTokens: r.input_tokens as number,
                    outputTokens: r.output_tokens as number,
                    thinkingTokens: r.thinking_tokens as number,
                    totalTokens: r.total_tokens as number,
                    createdAt: r.created_at as string,
                    steps: []
                }
            })

            // Fetch message steps for all messages
            for (const message of messages) {
                const steps = await this.getMessageSteps(message.id)
                if (steps.length > 0) {
                    message.steps = steps
                    // Use the latest step's updated_at as the message's updatedAt
                    const latestStep = steps.reduce((latest, step) => (step.updatedAt > latest.updatedAt ? step : latest))
                    message.updatedAt = latestStep.updatedAt
                }
            }

            this.logger.debug(`Found ${messages.length} messages for conversation: ${conversationId}`)
            return messages
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error(`Failed to fetch messages for conversation ${conversationId}:`, errorMessage)
            throw new Error(`Failed to fetch messages for conversation ${conversationId}`)
        }
    }

    async insert(request: CreateConversationRequest): Promise<Conversation> {
        try {
            const id = uuidv4()
            this.logger.debug(`Inserting conversation with id: ${id}`)

            await this.db.executeQuery(
                `INSERT INTO conversation (id, title, project_id, legal_database_enabled, auto_skill_loading_enabled, web_search_enabled)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, "", request.projectId || null, request.legalDatabaseEnabled === false ? 0 : 1, request.autoSkillLoadingEnabled === false ? 0 : 1, request.webSearchEnabled === false ? 0 : 1]
            )

            const results = (await this.db.executeQuery(
                `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    NULL as last_message_role,
                    NULL as last_message_preview
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                WHERE c.id = ?
                ORDER BY m.created_at ASC
                `,
                [id]
            )) as unknown[]

            const conversation = this.buildConversationFromJoinedResults(results)
            if (!conversation) {
                throw new Error(`Failed to retrieve inserted conversation with id: ${id}`)
            }

            this.logger.debug(`Conversation inserted successfully: ${conversation.id}`)
            return conversation
        } catch (error) {
            this.logger.error("Failed to insert conversation:", error)
            throw new Error("Failed to insert conversation")
        }
    }

    async getConversationWithMessagesById(conversationId: string): Promise<ConversationWithMessages | null> {
        try {
            this.logger.debug(`Selecting conversation by id: ${conversationId}`)

            const results = (await this.db.executeQuery(
                `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                WHERE c.id = ?
                ORDER BY m.created_at ASC
                `,
                [conversationId]
            )) as unknown[]

            if (!results || results.length === 0) {
                this.logger.debug(`Conversation not found with id: ${conversationId}`)
                return null
            }

            const conversation = await this.buildConversationWithMessagesFromJoinedResults(results)
            if (!conversation) {
                this.logger.debug(`Conversation not found with id: ${conversationId}`)
                return null
            }

            this.logger.debug(`Conversation found: ${conversation.title}`)
            return conversation
        } catch (error) {
            this.logger.error(`Failed to fetch conversation ${conversationId}:`, error)
            throw new Error(`Failed to fetch conversation ${conversationId}`)
        }
    }

    async getConversationById(conversationId: string): Promise<Conversation | null> {
        try {
            this.logger.debug(`Selecting conversation metadata by id: ${conversationId}`)

            const results = (await this.db.executeQuery(
                `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    (SELECT role FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_role,
                    (
                        SELECT SUBSTR(COALESCE(ms.content, te.tool_name), 1, 400)
                        FROM message last_msg
                        JOIN message_step ms ON ms.message_id = last_msg.id
                        LEFT JOIN tool_execution te ON te.step_id = ms.id
                        WHERE last_msg.conversation_id = c.id
                        ORDER BY last_msg.created_at DESC, ms.rowid DESC
                        LIMIT 1
                    ) as last_message_preview,
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                WHERE c.id = ?
                ORDER BY m.created_at ASC
                `,
                [conversationId]
            )) as unknown[]

            if (!results || results.length === 0) {
                this.logger.debug(`Conversation not found with id: ${conversationId}`)
                return null
            }

            const conversation = this.buildConversationFromJoinedResults(results)
            if (!conversation) {
                this.logger.debug(`Conversation not found with id: ${conversationId}`)
                return null
            }

            this.logger.debug(`Conversation metadata found: ${conversation.title}`)
            return conversation
        } catch (error) {
            this.logger.error(`Failed to fetch conversation metadata ${conversationId}:`, error)
            throw new Error(`Failed to fetch conversation metadata ${conversationId}`)
        }
    }

    async getConversationByStepId(stepId: string): Promise<Conversation | null> {
        try {
            const results = (await this.db.executeQuery(`SELECT m.conversation_id FROM message_step ms JOIN message m ON ms.message_id = m.id WHERE ms.id = ?`, [stepId])) as unknown[]

            if (!results || results.length === 0) return null

            const row = results[0] as Record<string, unknown>
            const conversationId = row.conversation_id as string
            return this.getConversationById(conversationId)
        } catch (error) {
            this.logger.error(`Failed to fetch conversation by step id ${stepId}:`, error)
            return null
        }
    }

    async getAllConversations(): Promise<Conversation[]> {
        try {
            this.logger.debug("Selecting all conversations")

            const results = (await this.db.executeQuery(
                `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    (SELECT role FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_role,
                    (
                        SELECT SUBSTR(COALESCE(ms.content, te.tool_name), 1, 400)
                        FROM message last_msg
                        JOIN message_step ms ON ms.message_id = last_msg.id
                        LEFT JOIN tool_execution te ON te.step_id = ms.id
                        WHERE last_msg.conversation_id = c.id
                        ORDER BY last_msg.created_at DESC, ms.rowid DESC
                        LIMIT 1
                    ) as last_message_preview,
                    ${PENDING_APPROVAL_SUBQUERIES}
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                ORDER BY c.updated_at DESC, m.created_at ASC
                `,
                []
            )) as unknown[]

            const conversations = this.groupConversationFromJoinedResults(results)

            conversations.sort((a, b) => {
                const dateA = new Date(a.lastMessageAt).getTime()
                const dateB = new Date(b.lastMessageAt).getTime()
                return dateB - dateA
            })

            this.logger.debug(`Found ${conversations.length} conversations`)
            return conversations
        } catch (error) {
            this.logger.error("Failed to fetch conversations:", error)
            throw new Error("Failed to fetch conversations")
        }
    }

    async getConversationsByProjectId(request: GetConversationsByProjectRequest): Promise<Conversation[]> {
        try {
            this.logger.debug("Selecting conversations by project ID", {
                projectId: request.projectId
            })

            const sql =
                request.projectId === null
                    ? `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    (SELECT role FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_role,
                    (
                        SELECT SUBSTR(COALESCE(ms.content, te.tool_name), 1, 400)
                        FROM message last_msg
                        JOIN message_step ms ON ms.message_id = last_msg.id
                        LEFT JOIN tool_execution te ON te.step_id = ms.id
                        WHERE last_msg.conversation_id = c.id
                        ORDER BY last_msg.created_at DESC, ms.rowid DESC
                        LIMIT 1
                    ) as last_message_preview,
                    ${PENDING_APPROVAL_SUBQUERIES}
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                WHERE c.project_id IS NULL
                ORDER BY c.updated_at DESC, m.created_at ASC
                `
                    : `
                SELECT
                    c.id, c.project_id, c.title, c.ai_summary, c.thinking_mode_enabled, c.created_at, c.updated_at, c.last_read_at,
                    c.persist_files_to_knowledge,
                    c.legal_database_enabled,
                    c.auto_skill_loading_enabled,
                    c.web_search_enabled,
                    p.name as project_name,
                    m.id as message_id, m.role, m.input_tokens, m.output_tokens, m.thinking_tokens, m.total_tokens, m.created_at as message_created_at,
                    (SELECT role FROM message WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_role,
                    (
                        SELECT SUBSTR(COALESCE(ms.content, te.tool_name), 1, 400)
                        FROM message last_msg
                        JOIN message_step ms ON ms.message_id = last_msg.id
                        LEFT JOIN tool_execution te ON te.step_id = ms.id
                        WHERE last_msg.conversation_id = c.id
                        ORDER BY last_msg.created_at DESC, ms.rowid DESC
                        LIMIT 1
                    ) as last_message_preview,
                    ${PENDING_APPROVAL_SUBQUERIES}
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                LEFT JOIN project p ON c.project_id = p.id
                LEFT JOIN message m ON c.id = m.conversation_id
                WHERE c.project_id = ?
                ORDER BY c.updated_at DESC, m.created_at ASC
                `
            const params = request.projectId === null ? [] : [request.projectId]

            const results = (await this.db.executeQuery(sql, params)) as unknown[]

            const conversations = this.groupConversationFromJoinedResults(results)

            conversations.sort((a, b) => {
                const dateA = new Date(a.lastMessageAt).getTime()
                const dateB = new Date(b.lastMessageAt).getTime()
                return dateB - dateA
            })

            this.logger.debug(`Found ${conversations.length} conversations for project ${request.projectId}`)
            return conversations
        } catch (error) {
            this.logger.error(`Failed to fetch conversations for project ${request.projectId}:`, error)
            throw new Error(`Failed to fetch conversations for project ${request.projectId}`)
        }
    }

    async update(request: UpdateConversationRequest): Promise<boolean> {
        try {
            this.logger.debug(`Updating conversation ${request.conversationId} with data:`, request)

            const updateFields: string[] = []
            const params: (string | number | null)[] = []

            if (request.title !== undefined) {
                updateFields.push("title = ?")
                params.push(request.title)
            }

            if (request.aiSummary !== undefined) {
                updateFields.push("ai_summary = ?")
                params.push(request.aiSummary)
            }

            if (request.persistFilesToKnowledge !== undefined) {
                updateFields.push("persist_files_to_knowledge = ?")
                params.push(request.persistFilesToKnowledge ? 1 : 0)
            }

            if (request.legalDatabaseEnabled !== undefined) {
                updateFields.push("legal_database_enabled = ?")
                params.push(request.legalDatabaseEnabled ? 1 : 0)
            }

            if (request.projectId !== undefined) {
                const existing = this.db.executeQuery("SELECT project_id FROM conversation WHERE id = ?", [request.conversationId]) as Array<{ project_id: string | null }>
                if (!existing || existing.length === 0) {
                    throw new Error(`Conversation ${request.conversationId} not found`)
                }
                if (existing[0].project_id !== null) {
                    throw new Error(`Conversation ${request.conversationId} already belongs to a project`)
                }
                updateFields.push("project_id = ?")
                params.push(request.projectId)
            }

            if (request.autoSkillLoadingEnabled !== undefined) {
                updateFields.push("auto_skill_loading_enabled = ?")
                params.push(request.autoSkillLoadingEnabled ? 1 : 0)
            }

            if (request.webSearchEnabled !== undefined) {
                updateFields.push("web_search_enabled = ?")
                params.push(request.webSearchEnabled ? 1 : 0)
            }

            if (updateFields.length === 0) {
                this.logger.debug("No fields to update")
                return false
            }

            params.push(request.conversationId)

            const sql = `UPDATE conversation SET ${updateFields.join(", ")} WHERE id = ?`

            await this.db.executeQuery(sql, params)

            this.logger.debug(`Conversation ${request.conversationId} updated successfully`)
            return true
        } catch (error) {
            if (error instanceof Error && error.message.includes("already belongs to a project")) {
                throw error
            }
            this.logger.error(`Failed to update conversation ${request.conversationId}:`, error)
            throw new Error(`Failed to update conversation ${request.conversationId}`)
        }
    }

    async delete(request: DeleteConversationRequest): Promise<boolean> {
        try {
            this.logger.debug(`Deleting conversation with id: ${request.conversationId}`)

            const result = await this.db.executeQuery("DELETE FROM conversation WHERE id = ?", [request.conversationId])

            const success = result ? true : false
            this.logger.debug(`Conversation ${request.conversationId} deletion result: ${success}`)
            return success
        } catch (error) {
            this.logger.error(`Failed to delete conversation ${request.conversationId}:`, error)
            throw new Error(`Failed to delete conversation ${request.conversationId}`)
        }
    }

    async createThinkingStep(messageId: string, stepId: string, thinkingContent?: string | null, errorMessage?: string): Promise<ThinkingStep> {
        try {
            await this.db.executeQuery(`INSERT INTO message_step (id, message_id, step_type, content, error_message) VALUES (?, ?, ?, ?, ?)`, [
                stepId,
                messageId,
                "thinking",
                thinkingContent,
                errorMessage || null
            ])

            // Fetch the created step
            const result = (await this.db.executeQuery(`SELECT * FROM message_step WHERE id = ?`, [stepId])) as unknown[]

            const row = result[0] as Record<string, unknown>
            return {
                id: row.id as string,
                messageId: row.message_id as string,
                stepType: "thinking",
                thinkingContent: (row.content as string) || "",
                createdAt: this.formatUTCTimestamp(row.created_at as string),
                updatedAt: this.formatUTCTimestamp(row.updated_at as string),
                errorMessage: (row.error_message as string) || undefined,
                finishedAt: null,
                attachedFiles: []
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.logger.error("Error creating thinking step", { messageId, error: errorMsg })
            throw error
        }
    }

    async insertSkill(skill: LLMSkill, messageStepId: string): Promise<void> {
        await this.db.executeQuery(`INSERT INTO attached_skill (id, message_step_id, slug, title, description, body, author, language, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            uuidv4(),
            messageStepId,
            skill.id,
            skill.title,
            skill.description,
            skill.body,
            skill.author,
            skill.language,
            skill.source
        ])
    }

    async createContentStep(messageId: string, stepId: string, content: string, errorMessage?: string): Promise<ContentStep> {
        try {
            await this.db.executeQuery(`INSERT INTO message_step (id, message_id, step_type, content, error_message) VALUES (?, ?, ?, ?, ?)`, [
                stepId,
                messageId,
                "content",
                content,
                errorMessage || null
            ])

            // Fetch the created step
            const result = (await this.db.executeQuery(`SELECT * FROM message_step WHERE id = ?`, [stepId])) as unknown[]

            const row = result[0] as Record<string, unknown>
            return {
                id: row.id as string,
                messageId: row.message_id as string,
                stepType: "content",
                content: (row.content as string) || "",
                attachedFiles: [],
                createdAt: this.formatUTCTimestamp(row.created_at as string),
                updatedAt: this.formatUTCTimestamp(row.updated_at as string),
                errorMessage: (row.error_message as string) || undefined
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.logger.error("Error creating content step", { messageId, error: errorMsg })
            throw error
        }
    }

    async createToolExecutionStep(
        messageId: string,
        stepId: string,
        toolCallId: string,
        toolName: string,
        args?: Record<string, unknown>,
        toolResult?: UserInputToolResult,
        errorMessage?: string
    ): Promise<ToolExecutionStep> {
        try {
            this.logger.debug(`Creating tool execution step:`, {
                messageId,
                stepId,
                toolCallId,
                toolName,
                args,
                errorMessage
            })
            // Insert message step first
            await this.db.executeQuery(`INSERT INTO message_step (id, message_id, step_type, error_message) VALUES (?, ?, ?, ?)`, [stepId, messageId, "tool_execution", errorMessage || null])

            // Then insert tool execution with pending status
            await this.db.executeQuery(`INSERT INTO tool_execution (id, step_id, tool_call_id, tool_name, arguments, result, status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                uuidv4(),
                stepId,
                toolCallId,
                toolName,
                args ? JSON.stringify(args) : null,
                toolResult ? JSON.stringify(toolResult) : null,
                "pending"
            ])

            // Fetch the created step with tool execution data
            const result = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM message_step ms
                 JOIN tool_execution te ON ms.id = te.step_id
                 WHERE ms.id = ?`,
                [stepId]
            )) as unknown[]

            return this.mapRowToToolExecutionStep(result[0] as Record<string, unknown>)
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.logger.error("Error creating tool execution step", { messageId, error: errorMsg })
            throw error
        }
    }

    async updateToolExecutionResult(stepId: string, result?: UserInputToolResult, errorMessage?: string): Promise<ToolExecutionStep> {
        try {
            this.logger.debug(`Updating tool execution result:`, {
                stepId,
                result,
                errorMessage
            })
            const status = errorMessage ? "error" : "completed"

            // Update tool execution with result and status
            await this.db.executeQuery(`UPDATE tool_execution SET result = ?, error_message = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE step_id = ?`, [
                result ? JSON.stringify(result) : null,
                errorMessage || null,
                status,
                stepId
            ])

            // Update message step error if present
            if (errorMessage) {
                await this.db.executeQuery(`UPDATE message_step SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [errorMessage, stepId])
            }

            // Fetch the updated step
            const result_query = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM message_step ms
                 JOIN tool_execution te ON ms.id = te.step_id
                 WHERE ms.id = ?`,
                [stepId]
            )) as unknown[]

            return this.mapRowToToolExecutionStep(result_query[0] as Record<string, unknown>)
        } catch (error) {
            this.logger.error(`Error updating tool execution result:`, error)
            throw error
        }
    }

    async updateToolExecutionResultByToolCallId(toolCallId: string, result?: Record<string, unknown>, errorMessage?: string): Promise<ToolExecutionStep> {
        try {
            this.logger.debug(`Updating tool execution result by toolCallId:`, {
                toolCallId,
                result,
                errorMessage
            })
            const status = errorMessage ? "error" : "completed"

            // Update tool execution with result and status using tool_call_id
            await this.db.executeQuery(`UPDATE tool_execution SET result = ?, error_message = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE tool_call_id = ?`, [
                result ? JSON.stringify(result) : null,
                errorMessage || null,
                status,
                toolCallId
            ])

            // Update message step error if present (using subquery to get step_id)
            if (errorMessage) {
                await this.db.executeQuery(`UPDATE message_step SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT step_id FROM tool_execution WHERE tool_call_id = ?)`, [
                    errorMessage,
                    toolCallId
                ])
            }

            // Fetch the updated step by tool_call_id
            const result_query = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM message_step ms
                 JOIN tool_execution te ON ms.id = te.step_id
                 WHERE te.tool_call_id = ?`,
                [toolCallId]
            )) as unknown[]

            return this.mapRowToToolExecutionStep(result_query[0] as Record<string, unknown>)
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating tool execution result by toolCallId", { toolCallId, error: errorMsg })
            throw error
        }
    }

    async updateThinkingStepContent(stepId: string, thinkingContent: string): Promise<ThinkingStep> {
        try {
            const result = (await this.db.executeQuery(`UPDATE message_step SET content = ? WHERE id = ? AND step_type = 'thinking'`, [thinkingContent, stepId])) as QueryResult

            const updated = (result.changes ?? 0) > 0
            if (!updated) {
                throw new Error(`No thinking step found with id ${stepId}`)
            }

            // Fetch the complete updated step
            const stepResult = (await this.db.executeQuery(`SELECT * FROM message_step WHERE id = ?`, [stepId])) as unknown[]

            const row = stepResult[0] as Record<string, unknown>
            return {
                id: row.id as string,
                messageId: row.message_id as string,
                stepType: "thinking",
                thinkingContent: (row.content as string) || "",
                createdAt: this.formatUTCTimestamp(row.created_at as string),
                updatedAt: this.formatUTCTimestamp(row.updated_at as string),
                errorMessage: (row.error_message as string) || undefined,
                finishedAt: row.finished_at ? this.formatUTCTimestamp(row.finished_at as string) : null,
                attachedFiles: []
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating thinking step content", {
                stepId,
                error: errorMessage
            })
            throw error
        }
    }

    async finalizeThinkingStep(stepId: string): Promise<void> {
        try {
            await this.db.executeQuery(`UPDATE message_step SET finished_at = ? WHERE id = ? AND step_type = 'thinking'`, [new Date().toISOString(), stepId])
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating thinking step content", {
                stepId,
                error: errorMessage
            })
            throw error
        }
    }

    async getThinkingStep(stepId: string): Promise<ThinkingStep | null> {
        try {
            const result = (await this.db.executeQuery(`SELECT * FROM message_step WHERE id = ? AND step_type = 'thinking'`, [stepId])) as unknown[]

            if (!result || result.length === 0) {
                return null
            }

            const row = result[0] as Record<string, unknown>
            return {
                id: row.id as string,
                messageId: row.message_id as string,
                stepType: "thinking" as const,
                thinkingContent: row.content as string,
                createdAt: this.formatUTCTimestamp(row.created_at as string),
                updatedAt: this.formatUTCTimestamp(row.updated_at as string),
                errorMessage: row.error_message as string | undefined,
                finishedAt: row.finished_at ? this.formatUTCTimestamp(row.finished_at as string) : null,
                attachedFiles: []
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting thinking step", {
                stepId,
                error: errorMessage
            })
            throw error
        }
    }

    async appendContentStepContent(stepId: string, delta: string): Promise<void> {
        try {
            const result = (await this.db.executeQuery(`UPDATE message_step SET content = COALESCE(content, '') || ? WHERE id = ? AND step_type = 'content'`, [delta, stepId])) as QueryResult
            if ((result.changes ?? 0) === 0) {
                throw new Error(`No content step found with id ${stepId}`)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error appending content step content", { stepId, error: errorMessage })
            throw error
        }
    }

    async updateContentStepContent(stepId: string, content: string): Promise<ContentStep> {
        try {
            const result = (await this.db.executeQuery(`UPDATE message_step SET content = ? WHERE id = ? AND step_type = 'content'`, [content, stepId])) as QueryResult

            const updated = (result.changes ?? 0) > 0
            if (!updated) {
                throw new Error(`No content step found with id ${stepId}`)
            }

            // Fetch the complete updated step
            const stepResult = (await this.db.executeQuery(`SELECT * FROM message_step WHERE id = ?`, [stepId])) as unknown[]

            const row = stepResult[0] as Record<string, unknown>
            return {
                id: row.id as string,
                messageId: row.message_id as string,
                stepType: "content",
                content: (row.content as string) || "",
                attachedFiles: [],
                createdAt: this.formatUTCTimestamp(row.created_at as string),
                updatedAt: this.formatUTCTimestamp(row.updated_at as string),
                errorMessage: (row.error_message as string) || undefined
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating content step content", {
                stepId,
                error: errorMessage
            })
            throw error
        }
    }

    async getMessageById(messageId: string): Promise<Message> {
        try {
            const messages = (await this.db.executeQuery(`SELECT * FROM message WHERE id = ?`, [messageId])) as unknown[]

            if (!messages || messages.length === 0) {
                throw new Error(`Message not found: ${messageId}`)
            }

            const messageRow = messages[0] as Record<string, unknown>
            const steps = await this.getMessageSteps(messageId)

            // Use the latest step's updated_at as the message's updatedAt
            let updatedAt = this.formatUTCTimestamp(messageRow.created_at as string)
            if (steps.length > 0) {
                const latestStep = steps.reduce((latest, step) => (step.updatedAt > latest.updatedAt ? step : latest))
                updatedAt = latestStep.updatedAt
            }

            return {
                id: messageRow.id as string,
                conversationId: messageRow.conversation_id as string,
                role: messageRow.role as "user" | "assistant" | "system",
                updatedAt,
                steps
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error getting message by ID", { messageId, error: errorMessage })
            throw error
        }
    }

    async updateToolExecutionStep(stepId: string, result: Record<string, unknown>, status: "completed" | "error"): Promise<void> {
        try {
            this.logger.debug(`Updating tool execution step: ${stepId}`)

            const resultJson = JSON.stringify(result)
            await this.db.executeQuery("UPDATE message_step SET result = ?, status = ? WHERE id = ? AND step_type = ?", [resultJson, status, stepId, "tool_execution"])

            this.logger.debug(`Successfully updated tool execution step: ${stepId}`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error updating tool execution step", { stepId, error: errorMessage })
            throw error
        }
    }

    async deleteMessagesFrom(conversationId: string, fromMessageId: string, inclusive: boolean): Promise<boolean> {
        try {
            const operator = inclusive ? ">=" : ">"
            this.logger.debug(`Deleting messages from ${fromMessageId} (inclusive: ${inclusive})`)

            const result = (await this.db.executeQuery(
                `DELETE FROM message
                 WHERE conversation_id = ?
                   AND rowid ${operator} (SELECT rowid FROM message WHERE id = ?)`,
                [conversationId, fromMessageId]
            )) as QueryResult

            const deletedCount = result.changes ?? 0
            this.logger.debug(`Deleted ${deletedCount} messages`)
            return deletedCount > 0
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error deleting messages", {
                fromMessageId,
                error: errorMessage
            })
            throw error
        }
    }

    async attachFilesToStep(stepId: string, fileIds: string[]): Promise<void> {
        if (fileIds.length === 0) {
            return
        }
        this.logger.debug(`Attaching ${fileIds.length} files to step: ${stepId}`)

        const placeholders = fileIds.map(() => "?").join(",")
        await this.db.executeQuery(`UPDATE file SET step_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [stepId, ...fileIds])
    }

    async detachFilesFromStep(stepId: string, fileIds: string[]): Promise<void> {
        if (fileIds.length === 0) {
            return
        }
        this.logger.debug(`Detaching ${fileIds.length} files from step: ${stepId}`)

        const placeholders = fileIds.map(() => "?").join(",")
        await this.db.executeQuery(`UPDATE file SET step_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE step_id = ? AND id IN (${placeholders})`, [stepId, ...fileIds])
    }

    async markConversationAsRead(conversationId: string): Promise<void> {
        try {
            this.logger.debug(`Marking conversation as read: ${conversationId}`)

            await this.db.executeQuery(`UPDATE conversation SET last_read_at = CURRENT_TIMESTAMP WHERE id = ?`, [conversationId])

            this.logger.debug(`Marked conversation as read: ${conversationId}`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error marking conversation as read", {
                conversationId,
                error: errorMessage
            })
            throw error
        }
    }

    async markIncompleteToolCallsAsError(messageId: string): Promise<number> {
        try {
            this.logger.debug(`Marking incomplete tool calls as error for message: ${messageId}`)

            const result = (await this.db.executeQuery(
                `UPDATE tool_execution SET status = 'error'
                 WHERE step_id IN (
                     SELECT ms.id FROM message_step ms
                     JOIN tool_execution te ON ms.id = te.step_id
                     WHERE ms.message_id = ? AND te.status IN ('pending', 'running')
                 )`,
                [messageId]
            )) as QueryResult

            const updatedCount = result.changes ?? 0
            this.logger.debug(`Marked ${updatedCount} incomplete tool calls as error for message: ${messageId}`)
            return updatedCount
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error marking incomplete tool calls as error", {
                messageId,
                error: errorMessage
            })
            throw error
        }
    }

    async findAwaitingApprovalStep(conversationId: string): Promise<ToolExecutionStep | null> {
        try {
            const results = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM tool_execution te
                 JOIN message_step ms ON ms.id = te.step_id
                 JOIN message msg ON msg.id = ms.message_id
                 WHERE msg.conversation_id = ? AND te.status = 'awaiting_approval'
                 ORDER BY ms.created_at DESC
                 LIMIT 1`,
                [conversationId]
            )) as unknown[]

            if (results.length === 0) return null
            return this.mapRowToToolExecutionStep(results[0] as Record<string, unknown>)
        } catch (error) {
            this.logger.error("Error finding awaiting approval step", { conversationId, error })
            throw error
        }
    }

    async findToolExecutionStepByToolCallId(toolCallId: string): Promise<ToolExecutionStep | null> {
        try {
            const results = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM tool_execution te
                 JOIN message_step ms ON ms.id = te.step_id
                 WHERE te.tool_call_id = ?
                 LIMIT 1`,
                [toolCallId]
            )) as unknown[]

            if (results.length === 0) return null
            return this.mapRowToToolExecutionStep(results[0] as Record<string, unknown>)
        } catch (error) {
            this.logger.error("Error finding tool execution step by toolCallId", { toolCallId, error })
            throw error
        }
    }

    async getAwaitingApprovalStepById(stepId: string): Promise<ToolExecutionStep | null> {
        try {
            const results = (await this.db.executeQuery(
                `SELECT ${ConversationRepository.TOOL_EXECUTION_SELECT}
                 FROM tool_execution te
                 JOIN message_step ms ON ms.id = te.step_id
                 WHERE ms.id = ? AND te.status = 'awaiting_approval'
                 LIMIT 1`,
                [stepId]
            )) as unknown[]

            if (results.length === 0) return null
            return this.mapRowToToolExecutionStep(results[0] as Record<string, unknown>)
        } catch (error) {
            this.logger.error("Error getting awaiting approval step by id", { stepId, error })
            throw error
        }
    }

    async updateToolExecutionApproval(stepId: string, status: ToolExecutionStatus, approvalId: string): Promise<void> {
        try {
            await this.db.executeQuery(`UPDATE tool_execution SET status = ?, approval_id = ?, updated_at = CURRENT_TIMESTAMP WHERE step_id = ?`, [status, approvalId, stepId])
        } catch (error) {
            this.logger.error("Error updating tool execution approval", { stepId, status, approvalId, error })
            throw error
        }
    }

    async updateToolExecutionStatus(stepId: string, status: ToolExecutionStatus, errorMessage?: string): Promise<void> {
        try {
            await this.db.executeQuery(`UPDATE tool_execution SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE step_id = ?`, [status, errorMessage || null, stepId])
            if (errorMessage) {
                await this.db.executeQuery(`UPDATE message_step SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [errorMessage, stepId])
            }
        } catch (error) {
            this.logger.error("Error updating tool execution status", { stepId, status, error })
            throw error
        }
    }

    async markAllIncompleteToolCallsAsError(): Promise<number> {
        try {
            const result = (await this.db.executeQuery(
                `UPDATE tool_execution SET status = 'error', error_message = 'Tool execution interrupted by application shutdown'
                 WHERE status IN ('pending', 'running')`
            )) as QueryResult

            const updatedCount = result.changes ?? 0
            if (updatedCount > 0) {
                this.logger.info(`Marked ${updatedCount} incomplete tool calls as error during startup cleanup`)
            }
            return updatedCount
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.logger.error("Error marking all incomplete tool calls as error", { error: errorMessage })
            throw error
        }
    }

    async getConversationProcessingFileCountsForProject(projectId: string): Promise<{ id: string; processingFileCount: number }[]> {
        try {
            const results = (await this.db.executeQuery(
                `
                SELECT
                    c.id,
                    ${PROCESSING_FILE_COUNT_QUERY}
                FROM conversation c
                WHERE c.project_id = ?
                `,
                [projectId]
            )) as unknown[]

            if (!results || !Array.isArray(results)) {
                return []
            }

            return results.map(row => {
                const r = row as Record<string, unknown>
                return {
                    id: r.id as string,
                    processingFileCount: Number(r.processing_file_count) || 0
                }
            })
        } catch (error) {
            this.logger.error(`Failed to fetch processing file counts for project ${projectId}:`, error)
            throw new Error(`Failed to fetch processing file counts for project ${projectId}`)
        }
    }
}
