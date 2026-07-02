export interface Chat {
    id: string
    title: string
    created_at: number
    updated_at: number
}

export interface ToolCallRecord {
    toolCallId: string
    toolName: string
    input: unknown
    output?: unknown
}

export interface ChatMessage {
    id: string
    chat_id: string
    role: "user" | "assistant"
    content: string
    tool_calls: ToolCallRecord[] | null
    created_at: number
}

export interface AssistantStreamChunkEvent {
    chatId: string
    delta: string
}

export interface AssistantStreamDoneEvent {
    chatId: string
    // null when the stream was stopped before any text was produced.
    message: ChatMessage | null
}

export interface AssistantStreamErrorEvent {
    chatId: string
    error: string
}
