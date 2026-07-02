import { streamText, tool, type ModelMessage } from "ai"
import { google } from "@ai-sdk/google"
import { z } from "zod"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import type { ToolCallRecord, ChatMessage } from "@/common/types/ChatTypes"
import type { ChatRepository, ChatMessageRow } from "./ChatRepository"
import type { TransactionRepository } from "../transactions/TransactionRepository"
import type { CategoryRepository } from "../categories/CategoryRepository"
import type { MainWindowNotificationService } from "../windowManagement/MainWindowNotification"
import type { Logger } from "../logging/FileLogger"

const MODEL_ID = "gemini-2.0-flash"
const MAX_HISTORY_MESSAGES = 20
const MAX_TITLE_LENGTH = 48
const SEARCH_ROW_LIMIT = 300

function toChatMessage(row: ChatMessageRow): ChatMessage {
    return {
        ...row,
        tool_calls: row.tool_calls ? (JSON.parse(row.tool_calls) as ToolCallRecord[]) : null
    }
}

export class AssistantService {
    private readonly activeStreams = new Map<string, AbortController>()

    constructor(
        private readonly chatRepository: ChatRepository,
        private readonly transactionRepository: TransactionRepository,
        private readonly categoryRepository: CategoryRepository,
        private readonly notificationService: MainWindowNotificationService,
        private readonly logger: Logger
    ) {}

    stop(chatId: string): void {
        this.activeStreams.get(chatId)?.abort()
        this.activeStreams.delete(chatId)
    }

    private searchTransactionsTool() {
        return tool({
            description:
                "Search the user's local transaction ledger. Use this for any question about spending, income, " +
                "or specific transactions -- never guess or estimate numbers without calling this first.",
            inputSchema: z.object({
                dateFrom: z.string().optional().describe("ISO date (YYYY-MM-DD), inclusive start of range"),
                dateTo: z.string().optional().describe("ISO date (YYYY-MM-DD), inclusive end of range"),
                category: z.string().optional().describe("Category display name, e.g. 'Groceries' or 'Subscriptions'"),
                keyword: z.string().optional().describe("Merchant name keyword to search for")
            }),
            execute: async ({ dateFrom, dateTo, category, keyword }) => {
                const from = dateFrom && !Number.isNaN(Date.parse(dateFrom))
                    ? Math.floor(new Date(`${dateFrom}T00:00:00Z`).getTime() / 1000)
                    : undefined
                const to = dateTo && !Number.isNaN(Date.parse(dateTo))
                    ? Math.floor(new Date(`${dateTo}T23:59:59Z`).getTime() / 1000)
                    : undefined
                const categoryId = category ? this.categoryRepository.findIdByDisplayName(category) ?? undefined : undefined
                // The model can't ground its answer correctly if it doesn't know a category name
                // didn't resolve (the query would otherwise silently run unfiltered) -- surface it
                // explicitly rather than pretending the filter was applied.
                const categoryResolved = !category || categoryId !== undefined
                const categoryNameById = new Map(this.categoryRepository.findAll().map(c => [c.id, c.name]))

                const rows = this.transactionRepository.findAll({ from, to, categoryId, search: keyword, limit: SEARCH_ROW_LIMIT })
                return {
                    count: rows.length,
                    // Tells the model explicitly when results were capped, so it doesn't report the
                    // capped count as a true total for a broad, unfiltered query.
                    truncated: rows.length === SEARCH_ROW_LIMIT,
                    categoryResolved,
                    transactions: rows.map(r => ({
                        date: new Date(r.timestamp * 1000).toISOString().slice(0, 10),
                        merchant: r.merchant,
                        amount: r.amount,
                        type: r.type,
                        category: r.category_id ? (categoryNameById.get(r.category_id) ?? null) : null
                    }))
                }
            }
        })
    }

    private buildHistory(chatId: string): ModelMessage[] {
        const rows = this.chatRepository.findMessagesByChat(chatId)
        return rows.slice(-MAX_HISTORY_MESSAGES).map(row => ({
            role: row.role,
            content: row.content
        }))
    }

