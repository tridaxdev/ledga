import { useState, useEffect, useCallback } from "react"
import { getLedgaAPI } from "./apiClient"
import type { Chat } from "@/common/types/ChatTypes"

export function useChats() {
    const [chats, setChats] = useState<Chat[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const refetch = useCallback(async () => {
        setIsLoading(true)
        const result = await getLedgaAPI().chats.getAll()
        if (result.kind === "success") setChats(result.value)
        setIsLoading(false)
    }, [])

    useEffect(() => {
        refetch()
    }, [refetch])

    useEffect(() => {
        return getLedgaAPI().chats.onUpdated(refetch)
    }, [refetch])

    const createChat = useCallback(async () => {
        const result = await getLedgaAPI().chats.create()
        if (result.kind === "success") setChats(prev => [result.value, ...prev])
        return result
    }, [])

    return { chats, isLoading, refetch, createChat }
}
