import { registerIpcHandler } from "../ipc/registerIpcHandler"
import type { Logger } from "../logging/FileLogger"
import type { ChatRepository, ChatMessageRow } from "./ChatRepository"
import type { AssistantService } from "./AssistantService"
import { AllowedChannelIpc } from "@/common/types/AllowedChannelIpc"
import { ResultFactory } from "@/common/types/Result"
import type { ChatMessage } from "@/common/types/ChatTypes"

function toChatMessage(row: ChatMessageRow): ChatMessage {
    return {
        ...row,
        tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : null
    }
}

export function setupIpcHandlersForChat(chatRepository: ChatRepository, assistantService: AssistantService, logger: Logger): void {
    registerIpcHandler(AllowedChannelIpc.ChatsGetAll, () => {
        return ResultFactory.success(chatRepository.findAllChats())
    })

    registerIpcHandler(AllowedChannelIpc.ChatsCreate, () => {
        return ResultFactory.success(chatRepository.createChat())
    })

    registerIpcHandler(AllowedChannelIpc.ChatsGetMessages, (_, ...args) => {
        const chatId = args[0] as string
        return ResultFactory.success(chatRepository.findMessagesByChat(chatId).map(toChatMessage))
    })

    registerIpcHandler(AllowedChannelIpc.AssistantSend, (_, ...args) => {
        const chatId = args[0] as string
        const text = args[1] as string
        // Fire-and-forget: progress is delivered via the stream-chunk/stream-done push channels,
        // not the invoke's return value, since a single response can't carry a token stream.
        assistantService.sendMessage(chatId, text).catch(error => {
            logger.error("Unhandled assistant send error", { chatId, error })
        })
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.AssistantStop, (_, ...args) => {
        const chatId = args[0] as string
        assistantService.stop(chatId)
        return ResultFactory.success(undefined)
    })

    registerIpcHandler(AllowedChannelIpc.AssistantReload, (_, ...args) => {
        const chatId = args[0] as string
        const messageId = args[1] as string
        // Fire-and-forget, same as assistant:send -- progress is delivered via the stream-chunk/
        // stream-done push channels.
        assistantService.reloadMessage(chatId, messageId).catch(error => {
            logger.error("Unhandled assistant reload error", { chatId, messageId, error })
        })
        return ResultFactory.success(undefined)
    })
}