    async sendMessage(chatId: string, userText: string): Promise<void> {
        // Cancel any stream already running for this chat first, rather than letting a second
        // concurrent call silently overwrite the first's AbortController in activeStreams (which
        // would leave the first stream un-cancellable via stop() and race both calls' appendMessage
        // ordering).
        this.stop(chatId)

        const abortController = new AbortController()
        this.activeStreams.set(chatId, abortController)

        let fullText = ""
        const toolCalls = new Map<string, ToolCallRecord>()

        try {
            this.chatRepository.appendMessage(chatId, "user", userText)
            this.maybeSetTitleFromFirstMessage(chatId, userText)
            const messages = this.buildHistory(chatId)

            const result = streamText({
                model: google(MODEL_ID),
                system:
                    "You are Ledga's assistant, a general financial assistant for the user's local, private " +
                    `ledger. Today's date is ${new Date().toISOString().slice(0, 10)}. You read the ledger, ` +
                    "you never move money or make changes. Always call search_transactions to ground any " +
                    "figures you state -- never estimate. If a result says truncated: true or " +
                    "categoryResolved: false, say so rather than presenting the numbers as complete or " +
                    "correctly filtered. Keep answers concise.",
                messages,
                tools: { search_transactions: this.searchTransactionsTool() },
                abortSignal: abortController.signal
            })

            let wasAborted = false
            for await (const part of result.fullStream) {
                if (part.type === "text-delta") {
                    fullText += part.text
                    this.notificationService.notifyMainWindow(AllowedChannelIpc.AssistantStreamChunk, {
                        chatId,
                        delta: part.text
                    })
                } else if (part.type === "tool-call") {
                    toolCalls.set(part.toolCallId, { toolCallId: part.toolCallId, toolName: part.toolName, input: part.input })
                } else if (part.type === "tool-result") {
                    const existing = toolCalls.get(part.toolCallId)
                    toolCalls.set(part.toolCallId, {
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        input: existing?.input ?? part.input,
                        output: part.output
                    })
                } else if (part.type === "tool-error") {
                    const existing = toolCalls.get(part.toolCallId)
                    toolCalls.set(part.toolCallId, {
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        input: existing?.input ?? part.input,
                        output: { error: part.error instanceof Error ? part.error.message : String(part.error) }
                    })
                } else if (part.type === "abort") {
                    // Stopping doesn't throw in this SDK -- it closes the stream normally with an
                    // "abort" part instead, so this has to be tracked explicitly rather than relying
                    // on the catch block below (which would otherwise never run for a user-initiated
                    // stop, and the code after this loop would persist whatever text/tool state had
                    // accumulated as if the turn completed normally).
                    wasAborted = true
                } else if (part.type === "error") {
                    // streamText() doesn't throw for provider/API errors (e.g. missing or invalid
                    // API key, rate limits) -- they arrive as a part in the stream instead. Without
                    // this branch, a failed request silently produces an empty assistant message
                    // with no error shown anywhere (caught live: a missing API key resulted in a
                    // blank persisted message and no feedback to the user at all).
                    throw part.error instanceof Error ? part.error : new Error(String(part.error))
                }
            }

            if (wasAborted) {
                this.finishAborted(chatId, fullText, toolCalls)
            } else {
                // Google's API rejects empty-content turns in the next request's history, so a
                // no-op reply (no text, no tool calls -- shouldn't normally happen once the stream
                // completes cleanly, but guard it anyway) is dropped rather than persisted, which
                // would otherwise permanently break every subsequent turn in this chat.
                if (!fullText && toolCalls.size === 0) {
                    this.notificationService.notifyMainWindow(AllowedChannelIpc.AssistantStreamDone, { chatId, message: null })
                    return
                }
                const savedRow = this.chatRepository.appendMessage(
                    chatId,
                    "assistant",
                    fullText,
                    toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined
                )
                this.notificationService.notifyMainWindow(AllowedChannelIpc.AssistantStreamDone, {
                    chatId,
                    message: toChatMessage(savedRow)
                })
                this.notificationService.notifyMainWindow(AllowedChannelIpc.ChatsUpdated, undefined)
            }
        } catch (error) {
            if (abortController.signal.aborted) {
                this.finishAborted(chatId, fullText, toolCalls)
            } else {
                this.logger.error("Assistant stream failed", { chatId, error: error instanceof Error ? error.message : String(error) })
                this.notificationService.notifyMainWindow(AllowedChannelIpc.AssistantStreamError, {
                    chatId,
                    error: error instanceof Error ? error.message : String(error)
                })
                // The chat's title may already have been set from the user's message
                // (maybeSetTitleFromFirstMessage) regardless of whether the assistant reply
                // succeeded -- without this, a failed first turn leaves the new chat's real title
                // invisible in the nav list.
                this.notificationService.notifyMainWindow(AllowedChannelIpc.ChatsUpdated, undefined)
            }
        } finally {
            // Only clear this chat's entry if it's still *this* call's controller -- a newer
            // sendMessage for the same chat already replaced it (see the this.stop(chatId) call
            // above), and deleting unconditionally here would remove that newer entry instead.
            if (this.activeStreams.get(chatId) === abortController) {
                this.activeStreams.delete(chatId)
            }
        }
    }

    private finishAborted(chatId: string, fullText: string, toolCalls: Map<string, ToolCallRecord>): void {
        // Stopped by the user -- persist whatever text streamed in before the abort so the
        // conversation isn't left with an invisible gap, rather than treating it as an error.
        let savedRow: ChatMessageRow | null = null
        if (fullText || toolCalls.size > 0) {
            savedRow = this.chatRepository.appendMessage(chatId, "assistant", fullText, toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined)
            this.notificationService.notifyMainWindow(AllowedChannelIpc.ChatsUpdated, undefined)
        }
        this.notificationService.notifyMainWindow(AllowedChannelIpc.AssistantStreamDone, {
            chatId,
            message: savedRow ? toChatMessage(savedRow) : null
        })
    }

    private maybeSetTitleFromFirstMessage(chatId: string, userText: string): void {
        const chat = this.chatRepository.findChatById(chatId)
        if (!chat || chat.title !== "New chat") return
        const title = userText.trim().slice(0, MAX_TITLE_LENGTH) || "New chat"
        this.chatRepository.updateChatTitle(chatId, title)
    }
}
