import { useState, useEffect, useCallback, useRef } from "react"
import { getLedgaAPI } from "./apiClient"
import type { ChatMessage } from "@/common/types/ChatTypes"

export function useAssistant(chatId: string) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [streamingText, setStreamingText] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const chatIdRef = useRef(chatId)
    chatIdRef.current = chatId

    const refetch = useCallback(async () => {
        const result = await getLedgaAPI().chats.getMessages(chatId)
        if (result.kind === "success") setMessages(result.value)
    }, [chatId])

    useEffect(() => {
        setStreamingText("")
        setIsStreaming(false)
        setError(null)
        refetch()
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().assistant.onStreamChunk(event => {
            if (event.chatId !== chatIdRef.current) return
            setStreamingText(prev => prev + event.delta)
        })
    }, [])

    useEffect(() => {
        return getLedgaAPI().assistant.onStreamDone(event => {
            if (event.chatId !== chatIdRef.current) return
            setIsStreaming(false)
            setStreamingText("")
            refetch()
        })
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().assistant.onStreamError(event => {
            if (event.chatId !== chatIdRef.current) return
            setIsStreaming(false)
            setStreamingText("")
            setError(event.error)
            refetch()
        })
    }, [refetch])

    const send = useCallback(
        async (text: string) => {
            if (!text.trim() || isStreaming) return
            setError(null)
            setIsStreaming(true)
            setMessages(prev => [...prev, { id: `pending-${Date.now()}`, chat_id: chatId, role: "user", content: text, tool_calls: null, created_at: Math.floor(Date.now() / 1000) }])
            await getLedgaAPI().assistant.send(chatId, text)
        },
        [chatId, isStreaming]
    )

    const reload = useCallback(
        async (messageId: string) => {
            if (isStreaming) return
            setError(null)
            setIsStreaming(true)
            // Optimistically drop this message and everything after it so the UI doesn't keep
            // showing stale replies while the regenerated response streams in -- the eventual
            // refetch() on stream-done will reconcile with what the main process actually kept.
            setMessages(prev => {
                const index = prev.findIndex(m => m.id === messageId)
                return index === -1 ? prev : prev.slice(0, index)
            })
            await getLedgaAPI().assistant.reload(chatId, messageId)
        },
        [chatId, isStreaming]
    )

    const stop = useCallback(async () => {
        await getLedgaAPI().assistant.stop(chatId)
    }, [chatId])

    return { messages, streamingText, isStreaming, isThinking: isStreaming && streamingText === "", error, send, reload, stop }
}
