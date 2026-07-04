import { randomUUID } from "node:crypto"
import type { DatabaseManager } from "../Database/DatabaseManager"
import type { Logger } from "../logging/FileLogger"

export interface ChatRow {
    id: string
    title: string
    created_at: number
    updated_at: number
}

export interface ChatMessageRow {
    id: string
    chat_id: string
    role: "user" | "assistant"
    content: string
    tool_calls: string | null
    created_at: number
}

export class ChatRepository {
    constructor(
        private readonly db: DatabaseManager,
        private readonly logger: Logger
    ) {}

    createChat(title = "New chat"): ChatRow {
        const id = randomUUID()
        this.db.executeQuery(
            "INSERT INTO chats (id, title) VALUES (?, ?)",
            [id, title]
        )
        const rows = this.db.executeQuery("SELECT * FROM chats WHERE id = ?", [id]) as ChatRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        this.logger.debug("Chat created", { id })
        return list[0] as ChatRow
    }

    findAllChats(): ChatRow[] {
        const rows = this.db.executeQuery("SELECT * FROM chats ORDER BY updated_at DESC") as ChatRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    findChatById(id: string): ChatRow | null {
        const rows = this.db.executeQuery("SELECT * FROM chats WHERE id = ?", [id]) as ChatRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] ?? null
    }

    findMessagesByChat(chatId: string): ChatMessageRow[] {
        const rows = this.db.executeQuery(
            "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC",
            [chatId]
        ) as ChatMessageRow[] | unknown
        return Array.isArray(rows) ? rows : []
    }

    appendMessage(chatId: string, role: "user" | "assistant", content: string, toolCalls?: unknown): ChatMessageRow {
        const id = randomUUID()
        this.db.executeQuery(
            "INSERT INTO chat_messages (id, chat_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)",
            [id, chatId, role, content, toolCalls !== undefined ? JSON.stringify(toolCalls) : null]
        )
        this.db.executeQuery("UPDATE chats SET updated_at = strftime('%s', 'now') WHERE id = ?", [chatId])
        const rows = this.db.executeQuery("SELECT * FROM chat_messages WHERE id = ?", [id]) as ChatMessageRow[] | unknown
        const list = Array.isArray(rows) ? rows : []
        return list[0] as ChatMessageRow
    }

    updateChatTitle(chatId: string, title: string): void {
        this.db.executeQuery("UPDATE chats SET title = ? WHERE id = ?", [title, chatId])
    }
}
